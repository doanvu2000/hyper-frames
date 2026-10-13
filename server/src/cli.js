import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { killTree } from './renderQueue.js';

export const MCP_NAME = 'hyperframes-studio';

export const CLIS = {
  'claude-cli': {
    label: 'Claude CLI',
    app: 'Claude Code',
    bin: 'claude',
    install: 'npm install -g @anthropic-ai/claude-code',
    login: 'claude auth login',
    async auth() {
      const res = await runCommand('claude', ['auth', 'status', '--json'], { timeoutMs: 15000 });
      try {
        const status = JSON.parse(res.stdout);
        if (!status.loggedIn) return { loggedIn: false, detail: 'Not signed in. Run "claude auth login".' };
        const plan = status.subscriptionType ? ` · ${status.subscriptionType} plan` : '';
        return { loggedIn: true, detail: `Signed in with ${status.authMethod === 'claude.ai' ? 'Claude account' : status.authMethod}${plan}` };
      } catch {
        return { loggedIn: false, detail: 'Could not read the sign-in status. Run "claude auth status" in a terminal.' };
      }
    },
    async mcpRegistered() {
      try {
        const dir = process.env.CLAUDE_CONFIG_DIR || os.homedir();
        const config = JSON.parse(await fs.readFile(path.join(dir, '.claude.json'), 'utf8'));
        return Boolean(config.mcpServers?.[MCP_NAME]);
      } catch {
        return false;
      }
    },
    addMcp: (url) => ['mcp', 'add', '--scope', 'user', '--transport', 'http', MCP_NAME, url],
    removeMcp: () => ['mcp', 'remove', '--scope', 'user', MCP_NAME],
  },
  'codex-cli': {
    label: 'Codex CLI',
    app: 'Codex',
    bin: 'codex',
    install: 'npm install -g @openai/codex',
    login: 'codex login',
    async auth() {
      const res = await runCommand('codex', ['login', 'status'], { timeoutMs: 15000 });
      const line = `${res.stdout}\n${res.stderr}`.trim().split(/\r?\n/).filter(Boolean).pop() ?? '';
      return res.code === 0 ? { loggedIn: true, detail: line || 'Signed in' } : { loggedIn: false, detail: 'Not signed in. Run "codex login".' };
    },
    async mcpRegistered() {
      const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
      try {
        const toml = await fs.readFile(path.join(home, 'config.toml'), 'utf8');
        return new RegExp(`^\\[mcp_servers\\.["']?${MCP_NAME}["']?\\]`, 'm').test(toml);
      } catch {
        return false;
      }
    },
    addMcp: (url) => ['mcp', 'add', MCP_NAME, '--url', url],
    removeMcp: () => ['mcp', 'remove', MCP_NAME],
  },
};

export async function probeCli(id) {
  const cli = CLIS[id];
  const version = await runCommand(cli.bin, ['--version'], { timeoutMs: 15000 });
  if (version.code !== 0) {
    return { installed: false, loggedIn: false, version: null, detail: `Not installed. Install with "${cli.install}".`, mcpRegistered: false };
  }
  const [auth, mcpRegistered] = await Promise.all([cli.auth(), cli.mcpRegistered()]);
  return { installed: true, version: version.stdout.trim().split(/\s+/).find((w) => /^\d+\.\d+/.test(w)) ?? null, ...auth, mcpRegistered };
}

// The CLIs are npm shims (.cmd/.ps1) on Windows, which only start through a shell. Node 24 deprecates
// passing an args array together with shell: true, so build one quoted command line instead.
export function runCommand(bin, args, { input, signal, timeoutMs, cwd, onStdout } = {}) {
  return new Promise((resolve) => {
    const child = spawn([bin, ...args].map(quoteArg).join(' '), {
      shell: true,
      cwd,
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    let stdout = '';
    let stderr = '';
    let lineBuffer = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ stdout, stderr, ...result });
    };
    const onAbort = () => {
      killTree(child);
      finish({ code: null, aborted: true });
    };
    const timer = timeoutMs ? setTimeout(() => (killTree(child), finish({ code: null, timedOut: true })), timeoutMs) : null;
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stdout += text;
      if (!onStdout) return;
      lineBuffer += text;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop();
      for (const line of lines) if (line.trim()) onStdout(line);
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-8000);
    });
    child.on('error', (err) => finish({ code: -1, stderr: err.message }));
    child.on('close', (code) => {
      if (onStdout && lineBuffer.trim()) onStdout(lineBuffer);
      finish({ code });
    });
    if (input != null) child.stdin.end(input, 'utf8');
    else child.stdin.end();
  });
}

function quoteArg(arg) {
  const s = String(arg);
  if (/^[\w\-.:/\\=@,]+$/.test(s)) return s;
  return `"${s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}
