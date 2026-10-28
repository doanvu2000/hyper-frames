import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HttpError } from './compose.js';

const ID = /^[0-9a-f-]{36}$/;
const MAX_HTML = 1_500_000;
const MAX_VERSIONS = 60;
const MAX_MARKERS = 100;
const MODES = ['html', 'template'];
export const VERSION_SOURCES = ['api', 'claude-cli', 'codex-cli', 'manual', 'mcp', 'template', 'import', 'restore'];

export class LibraryStore {
  constructor(dir) {
    this.dir = dir;
    this.chains = new Map();
  }

  async list() {
    await fs.mkdir(this.dir, { recursive: true });
    const docs = [];
    for (const entry of await fs.readdir(this.dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !ID.test(entry.name)) continue;
      const doc = await this.#read(entry.name).catch(() => null);
      if (doc) docs.push(doc);
    }
    return docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id) {
    const doc = await this.#read(this.#checkId(id)).catch(() => null);
    if (!doc) throw new HttpError(404, 'That project no longer exists.');
    return doc;
  }

  async create({ name, state } = {}) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const doc = { id, name: cleanName(name), createdAt: now, updatedAt: now, state: cleanState(state), versions: [] };
    await fs.mkdir(path.join(this.dir, id, 'versions'), { recursive: true });
    await this.#serial(id, () => this.#write(doc));
    return doc;
  }

  update(id, { name, state } = {}) {
    return this.#serial(this.#checkId(id), async () => {
      const doc = await this.get(id);
      if (name !== undefined) doc.name = cleanName(name);
      if (state !== undefined) doc.state = cleanState(state);
      doc.updatedAt = new Date().toISOString();
      await this.#write(doc);
      return doc;
    });
  }

  remove(id) {
    return this.#serial(this.#checkId(id), async () => {
      await this.get(id);
      await fs.rm(path.join(this.dir, id), { recursive: true, force: true });
    });
  }

  duplicate(id, { name } = {}) {
    return this.#serial(this.#checkId(id), async () => {
      const source = await this.get(id);
      const copyId = randomUUID();
      const now = new Date().toISOString();
      const versionsDir = path.join(this.dir, copyId, 'versions');
      await fs.mkdir(versionsDir, { recursive: true });
      await fs.cp(path.join(this.dir, id, 'versions'), versionsDir, { recursive: true }).catch(() => {});
      const doc = { ...source, id: copyId, name: cleanName(name ?? `${source.name} (copy)`), createdAt: now, updatedAt: now };
      await this.#write(doc);
      return doc;
    });
  }

  addVersion(id, { html, source, note } = {}) {
    if (typeof html !== 'string' || !html.trim()) throw new HttpError(400, 'A version needs the composition HTML.');
    if (html.length > MAX_HTML) throw new HttpError(413, 'The composition is larger than 1.5 MB. Move big assets out of the HTML.');
    if (!VERSION_SOURCES.includes(source)) throw new HttpError(400, `Version source must be one of ${VERSION_SOURCES.join(', ')}.`);
    return this.#serial(this.#checkId(id), async () => {
      const doc = await this.get(id);
      const newest = doc.versions.at(-1);
      if (newest && (await fs.readFile(this.#versionFile(id, newest.id), 'utf8').catch(() => null)) === html) {
        return { version: newest, duplicate: true };
      }
      const version = { id: randomUUID(), at: new Date().toISOString(), source, note: String(note ?? '').trim().slice(0, 120) };
      await fs.mkdir(path.join(this.dir, id, 'versions'), { recursive: true });
      await atomicWrite(this.#versionFile(id, version.id), html);
      doc.versions.push(version);
      const dropped = doc.versions.splice(0, Math.max(0, doc.versions.length - MAX_VERSIONS));
      doc.updatedAt = version.at;
      await this.#write(doc);
      await Promise.all(dropped.map((v) => fs.rm(this.#versionFile(id, v.id), { force: true })));
      return { version };
    });
  }

  async getVersion(id, versionId) {
    const doc = await this.get(id);
    const version = doc.versions.find((v) => v.id === versionId);
    const html = version ? await fs.readFile(this.#versionFile(id, version.id), 'utf8').catch(() => null) : null;
    if (html === null) throw new HttpError(404, 'That version no longer exists.');
    return { ...version, html };
  }

  #checkId(id) {
    if (!ID.test(id ?? '')) throw new HttpError(400, 'Invalid project id.');
    return id;
  }

  #versionFile(id, versionId) {
    if (!ID.test(versionId ?? '')) throw new HttpError(400, 'Invalid version id.');
    return path.join(this.dir, id, 'versions', `${versionId}.html`);
  }

  async #read(id) {
    return JSON.parse(await fs.readFile(path.join(this.dir, id, 'doc.json'), 'utf8'));
  }

  #write(doc) {
    return atomicWrite(path.join(this.dir, doc.id, 'doc.json'), JSON.stringify(doc, null, 2));
  }

  // The client autosaves often; chaining per doc keeps read-modify-write cycles from interleaving.
  #serial(id, fn) {
    const run = (this.chains.get(id) ?? Promise.resolve()).catch(() => {}).then(fn);
    this.chains.set(id, run);
    run.finally(() => this.chains.get(id) === run && this.chains.delete(id)).catch(() => {});
    return run;
  }
}

async function atomicWrite(file, data) {
  const tmp = `${file}.${randomUUID().slice(0, 8)}.tmp`;
  await fs.writeFile(tmp, data, 'utf8');
  // On Windows a reader holding the target open makes rename fail with EPERM for a moment.
  for (let attempt = 0; ; attempt++) {
    try {
      return await fs.rename(tmp, file);
    } catch (err) {
      if (attempt >= 4 || !['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) {
        await fs.rm(tmp, { force: true });
        throw err;
      }
      await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
    }
  }
}

function cleanName(name) {
  return String(name ?? '').trim().slice(0, 80).trim() || 'Untitled video';
}

function cleanState(input) {
  const s = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const mode = s.mode ?? 'html';
  if (!MODES.includes(mode)) throw new HttpError(400, 'Project mode must be "html" or "template".');
  const html = typeof s.html === 'string' ? s.html : '';
  if (html.length > MAX_HTML) throw new HttpError(413, 'The composition is larger than 1.5 MB. Move big assets out of the HTML.');
  const point = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));
  const markers = [...new Set((Array.isArray(s.markers) ? s.markers : []).map(Number).filter((n) => Number.isFinite(n) && n >= 0))]
    .sort((a, b) => a - b)
    .slice(0, MAX_MARKERS);
  const a = s.assets;
  const assets =
    a && typeof a === 'object' && Number.isFinite(Number(a.count)) && Number.isFinite(Number(a.size))
      ? { label: String(a.label ?? '').slice(0, 200), count: Number(a.count), size: Number(a.size) }
      : null;
  return {
    mode,
    templateId: typeof s.templateId === 'string' ? s.templateId.slice(0, 100) : '',
    aspect: typeof s.aspect === 'string' ? s.aspect.slice(0, 20) : '16:9',
    values: s.values && typeof s.values === 'object' && !Array.isArray(s.values) ? s.values : {},
    html,
    projectId: typeof s.projectId === 'string' && ID.test(s.projectId) ? s.projectId : '',
    assets,
    markers,
    inPoint: point(s.inPoint),
    outPoint: point(s.outPoint),
  };
}
