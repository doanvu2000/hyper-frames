import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HttpError } from './compose.js';

const MAX_FILES = 400;
const ID = /^[0-9a-f-]{36}$/;

// Imported assets live per project so relative URLs in the HTML resolve in both preview and render.
export class ProjectStore {
  constructor(dir) {
    this.dir = dir;
  }

  async create() {
    const id = randomUUID();
    await fs.mkdir(path.join(this.dir, id), { recursive: true });
    return id;
  }

  root(id) {
    if (!ID.test(id ?? '')) throw new HttpError(400, 'Invalid project id.');
    return path.join(this.dir, id);
  }

  resolve(id, relPath) {
    const root = this.root(id);
    const clean = String(relPath ?? '').replaceAll('\\', '/');
    const full = path.resolve(root, clean);
    if (!clean || full === root || !full.startsWith(root + path.sep)) {
      throw new HttpError(400, `"${relPath}" is not a valid file path inside the project.`);
    }
    return full;
  }

  async exists(id) {
    return fs.stat(this.root(id)).then((s) => s.isDirectory(), () => false);
  }

  async write(id, relPath, buffer) {
    if (!(await this.exists(id))) throw new HttpError(404, 'That import no longer exists. Import the files again.');
    const files = await this.list(id);
    if (files.length >= MAX_FILES) throw new HttpError(413, `An import can hold at most ${MAX_FILES} files.`);
    const full = this.resolve(id, relPath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
  }

  async list(id) {
    const root = this.root(id);
    const out = [];
    const walk = async (dir) => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else out.push({ path: path.relative(root, full).replaceAll('\\', '/'), size: (await fs.stat(full)).size });
      }
    };
    await walk(root);
    return out;
  }

  async remove(id) {
    await fs.rm(this.root(id), { recursive: true, force: true });
  }

  async copyInto(id, target) {
    if (!(await this.exists(id))) throw new HttpError(404, 'The imported assets are gone. Import the files again before rendering.');
    await fs.cp(this.root(id), target, { recursive: true });
  }
}
