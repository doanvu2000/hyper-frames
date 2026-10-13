import { EventEmitter } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const cliPackage = require.resolve('hyperframes/package.json');
export const CLI_BIN = path.join(path.dirname(cliPackage), 'bin', 'hyperframes.mjs');
export const CLI_VERSION = require('hyperframes/package.json').version;

export const OUTPUT_EXT = { mp4: 'mp4', webm: 'webm', mov: 'mov', gif: 'gif' };
const PROGRESS_PREFIX = '@hf-progress ';
const LOG_TAIL = 60;
const FINISHED = new Set(['done', 'failed', 'cancelled']);

export class RenderQueue extends EventEmitter {
  constructor(dataDir) {
    super();
    this.dataDir = dataDir;
    this.jobs = new Map();
    this.pending = [];
    this.active = null;
  }

  async load() {
    await fs.mkdir(this.dataDir, { recursive: true });
    for (const entry of await fs.readdir(this.dataDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const job = JSON.parse(await fs.readFile(path.join(this.dataDir, entry.name, 'job.json'), 'utf8'));
        if (!FINISHED.has(job.status)) {
          Object.assign(job, { status: 'failed', error: 'The server stopped before this render finished. Render it again.' });
          await this.#persist(job);
        }
        this.jobs.set(job.id, job);
      } catch {
        // Folder without a readable job.json: leave it alone, it is not ours.
      }
    }
  }

  list() {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicJob);
  }

  get(id) {
    return this.jobs.get(id);
  }

  async enqueue({ html, name, meta, fps, quality, format, prepare }) {
    const id = randomUUID();
    const dir = path.join(this.dataDir, id);
    await fs.mkdir(dir, { recursive: true });
    await prepare?.(dir);
    await fs.writeFile(path.join(dir, 'index.html'), html, 'utf8');
    const job = {
      id,
      name,
      ...meta,
      fps,
      quality,
      format,
      status: 'queued',
      stage: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      file: `output.${OUTPUT_EXT[format]}`,
      size: null,
      error: null,
      log: [],
    };
    this.jobs.set(id, job);
    this.pending.push(id);
    await this.#persist(job);
    this.#emit(job);
    this.#next();
    return publicJob(job);
  }

  async cancel(id) {
    const job = this.jobs.get(id);
    if (!job || FINISHED.has(job.status)) return job;
    this.pending = this.pending.filter((p) => p !== id);
    job.cancelRequested = true;
    if (this.active?.id === id) killTree(this.active.child);
    else await this.#finish(job, { status: 'cancelled' });
    return job;
  }

  async remove(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    const running = this.active?.id === id ? this.active.child : null;
    const closed = running ? new Promise((resolve) => running.once('close', resolve)) : null;
    await this.cancel(id);
    if (closed) await closed;
    this.jobs.delete(id);
    await fs.rm(path.join(this.dataDir, id), { recursive: true, force: true });
    this.emit('removed', id);
    return true;
  }

  filePath(job) {
    return path.join(this.dataDir, job.id, job.file);
  }

  #next() {
    if (this.active || this.pending.length === 0) return;
    const job = this.jobs.get(this.pending.shift());
    if (!job) return this.#next();
    this.#run(job);
  }

  #run(job) {
    const dir = path.join(this.dataDir, job.id);
    const args = [CLI_BIN, 'render', '-o', job.file, '-f', String(job.fps), '-q', job.quality, '--format', job.format];
    const child = spawn(process.execPath, args, {
      cwd: dir,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' },
      windowsHide: true,
    });
    this.active = { id: job.id, child };
    Object.assign(job, { status: 'running', stage: 'starting', startedAt: new Date().toISOString() });
    this.#persist(job);
    this.#emit(job);

    let buffer = '';
    const onChunk = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n|\r/);
      buffer = lines.pop();
      for (const line of lines) this.#onLine(job, line);
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.on('error', (err) => job.log.push(`spawn error: ${err.message}`));
    child.on('close', async (code) => {
      if (buffer) this.#onLine(job, buffer);
      this.active = null;
      if (job.cancelRequested) {
        await this.#finish(job, { status: 'cancelled' });
      } else if (code === 0) {
        const stat = await fs.stat(this.filePath(job)).catch(() => null);
        await this.#finish(
          job,
          stat ? { status: 'done', progress: 100, stage: 'done', size: stat.size } : { status: 'failed', error: 'The render finished but no output file was written.' },
        );
      } else {
        await this.#finish(job, { status: 'failed', error: summarizeFailure(job.log, code) });
      }
      this.#next();
    });
  }

  #onLine(job, raw) {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, '').trimEnd();
    if (!line.trim()) return;
    if (line.startsWith(PROGRESS_PREFIX)) {
      try {
        const p = JSON.parse(line.slice(PROGRESS_PREFIX.length));
        job.stage = p.code ?? job.stage;
        job.progress = Math.max(job.progress, Number(p.pct) || 0);
        this.#emit(job);
      } catch {
        // Partial or unexpected progress line; the next one will carry the state.
      }
      return;
    }
    job.log.push(line);
    if (job.log.length > LOG_TAIL) job.log.shift();
  }

  async #finish(job, patch) {
    Object.assign(job, patch, { finishedAt: new Date().toISOString() });
    delete job.cancelRequested;
    await this.#persist(job);
    this.#emit(job);
  }

  async #persist(job) {
    const { cancelRequested, ...data } = job;
    await fs.writeFile(path.join(this.dataDir, job.id, 'job.json'), JSON.stringify(data, null, 2)).catch(() => {});
  }

  #emit(job) {
    this.emit('job', publicJob(job));
  }
}

function publicJob(job) {
  const { log, cancelRequested, ...rest } = job;
  return rest;
}

function summarizeFailure(log, code) {
  const flagged = log.filter((l) => /error|fail|not found|cannot|unable/i.test(l) && !l.includes('[INFO]'));
  const lines = (flagged.length ? flagged : log).slice(-4);
  return lines.length ? lines.join('\n') : `HyperFrames exited with code ${code}.`;
}

// Chrome workers are grandchildren of the CLI; on Windows a plain kill() leaves them running.
function killTree(child) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else {
    child.kill('SIGTERM');
  }
}

export function ffmpegAvailable() {
  const res = spawnSync('ffmpeg', ['-version'], { windowsHide: true });
  return res.status === 0 ? String(res.stdout).split('\n')[0].trim() : null;
}
