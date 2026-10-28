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
const AV = ['-map', '0:v?', '-map', '0:a?'];
const TRIM_ARGS = {
  mp4: [...AV, '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'],
  webm: [...AV, '-c:v', 'libvpx-vp9', '-crf', '24', '-b:v', '0', '-pix_fmt', 'yuva420p', '-c:a', 'libopus'],
  mov: [...AV, '-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuva444p10le', '-c:a', 'pcm_s16le'],
  gif: ['-filter_complex', '[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a', '-loop', '0'],
};

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
    const closed = this.active?.id === id ? this.active.settled : null;
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

  stopAll() {
    if (this.active) killTree(this.active.child);
  }

  #run(job) {
    const dir = path.join(this.dataDir, job.id);
    const args = [CLI_BIN, 'render', '-o', job.file, '-f', String(job.fps), '-q', job.quality, '--format', job.format];
    const child = spawn(process.execPath, args, {
      cwd: dir,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' },
      windowsHide: true,
      detached: process.platform !== 'win32',
    });
    let settle;
    this.active = { id: job.id, child, settled: new Promise((resolve) => (settle = resolve)) };
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
      if (job.cancelRequested) {
        await this.#finish(job, { status: 'cancelled' });
      } else if (code === 0) {
        const stat = await fs.stat(this.filePath(job)).catch(() => null);
        if (!stat) await this.#finish(job, { status: 'failed', error: 'The render finished but no output file was written.' });
        else if (job.range) await this.#trim(job).catch((err) => this.#finish(job, { status: 'failed', error: `Cutting the in–out range failed: ${err.message}` }));
        else await this.#finish(job, { status: 'done', progress: 100, stage: 'done', size: stat.size });
      } else {
        await this.#finish(job, { status: 'failed', error: summarizeFailure(job.log, code) });
      }
      this.active = null;
      settle();
      this.#next();
    });
  }

  // The CLI has no start/end option, so the full composition is rendered and cut here. Re-encoding
  // (not stream copy) keeps the cut frame-accurate instead of snapping to keyframes.
  async #trim(job) {
    const { start, end } = job.range;
    const output = this.filePath(job);
    const temp = path.join(path.dirname(output), `trim.${OUTPUT_EXT[job.format]}`);
    Object.assign(job, { stage: 'trim' });
    this.#emit(job);
    const args = ['-hide_banner', '-y', '-ss', String(start), '-i', output, '-t', String(end - start), ...TRIM_ARGS[job.format], temp];
    const result = await new Promise((resolve) => {
      if (job.cancelRequested) return resolve({ cancelled: true });
      const child = spawn('ffmpeg', args, { windowsHide: true, detached: process.platform !== 'win32' });
      this.active.child = child;
      let stderr = '';
      let done = false;
      const finish = (res) => !done && (done = true) && resolve(res);
      child.stderr.on('data', (c) => (stderr = (stderr + c).slice(-4000)));
      child.on('error', (err) => finish({ code: -1, tail: err.code === 'ENOENT' ? 'ffmpeg was not found on PATH.' : err.message }));
      child.on('close', (code) => finish({ code, tail: stderr.trim().split(/\r?\n/).at(-1) ?? '' }));
    });
    if (job.cancelRequested || result.cancelled) {
      await fs.rm(temp, { force: true });
      return this.#finish(job, { status: 'cancelled' });
    }
    if (result.code !== 0) {
      await fs.rm(temp, { force: true });
      return this.#finish(job, { status: 'failed', error: `Cutting the in–out range failed: ${result.tail || `ffmpeg exited with code ${result.code}.`}` });
    }
    await fs.rename(temp, output);
    const stat = await fs.stat(output);
    const patch = { status: 'done', progress: 100, stage: 'done', size: stat.size };
    if (job.duration) patch.duration = Math.round(Math.min(end - start, job.duration - start) * 100) / 100;
    await this.#finish(job, patch);
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

// Chrome workers are grandchildren of the CLI; a plain kill() leaves them running. On macOS and Linux
// children start detached (own process group), so signalling the negative pid reaches the whole group.
export function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

export function ffmpegAvailable() {
  const res = spawnSync('ffmpeg', ['-version'], { windowsHide: true });
  return res.status === 0 ? String(res.stdout).split('\n')[0].trim() : null;
}
