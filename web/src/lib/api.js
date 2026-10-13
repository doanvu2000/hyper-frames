export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the render server. Start it with "npm run dev" and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed with status ${res.status}.`);
  return data;
}

export const fileUrl = (id, inline = false) => `/api/renders/${id}/file${inline ? '?inline=1' : ''}`;
