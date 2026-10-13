import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CLI_BIN, killTree } from './renderQueue.js';

const TIMEOUT_MS = 120_000;

export async function snapshotFrames(html, times, { prepare } = {}) {
  return inProject(html, prepare, async (dir) => {
    const at = times.map((t) => Number(t).toFixed(2)).join(',');
    const res = await runHf(dir, ['snapshot', '--at', at, '--no-end', '--describe', 'false', '-o', 'shots', '.']);
    const files = (await fs.readdir(path.join(dir, 'shots')).catch(() => [])).filter((f) => f.endsWith('.png')).sort();
    if (!files.length) throw new Error(`Snapshot failed. ${res.tail}`.trim());
    return Promise.all(
      files.map(async (f) => ({ name: f, data: (await fs.readFile(path.join(dir, 'shots', f))).toString('base64') })),
    );
  });
}

export async function checkComposition(html, { prepare } = {}) {
  return inProject(html, prepare, async (dir) => {
    const res = await runHf(dir, ['check', '--json', '--samples', '7', '.']);
    let report;
    try {
      report = JSON.parse(res.stdout.slice(res.stdout.indexOf('{')));
    } catch {
      throw new Error(`Check did not return a report. ${res.tail}`.trim());
    }
    const issues = [];
    for (const [stage, block] of Object.entries(report)) {
      for (const f of block?.findings ?? []) {
        if (f.severity === 'info') continue;
        issues.push({ stage, severity: f.severity, code: f.code, message: f.message, selector: f.selector, time: f.time, fix: f.fixHint });
      }
    }
    return { ok: report.ok, issues: issues.slice(0, 40) };
  });
}

async function inProject(html, prepare, fn) {
  const dir = path.join(os.tmpdir(), 'hyperframes-studio', `inspect-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  try {
    await prepare?.(dir);
    await fs.writeFile(path.join(dir, 'index.html'), html, 'utf8');
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function runHf(cwd, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_BIN, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => killTree(child), TIMEOUT_MS);
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr = (stderr + c).slice(-4000)));
    child.on('close', (code) => {
      clearTimeout(timer);
      const tail = `${stderr}\n${stdout}`.trim().split(/\r?\n/).slice(-4).join(' ');
      resolve({ code, stdout, tail });
    });
  });
}
