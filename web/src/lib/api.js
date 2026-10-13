import { t } from './i18n.js';

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(t('api.unreachable'));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? t('api.failed', { status: res.status }));
  return data;
}

// Ending the URL with the real file name keeps download managers (IDM) from guessing a name and type of their own.
export function fileUrl(job, inline = false) {
  const slug = String(job.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'render';
  return `/api/renders/${job.id}/file/${slug}-${job.id.slice(0, 6)}.${job.format}${inline ? '?inline=1' : ''}`;
}
