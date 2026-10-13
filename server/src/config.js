import fs from 'node:fs/promises';
import path from 'node:path';

export class Config {
  constructor(file) {
    this.file = file;
    this.data = {};
  }

  async load() {
    try {
      this.data = JSON.parse(await fs.readFile(this.file, 'utf8'));
    } catch {
      this.data = {};
    }
  }

  async set(patch) {
    Object.assign(this.data, patch);
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(this.data, null, 2));
  }

  get anthropicApiKey() {
    return process.env.ANTHROPIC_API_KEY || this.data.anthropicApiKey || '';
  }

  get aiProvider() {
    return this.data.aiProvider ?? 'api';
  }

  get keySource() {
    if (process.env.ANTHROPIC_API_KEY) return 'env';
    return this.data.anthropicApiKey ? 'saved' : null;
  }
}
