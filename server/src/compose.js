import { ASPECTS, FONTS } from './presets.js';
import { templates } from './templates/index.js';

export { ASPECTS, FONTS };


const GSAP_SRC = 'https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const HEX = /^#[0-9a-f]{6}$/i;

function normalizeValues(template, input = {}) {
  const out = {};
  for (const field of template.fields) {
    let v = input[field.id];
    if (v === undefined || v === null || v === '') v = field.default;
    if (field.type === 'number') {
      v = Number(v);
      if (!Number.isFinite(v)) v = field.default;
      if (field.min !== undefined) v = Math.max(field.min, v);
      if (field.max !== undefined) v = Math.min(field.max, v);
    } else if (field.type === 'color') {
      v = HEX.test(String(v)) ? String(v) : field.default;
    } else if (field.type === 'select') {
      v = field.options.some((o) => o.value === v) ? v : field.default;
    } else {
      v = String(v).slice(0, field.maxLength ?? 400);
    }
    out[field.id] = v;
  }
  return out;
}

export function composeTemplate(templateId, rawValues, aspect = '16:9') {
  const template = templates.find((t) => t.id === templateId);
  if (!template) throw new HttpError(404, `Unknown template "${templateId}"`);
  const frame = ASPECTS[aspect];
  if (!frame) throw new HttpError(400, `Unsupported aspect "${aspect}"`);

  const values = normalizeValues(template, rawValues);
  const font = FONTS[values.font] ?? FONTS.archivo;
  const unit = Math.min(frame.width, frame.height) / 1080;
  const ctx = {
    ...frame,
    aspect,
    portrait: frame.height > frame.width,
    px: (n) => `${Math.round(n * unit)}px`,
    font,
    esc: escapeHtml,
  };
  const duration = values.duration ?? template.duration;
  const { css, body, timeline } = template.build(values, ctx);

  return {
    html: documentShell({ ...frame, duration, background: values.background ?? '#000000', font, css, body, timeline }),
    duration,
    ...frame,
  };
}

function documentShell({ width, height, duration, background, font, css, body, timeline }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${font.css}&display=block" />
    <script src="${GSAP_SRC}"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: ${background}; }
      #root { position: relative; width: 100%; height: 100%; font-family: ${font.family}; font-stretch: ${font.stretch}; }
      .clip { position: absolute; inset: 0; }
${css}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${width}" data-height="${height}">
${body}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
${timeline}
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
