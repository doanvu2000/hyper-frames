import { api } from './api.js';

const SKIP = /(^|\/)(\.[^/]*|node_modules|__MACOSX|Thumbs\.db)(\/|$)/;
const MAX_TOTAL = 1024 * 1024 * 1024;

export function filesFromInput(fileList) {
  return [...fileList].map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}

// Dropped folders only expose their contents through the (old but universal) FileSystemEntry API.
export async function filesFromDrop(dataTransfer) {
  const entries = [...dataTransfer.items].map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return filesFromInput(dataTransfer.files);
  const out = [];
  const walk = async (entry, prefix) => {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      out.push({ file, path: prefix + entry.name });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      } while (batch.length);
    }
  };
  for (const entry of entries) await walk(entry, '');
  return out;
}

function pickMainHtml(items) {
  const htmls = items.filter((i) => /\.html?$/i.test(i.path));
  if (!htmls.length) return null;
  const depth = (p) => p.split('/').length;
  return [...htmls].sort((a, b) => {
    const ai = /(^|\/)index\.html?$/i.test(a.path) ? 0 : 1;
    const bi = /(^|\/)index\.html?$/i.test(b.path) ? 0 : 1;
    return depth(a.path) - depth(b.path) || ai - bi;
  })[0];
}

export function planImport(items) {
  const usable = items.filter((i) => !SKIP.test(i.path));
  const main = pickMainHtml(usable);
  if (!main) throw new Error('No .html file found. Import a HyperFrames composition (an .html file or a folder that contains one).');
  const baseDir = main.path.includes('/') ? main.path.slice(0, main.path.lastIndexOf('/') + 1) : '';
  const assets = usable
    .filter((i) => i !== main && i.path.startsWith(baseDir))
    .map((i) => ({ file: i.file, path: i.path.slice(baseDir.length) }));
  const total = assets.reduce((n, a) => n + a.file.size, 0);
  if (total > MAX_TOTAL) throw new Error('These files add up to more than 1 GB. Import only what the composition uses.');
  const label = baseDir ? baseDir.replace(/\/$/, '') : main.path;
  return { main, assets, total, label, skipped: usable.length - 1 - assets.length };
}

export async function uploadImport(plan, onProgress) {
  const html = await plan.main.file.text();
  if (!plan.assets.length) return { html, projectId: null };
  const { id } = await api('/projects', { method: 'POST' });
  let done = 0;
  const queue = [...plan.assets];
  const worker = async () => {
    while (queue.length) {
      const { file, path } = queue.shift();
      const url = `/api/projects/${id}/files/${path.split('/').map(encodeURIComponent).join('/')}`;
      const res = await fetch(url, { method: 'PUT', body: file });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Uploading ${path} failed.`);
      }
      done += file.size;
      onProgress?.(plan.total ? done / plan.total : 1);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { html, projectId: id };
}
