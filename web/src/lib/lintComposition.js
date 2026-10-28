import { t } from './i18n.js';

const lineAt = (html, index) => html.slice(0, index).split('\n').length;
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']?([^"'\\s>]+)`, 'i'))?.[1];

// Instant checks that need no browser; the full HyperFrames check runs on the server on demand.
export function quickLint(html) {
  if (!html.trim()) return [];
  const out = [];
  if (!/data-composition-id\s*=/.test(html)) out.push({ line: 1, severity: 'error', message: t('lint.noRoot') });
  if (!/__timelines/.test(html)) {
    const at = html.search(/<script/i);
    out.push({ line: at === -1 ? 1 : lineAt(html, at), severity: 'warning', message: t('lint.noTimeline') });
  }

  const clips = [];
  for (const m of html.matchAll(/<audio\b[^>]*>/gi)) {
    const tag = m[0];
    const line = lineAt(html, m.index);
    if (!attr(tag, 'src') && !/<source/i.test(html.slice(m.index, m.index + 400))) out.push({ line, severity: 'warning', message: t('lint.audioNoSrc') });
    const start = parseFloat(attr(tag, 'data-start') ?? '0') || 0;
    const dur = parseFloat(attr(tag, 'data-duration') ?? '');
    clips.push({ line, start, end: Number.isFinite(dur) ? start + dur : Infinity, track: attr(tag, 'data-track-index') ?? '0' });
  }
  for (let i = 0; i < clips.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = clips[j];
      const b = clips[i];
      if (a.track === b.track && b.start < a.end && a.start < b.end) {
        out.push({ line: b.line, severity: 'error', message: t('lint.audioOverlap', { line: a.line }) });
        break;
      }
    }
  }

  for (const [re, key] of [
    [/Math\.random\s*\(/g, 'lint.random'],
    [/Date\.now\s*\(|new Date\s*\(\s*\)/g, 'lint.clock'],
    [/\bfetch\s*\(/g, 'lint.fetch'],
  ]) {
    for (const m of html.matchAll(re)) out.push({ line: lineAt(html, m.index), severity: 'warning', message: t(key) });
  }
  return out;
}

// Server findings name a selector, not a line; point at the first element that matches it.
export function lineForSelector(html, selector) {
  if (!selector) return 1;
  const first = selector.trim().split(/[\s>+~,]/)[0];
  let re = null;
  if (first.startsWith('#')) re = new RegExp(`id\\s*=\\s*["']${escape(first.slice(1))}["']`);
  else if (first.startsWith('.')) re = new RegExp(`class\\s*=\\s*["'][^"']*\\b${escape(first.slice(1).split('.')[0])}\\b`);
  else if (/^[a-z][a-z0-9-]*/i.test(first)) re = new RegExp(`<${escape(first.match(/^[a-z][a-z0-9-]*/i)[0])}\\b`, 'i');
  const at = re ? html.search(re) : -1;
  return at === -1 ? 1 : lineAt(html, at);
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
