import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { composeTemplate, ASPECTS, FONTS, HttpError } from './compose.js';
import { templateCatalog } from './templates/index.js';
import { RenderQueue, CLI_VERSION, OUTPUT_EXT, ffmpegAvailable } from './renderQueue.js';
import { ProjectStore } from './projects.js';
import { Config } from './config.js';
import { generateComposition, MODEL, PROVIDERS } from './generate.js';
import { StatusHub } from './status.js';
import { CLIS, runCommand } from './cli.js';
import { mountMcp } from './mcp.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
// Custom HTML renders run arbitrary markup in headless Chrome, and settings hold an API key, so stay on loopback unless told otherwise.
const HOST = process.env.HOST ?? '127.0.0.1';
const DATA_ROOT = path.resolve(here, '..', 'data');
const WEB_DIST = path.resolve(here, '..', '..', 'web', 'dist');

const FPS = [24, 25, 30, 50, 60];
const QUALITY = ['draft', 'looks', 'delivery'];
const MAX_HTML = 1_500_000;
const BOOTED_AT = Date.now();

const queue = new RenderQueue(path.join(DATA_ROOT, 'renders'));
await queue.load();
const projects = new ProjectStore(path.join(DATA_ROOT, 'projects'));
const config = new Config(path.join(DATA_ROOT, 'config.json'));
await config.load();
const hub = new StatusHub({ config });
hub.refresh();
const mcpUrl = (id) => `http://127.0.0.1:${PORT}/mcp?client=${id}`;
const PUSH_TTL_MS = 10 * 60_000;
let pendingPush = null;

const app = express();
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    hyperframes: CLI_VERSION,
    ffmpeg: ffmpegAvailable(),
    node: process.version,
    pid: process.pid,
    bootedAt: BOOTED_AT,
    busy: queue.list().some((j) => j.status === 'running' || j.status === 'queued'),
    ai: aiSettings(),
  });
});

app.get('/api/status', (_req, res) => res.json(hub.snapshot()));

app.post('/api/status/refresh', async (_req, res) => {
  await hub.refresh();
  res.json(hub.snapshot());
});

app.put('/api/connections/:id/mcp', async (req, res) => {
  const cli = CLIS[req.params.id];
  if (!cli) throw new HttpError(404, 'Unknown connection.');
  const connect = Boolean(req.body?.connected);
  // Re-adding replaces an entry that may point at an old port.
  if (connect && (await cli.mcpRegistered())) await runCommand(cli.bin, cli.removeMcp(), { timeoutMs: 30000 });
  const result = await runCommand(cli.bin, connect ? cli.addMcp(mcpUrl(req.params.id)) : cli.removeMcp(), { timeoutMs: 30000 });
  await hub.refresh();
  if ((await cli.mcpRegistered()) !== connect) {
    const why = `${result.stderr}\n${result.stdout}`.trim().split(/\r?\n/).slice(-2).join(' ');
    throw new HttpError(502, `${cli.label} did not ${connect ? 'add' : 'remove'} the MCP server. ${why}`.trim());
  }
  res.json(hub.snapshot());
});

app.put('/api/settings/ai', async (req, res) => {
  const body = req.body ?? {};
  const patch = {};
  if ('apiKey' in body) {
    const key = String(body.apiKey ?? '').trim();
    if (key && !key.startsWith('sk-ant-')) throw new HttpError(400, 'That does not look like an Anthropic API key. Keys start with "sk-ant-".');
    patch.anthropicApiKey = key || undefined;
  }
  if (body.provider !== undefined) {
    if (!PROVIDERS.includes(body.provider)) throw new HttpError(400, `Unknown AI source "${body.provider}".`);
    patch.aiProvider = body.provider;
  }
  await config.set(patch);
  hub.emit('status', hub.snapshot());
  res.json(aiSettings());
});

app.post('/api/generate', async (req, res) => {
  const { prompt, aspect = '16:9', duration = 6, currentHtml, projectId } = req.body ?? {};
  const provider = req.body?.provider ?? config.aiProvider;
  if (!PROVIDERS.includes(provider)) throw new HttpError(400, `Unknown AI source "${provider}".`);
  const source = hub.snapshot().connections.find((c) => c.id === provider);
  if (!source.available) {
    throw new HttpError(400, provider === 'api' ? 'Add an Anthropic API key in AI settings first.' : `${source.label} is not ready. ${source.detail}`);
  }
  if (hub.generation) throw new HttpError(409, `${labelOf(hub.generation.provider)} is already writing a composition. Wait for it or stop it.`);
  if (!String(prompt ?? '').trim()) throw new HttpError(400, 'Describe the video you want first.');
  if (!ASPECTS[aspect]) throw new HttpError(400, `Unsupported aspect "${aspect}".`);
  const seconds = Math.min(60, Math.max(2, Number(duration) || 6));
  const assets = projectId ? (await projects.list(projectId)).map((f) => f.path).filter((p) => !/\.html?$/i.test(p)) : [];

  // NDJSON stream: the UI shows the composition being written, then swaps in the final HTML.
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' });
  const send = (event) => res.write(`${JSON.stringify(event)}\n`);
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  let phase = 'calling';
  hub.setGeneration({ provider, phase, startedAt: Date.now() });
  send({ type: 'phase', phase, provider });
  try {
    const html = await generateComposition({
      provider,
      apiKey: config.anthropicApiKey,
      signal: abort.signal,
      onText: (text) => send({ type: 'delta', text }),
      onPhase: (next) => {
        if (next === phase) return;
        phase = next;
        hub.setGeneration({ ...hub.generation, phase });
        send({ type: 'phase', phase, provider });
      },
      prompt: String(prompt).slice(0, 4000),
      aspect,
      duration: seconds,
      currentHtml: typeof currentHtml === 'string' && currentHtml.trim() ? currentHtml.slice(0, MAX_HTML) : null,
      assets,
    });
    send({ type: 'done', html });
  } catch (err) {
    if (!abort.signal.aborted) send({ type: 'error', error: err.message || 'Generation failed.' });
  } finally {
    hub.setGeneration(null);
  }
  res.end();
});

app.post('/api/projects', async (_req, res) => {
  res.status(201).json({ id: await projects.create() });
});

app.put('/api/projects/:id/files/*path', express.raw({ type: () => true, limit: '512mb' }), async (req, res) => {
  await projects.write(req.params.id, req.params.path.join('/'), req.body);
  res.json({ ok: true });
});

app.get('/api/projects/:id/files/*path', (req, res) => {
  res.sendFile(projects.resolve(req.params.id, req.params.path.join('/')), (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

app.get('/api/projects/:id', async (req, res) => {
  if (!(await projects.exists(req.params.id))) throw new HttpError(404, 'That import no longer exists.');
  res.json({ id: req.params.id, files: await projects.list(req.params.id) });
});

app.delete('/api/projects/:id', async (req, res) => {
  await projects.remove(req.params.id);
  res.json({ ok: true });
});

app.get('/api/templates', (_req, res) => {
  res.json({
    templates: templateCatalog(),
    aspects: Object.entries(ASPECTS).map(([id, size]) => ({ id, ...size })),
    fonts: Object.entries(FONTS).map(([id, f]) => ({ id, label: f.label })),
  });
});

app.post('/api/compose', (req, res) => {
  const { templateId, values, aspect } = req.body ?? {};
  res.json(composeTemplate(templateId, values, aspect));
});

app.get('/api/renders', (_req, res) => res.json({ renders: queue.list() }));

app.get('/api/renders/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('snapshot', queue.list());
  send('status', hub.snapshot());
  if (pendingPush && Date.now() - pendingPush.at < PUSH_TTL_MS) send('push', pendingPush);
  pendingPush = null;
  const onJob = (job) => send('job', job);
  const onRemoved = (id) => send('removed', { id });
  const onStatus = (status) => send('status', status);
  const onPush = (push) => send('push', push);
  queue.on('job', onJob);
  queue.on('removed', onRemoved);
  hub.on('status', onStatus);
  hub.on('push', onPush);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(ping);
    queue.off('job', onJob);
    queue.off('removed', onRemoved);
    hub.off('status', onStatus);
    hub.off('push', onPush);
  });
});

app.post('/api/renders', async (req, res) => {
  res.status(201).json(await createRender(req.body ?? {}));
});

async function createRender(body, { origin, prepare: prepareSource } = {}) {
  const fps = Number(body.fps ?? 30);
  const quality = body.quality ?? 'looks';
  const format = body.format ?? 'mp4';
  if (!FPS.includes(fps)) throw new HttpError(400, `Frame rate must be one of ${FPS.join(', ')}.`);
  if (!QUALITY.includes(quality)) throw new HttpError(400, `Quality must be one of ${QUALITY.join(', ')}.`);
  if (!OUTPUT_EXT[format]) throw new HttpError(400, `Format must be one of ${Object.keys(OUTPUT_EXT).join(', ')}.`);

  let html, meta, name, prepare;
  if (typeof body.html === 'string') {
    if (body.html.length > MAX_HTML) throw new HttpError(413, 'The composition is larger than 1.5 MB. Move big assets out of the HTML.');
    if (!/data-composition-id\s*=/.test(body.html)) {
      throw new HttpError(400, 'The HTML needs a root element with data-composition-id. Start from a template to see the structure.');
    }
    html = body.html;
    meta = { source: 'html', ...readRootMeta(html) };
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
    name = String(body.name || title || 'Custom composition').slice(0, 80);
    if (body.projectId) {
      if (!(await projects.exists(body.projectId))) throw new HttpError(404, 'The imported assets are gone. Import the files again before rendering.');
      prepare = (dir) => projects.copyInto(body.projectId, dir);
    } else {
      prepare = prepareSource;
    }
  } else {
    const composed = composeTemplate(body.templateId, body.values, body.aspect);
    html = composed.html;
    meta = { source: 'template', templateId: body.templateId, aspect: body.aspect, width: composed.width, height: composed.height, duration: composed.duration };
    name = String(body.name || templateCatalog().find((t) => t.id === body.templateId)?.name || body.templateId).slice(0, 80);
  }
  if (origin) meta.origin = origin;
  return queue.enqueue({ html, name, meta, fps, quality, format, prepare });
}

mountMcp(app, {
  hub,
  queue,
  projects,
  createRender,
  pushToStudio(push) {
    const viewers = hub.listenerCount('push');
    const event = { ...push, at: Date.now() };
    if (viewers) hub.emit('push', event);
    else pendingPush = event;
    return viewers;
  },
});

app.post('/api/renders/:id/cancel', async (req, res) => {
  const job = await queue.cancel(req.params.id);
  if (!job) throw new HttpError(404, 'That render no longer exists.');
  res.json({ ok: true });
});

app.delete('/api/renders/:id', async (req, res) => {
  if (!(await queue.remove(req.params.id))) throw new HttpError(404, 'That render no longer exists.');
  res.json({ ok: true });
});

app.get(['/api/renders/:id/file', '/api/renders/:id/file/:name'], (req, res) => {
  const job = queue.get(req.params.id);
  if (!job || job.status !== 'done') throw new HttpError(404, 'This render has no finished file yet.');
  const file = queue.filePath(job);
  if (req.query.inline) return res.sendFile(file);
  res.download(file, `${slug(job.name)}-${job.id.slice(0, 6)}.${OUTPUT_EXT[job.format]}`);
});

// Only the launcher / npm start serve the built UI. In dev a leftover web/dist would show a stale UI on this port.
if (process.argv.includes('--serve-web') && fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
} else {
  app.get(/^(?!\/api\/).*/, (_req, res) => res.redirect(process.env.WEB_DEV_URL ?? 'http://localhost:5173'));
}

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'The server hit an unexpected error. Check the server log.' : err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`HyperFrames Studio API on http://${HOST}:${PORT} (hyperframes ${CLI_VERSION})`);
});

function aiSettings() {
  return { ready: Boolean(config.anthropicApiKey), keySource: config.keySource, model: MODEL, provider: config.aiProvider };
}

function labelOf(provider) {
  return CLIS[provider]?.label ?? 'Anthropic API';
}

function readRootMeta(html) {
  const root = html.match(/<[^>]*data-composition-id[^>]*>/)?.[0] ?? '';
  const attr = (name) => Number(root.match(new RegExp(`data-${name}="([\\d.]+)"`))?.[1]) || null;
  return { width: attr('width'), height: attr('height'), duration: attr('duration') };
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'render';
}
