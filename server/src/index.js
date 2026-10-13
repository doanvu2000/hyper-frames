import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { composeTemplate, ASPECTS, FONTS, HttpError } from './compose.js';
import { templateCatalog } from './templates/index.js';
import { RenderQueue, CLI_VERSION, OUTPUT_EXT, ffmpegAvailable } from './renderQueue.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
// Custom HTML renders run arbitrary markup in headless Chrome, so stay on loopback unless told otherwise.
const HOST = process.env.HOST ?? '127.0.0.1';
const DATA_DIR = path.resolve(here, '..', 'data', 'renders');
const WEB_DIST = path.resolve(here, '..', '..', 'web', 'dist');

const FPS = [24, 25, 30, 50, 60];
const QUALITY = ['draft', 'looks', 'delivery'];
const MAX_HTML = 1_500_000;

const queue = new RenderQueue(DATA_DIR);
await queue.load();

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ hyperframes: CLI_VERSION, ffmpeg: ffmpegAvailable(), node: process.version });
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
  const onJob = (job) => send('job', job);
  const onRemoved = (id) => send('removed', { id });
  queue.on('job', onJob);
  queue.on('removed', onRemoved);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(ping);
    queue.off('job', onJob);
    queue.off('removed', onRemoved);
  });
});

app.post('/api/renders', async (req, res) => {
  const body = req.body ?? {};
  const fps = Number(body.fps ?? 30);
  const quality = body.quality ?? 'looks';
  const format = body.format ?? 'mp4';
  if (!FPS.includes(fps)) throw new HttpError(400, `Frame rate must be one of ${FPS.join(', ')}.`);
  if (!QUALITY.includes(quality)) throw new HttpError(400, `Quality must be one of ${QUALITY.join(', ')}.`);
  if (!OUTPUT_EXT[format]) throw new HttpError(400, `Format must be one of ${Object.keys(OUTPUT_EXT).join(', ')}.`);

  let html, meta, name;
  if (typeof body.html === 'string') {
    if (body.html.length > MAX_HTML) throw new HttpError(413, 'The composition is larger than 1.5 MB. Move big assets out of the HTML.');
    if (!/data-composition-id\s*=/.test(body.html)) {
      throw new HttpError(400, 'The HTML needs a root element with data-composition-id. Start from a template to see the structure.');
    }
    html = body.html;
    meta = { source: 'html', ...readRootMeta(html) };
    name = String(body.name || 'Custom composition').slice(0, 80);
  } else {
    const composed = composeTemplate(body.templateId, body.values, body.aspect);
    html = composed.html;
    meta = { source: 'template', templateId: body.templateId, aspect: body.aspect, width: composed.width, height: composed.height, duration: composed.duration };
    name = String(body.name || templateCatalog().find((t) => t.id === body.templateId)?.name || body.templateId).slice(0, 80);
  }
  res.status(201).json(await queue.enqueue({ html, name, meta, fps, quality, format }));
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

app.get('/api/renders/:id/file', (req, res) => {
  const job = queue.get(req.params.id);
  if (!job || job.status !== 'done') throw new HttpError(404, 'This render has no finished file yet.');
  const file = queue.filePath(job);
  if (req.query.inline) return res.sendFile(file);
  res.download(file, `${slug(job.name)}-${job.id.slice(0, 6)}.${OUTPUT_EXT[job.format]}`);
});

if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
}

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'The server hit an unexpected error. Check the server log.' : err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`HyperFrames Studio API on http://${HOST}:${PORT} (hyperframes ${CLI_VERSION})`);
});

function readRootMeta(html) {
  const root = html.match(/<[^>]*data-composition-id[^>]*>/)?.[0] ?? '';
  const attr = (name) => Number(root.match(new RegExp(`data-${name}="([\\d.]+)"`))?.[1]) || null;
  return { width: attr('width'), height: attr('height'), duration: attr('duration') };
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'render';
}
