export const PREVIEW_FPS = 30;

export function timecode(seconds, fps = PREVIEW_FPS) {
  const totalFrames = Math.round(Math.max(0, seconds) * fps);
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(m)}:${pad(s)}:${pad(frames)}`;
}

export const frameOf = (seconds, fps = PREVIEW_FPS) => Math.round(seconds * fps);

export function formatBytes(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
