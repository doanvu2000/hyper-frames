import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { localhostHostValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { AUTHORING_RULES } from './generate.js';
import { CLIS } from './cli.js';
import { ASPECTS, FONTS, composeTemplate } from './compose.js';
import { templateCatalog } from './templates/index.js';
import { CLI_VERSION } from './renderQueue.js';
import { snapshotFrames, checkComposition } from './inspect.js';

const SKIP_DIRS = new Set(['node_modules', '.git', '.hyperframes', 'renders', 'dist']);
const MAX_FOLDER_BYTES = 300 * 1024 * 1024;
const MAX_FOLDER_FILES = 400;

const GUIDE = `HyperFrames Studio renders HTML compositions to video on this computer (hyperframes ${CLI_VERSION}).

Workflow:
1. Start from a template (list_templates, compose_template) or write your own HTML following the rules below.
2. Look at it: snapshot_frames returns PNG frames; check_composition reports layout, contrast and runtime problems. Fix and repeat.
3. open_in_studio shows it in the Studio window so the user can preview and tweak it.
4. render_video queues the render, then render_status (with wait_seconds) until it is done. Tell the user the output path.

Pass HTML inline with "html", or with "html_path" pointing at an .html file on disk. With html_path, files in the same folder
(images, video, audio, fonts) travel with it, so reference them by relative path.

Composition rules:
${AUTHORING_RULES.replace(/\nOutput only the complete HTML document[^\n]*$/, '')}`;

const sourceShape = {
  html: z.string().max(1_500_000).optional().describe('Complete composition HTML.'),
  html_path: z.string().optional().describe('Absolute path to an .html file. Files in its folder are used as assets.'),
};

export function mountMcp(app, { hub, queue, projects, createRender, pushToStudio }) {
  const transports = new Map();

  app.use('/mcp', localhostHostValidation());
  app.all('/mcp', async (req, res) => {
    const sid = req.headers['mcp-session-id'];
    const existing = sid ? transports.get(sid) : null;
    if (existing) {
      hub.touch(sid);
      if (req.method === 'GET') {
        const closed = hub.streamOpened(sid);
        res.on('close', closed);
      }
      return existing.handleRequest(req, res, req.body);
    }
    if (sid || req.method !== 'POST' || !isInitializeRequest(req.body)) {
      return res.status(sid ? 404 : 400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: sid ? 'Session expired. Reconnect the MCP server.' : 'Send an initialize request first.' },
        id: null,
      });
    }

    const client = clientId(req.query.client, req.body.params?.clientInfo?.name);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: (id) => {
        transports.set(id, transport);
        hub.addSession(id, { client, close: () => transport.close() });
      },
      onsessionclosed: (id) => {
        transports.delete(id);
        hub.removeSession(id);
      },
    });
    transport.onclose = () => {
      if (!transport.sessionId) return;
      transports.delete(transport.sessionId);
      hub.removeSession(transport.sessionId);
    };
    const server = buildServer({ client, hub, queue, projects, createRender, pushToStudio });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
}

function buildServer({ client, hub, queue, projects, createRender, pushToStudio }) {
  const server = new McpServer({ name: 'hyperframes-studio', version: '1.0.0' }, { instructions: 'Call authoring_guide before writing a composition.' });

  const tool = (name, config, handler) =>
    server.registerTool(name, config, async (args, extra) => {
      const done = hub.beginCall(extra.sessionId, name);
      try {
        return await handler(args ?? {}, extra);
      } catch (err) {
        return { isError: true, content: [{ type: 'text', text: err.message || String(err) }] };
      } finally {
        done();
      }
    });

  tool(
    'authoring_guide',
    { title: 'Authoring guide', description: 'Rules for writing HyperFrames compositions and the Studio workflow. Read this first.', annotations: { readOnlyHint: true } },
    async () => text(GUIDE),
  );

  tool(
    'list_templates',
    { title: 'List templates', description: 'Built-in templates with their fields, plus frame sizes and fonts.', annotations: { readOnlyHint: true } },
    async () =>
      json({
        templates: templateCatalog(),
        aspects: Object.entries(ASPECTS).map(([id, size]) => ({ id, ...size })),
        fonts: Object.keys(FONTS),
      }),
  );

  tool(
    'compose_template',
    {
      title: 'Compose a template',
      description: 'Fill a built-in template and get its composition HTML, ready to render or to edit further.',
      inputSchema: {
        templateId: z.string(),
        aspect: z.enum(Object.keys(ASPECTS)).default('16:9'),
        values: z.record(z.string(), z.any()).default({}).describe('Field values by field id; missing fields use defaults.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ templateId, aspect, values }) => {
      const res = composeTemplate(templateId, values, aspect);
      return text(`Duration ${res.duration}s, ${res.width}x${res.height}.\n\n${res.html}`);
    },
  );

  tool(
    'snapshot_frames',
    {
      title: 'Snapshot frames',
      description: 'Render up to 4 frames of a composition as PNG images so you can see it.',
      inputSchema: { ...sourceShape, times: z.array(z.number().min(0)).min(1).max(4).describe('Seconds.') },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const source = await loadSource(args);
      const frames = await snapshotFrames(source.html, args.times, { prepare: source.prepare });
      return {
        content: frames.flatMap((f, i) => [
          { type: 'text', text: `Frame at ${args.times[i] ?? '?'}s` },
          { type: 'image', data: f.data, mimeType: 'image/png' },
        ]),
      };
    },
  );

  tool(
    'check_composition',
    {
      title: 'Check composition',
      description: 'Lint, runtime, layout and contrast checks. Returns errors and warnings to fix before rendering.',
      inputSchema: sourceShape,
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const source = await loadSource(args);
      return json(await checkComposition(source.html, { prepare: source.prepare }));
    },
  );

  tool(
    'open_in_studio',
    {
      title: 'Open in Studio',
      description: 'Load a composition into the HyperFrames Studio editor so the user can preview and adjust it.',
      inputSchema: { ...sourceShape, name: z.string().max(80).optional() },
    },
    async (args) => {
      const source = await loadSource(args);
      let projectId = null;
      let assets = null;
      if (source.folder) {
        projectId = await projects.create();
        await copyFolder(source.folder, projects.root(projectId), path.basename(args.html_path));
        const files = await projects.list(projectId);
        assets = { count: files.length, size: files.reduce((n, f) => n + f.size, 0) };
      }
      const viewers = pushToStudio({ html: source.html, projectId, assets, name: args.name ?? null, client });
      return text(viewers ? 'Opened in the Studio editor.' : 'Saved for the Studio, but no Studio window is open. Ask the user to open HyperFrames Studio.');
    },
  );

  tool(
    'render_video',
    {
      title: 'Render video',
      description: 'Queue a render. Give html or html_path, or templateId with values and aspect. Returns the render id.',
      inputSchema: {
        ...sourceShape,
        templateId: z.string().optional(),
        values: z.record(z.string(), z.any()).optional(),
        aspect: z.enum(Object.keys(ASPECTS)).optional(),
        name: z.string().max(80).optional(),
        format: z.enum(['mp4', 'webm', 'mov', 'gif']).default('mp4'),
        fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]).default(30),
        quality: z.enum(['draft', 'looks', 'delivery']).default('looks'),
      },
    },
    async (args) => {
      const settings = { format: args.format, fps: args.fps, quality: args.quality, name: args.name };
      let job;
      if (args.html || args.html_path) {
        const source = await loadSource(args);
        job = await createRender({ ...settings, html: source.html }, { origin: client, prepare: source.prepare });
      } else if (args.templateId) {
        job = await createRender({ ...settings, templateId: args.templateId, values: args.values, aspect: args.aspect }, { origin: client });
      } else {
        throw new Error('Give html, html_path or templateId.');
      }
      return json({ id: job.id, name: job.name, status: job.status, next: 'Call render_status with this id and wait_seconds to follow it.' });
    },
  );

  tool(
    'render_status',
    {
      title: 'Render status',
      description: 'Status and progress of a render. With wait_seconds, waits until it finishes or the time is up.',
      inputSchema: { id: z.string(), wait_seconds: z.number().min(0).max(55).default(0) },
      annotations: { readOnlyHint: true },
    },
    async ({ id, wait_seconds }, extra) => {
      if (!queue.get(id)) throw new Error('No render with that id.');
      await waitForFinish(queue, id, wait_seconds * 1000, extra.signal);
      return json(describeJob(queue, queue.get(id)));
    },
  );

  tool(
    'list_renders',
    { title: 'List renders', description: 'Recent renders, newest first.', inputSchema: { limit: z.number().int().min(1).max(50).default(10) }, annotations: { readOnlyHint: true } },
    async ({ limit }) => json(queue.list().slice(0, limit).map((job) => describeJob(queue, queue.get(job.id)))),
  );

  return server;
}

async function loadSource({ html, html_path }) {
  if (html) return { html, folder: null, prepare: null };
  if (!html_path) throw new Error('Give html or html_path.');
  const file = path.resolve(html_path);
  if (!/\.html?$/i.test(file)) throw new Error('html_path must point at an .html file.');
  const content = await fs.readFile(file, 'utf8').catch(() => {
    throw new Error(`Cannot read ${file}.`);
  });
  const folder = path.dirname(file);
  return {
    html: content,
    folder,
    prepare: (dir) => copyFolder(folder, dir, path.basename(file)),
  };
}

// Copies the assets next to an HTML file, skipping build output and dependency folders.
async function copyFolder(src, dest, skipFile) {
  let bytes = 0;
  let count = 0;
  const walk = async (dir) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (dir === src && entry.name === skipFile) continue;
      bytes += (await fs.stat(full)).size;
      if (++count > MAX_FOLDER_FILES || bytes > MAX_FOLDER_BYTES) {
        throw new Error(`The folder ${src} is too big to use as assets (max ${MAX_FOLDER_FILES} files, 300 MB). Move the HTML and its assets into their own folder.`);
      }
      const target = path.join(dest, path.relative(src, full));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(full, target);
    }
  };
  await walk(src);
}

function waitForFinish(queue, id, ms, signal) {
  const finished = () => ['done', 'failed', 'cancelled'].includes(queue.get(id)?.status ?? 'failed');
  if (!ms || finished()) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = () => {
      clearTimeout(timer);
      queue.off('job', onJob);
      queue.off('removed', onJob);
      signal?.removeEventListener('abort', stop);
      resolve();
    };
    const onJob = () => finished() && stop();
    const timer = setTimeout(stop, ms);
    queue.on('job', onJob);
    queue.on('removed', onJob);
    signal?.addEventListener('abort', stop, { once: true });
  });
}

function describeJob(queue, job) {
  return {
    id: job.id,
    name: job.name,
    status: job.status,
    progress: Math.round(job.progress ?? 0),
    stage: job.stage,
    format: job.format,
    file: job.status === 'done' ? queue.filePath(job) : null,
    sizeBytes: job.size ?? null,
    error: job.error ?? null,
  };
}

function clientId(hint, clientName = '') {
  if (CLIS[hint]) return hint;
  const name = String(clientName).toLowerCase();
  if (name.includes('claude')) return 'claude-cli';
  if (name.includes('codex')) return 'codex-cli';
  return 'other';
}

const text = (value) => ({ content: [{ type: 'text', text: value }] });
const json = (value) => text(JSON.stringify(value, null, 2));
