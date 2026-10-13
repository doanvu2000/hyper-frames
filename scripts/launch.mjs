import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 8787);
const URL = `http://127.0.0.1:${PORT}`;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) fail(`HyperFrames needs Node.js 22 or newer. This machine has ${process.version}. Install it from https://nodejs.org`);

if (!fs.existsSync(path.join(root, 'node_modules', 'hyperframes')) || depsChanged()) {
  step('Installing dependencies (about a minute)');
  run(npm, ['install', '--no-audit', '--no-fund']);
}

if (webIsStale()) {
  step('Preparing the interface');
  run(npm, ['run', 'build']);
}

const running = await health();
if (running) {
  const serverChanged = newestMtime(walk(path.join(root, 'server', 'src'))) > (running.bootedAt ?? 0);
  if (!serverChanged) {
    step('Studio is already running');
    openBrowser();
    process.exit(0);
  }
  if (!running.pid) {
    fail('An older version of the studio is still running. Close its window (or stop it in Task Manager: node.exe), then open the studio again.');
  }
  if (running.busy) {
    console.warn('\n  ! The studio was updated, but a render is still running in the open studio window.');
    console.warn('    Close that window when the render finishes, then open the studio again to load the update.\n');
    openBrowser();
    process.exit(0);
  }
  step('Restarting the studio to load the update');
  try {
    process.kill(running.pid);
  } catch {
    // Already gone.
  }
  for (let i = 0; i < 40 && (await health()); i++) await sleep(250);
}

if (spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status !== 0) {
  console.warn('\n  ! FFmpeg was not found. The studio will open, but rendering needs FFmpeg on PATH.\n');
}

step('Starting HyperFrames Studio');
const server = spawn(process.execPath, [path.join(root, 'server', 'src', 'index.js'), '--serve-web'], { cwd: root, stdio: 'inherit' });
server.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.kill(sig));

for (let i = 0; i < 60 && !(await isRunning()); i++) await sleep(250);
openBrowser();
console.log(`\n  Studio is open at ${URL}\n  Keep this window open while you work. Close it to stop the studio.\n`);

function webIsStale() {
  const built = path.join(root, 'web', 'dist', 'index.html');
  if (!fs.existsSync(built)) return true;
  const builtAt = fs.statSync(built).mtimeMs;
  const sources = [path.join(root, 'web', 'index.html'), path.join(root, 'web', 'vite.config.js'), ...walk(path.join(root, 'web', 'src'))];
  return sources.some((f) => fs.statSync(f).mtimeMs > builtAt);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

function newestMtime(files) {
  return Math.max(0, ...files.map((f) => fs.statSync(f).mtimeMs));
}

// npm rewrites node_modules/.package-lock.json on every install, so an older copy means new dependencies to fetch.
function depsChanged() {
  const installed = path.join(root, 'node_modules', '.package-lock.json');
  const lock = path.join(root, 'package-lock.json');
  return fs.existsSync(lock) && (!fs.existsSync(installed) || fs.statSync(lock).mtimeMs > fs.statSync(installed).mtimeMs);
}

async function health() {
  try {
    const res = await fetch(`${URL}/api/health`, { signal: AbortSignal.timeout(800) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function isRunning() {
  return Boolean(await health());
}

function openBrowser() {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', URL]] : process.platform === 'darwin' ? ['open', [URL]] : ['xdg-open', [URL]];
  spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

function run(cmd, args) {
  // npm.cmd is a batch file; Node refuses to spawn .cmd without a shell since the 2024 CVE fix.
  const res = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) fail(`"${cmd} ${args.join(' ')}" failed. Read the messages above, fix the cause, then open the studio again.`);
}

function step(text) {
  console.log(`\n  > ${text}`);
}

function fail(message) {
  console.error(`\n  x ${message}\n`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
