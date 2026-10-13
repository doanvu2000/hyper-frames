import { readableOn, fontField, colorField, durationField, OUTRO } from './util.js';

const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

export default {
  id: 'feature-list',
  name: 'Feature list',
  summary: 'A title, then up to five points ticked in one after another. For app promos and changelogs.',
  duration: 8,
  fields: [
    { id: 'title', label: 'Title', type: 'text', default: 'Why teams switch', maxLength: 50 },
    {
      id: 'items',
      label: 'Points',
      type: 'textarea',
      default: 'Renders on your own machine\nEvery template is plain HTML\nExports MP4, WebM or GIF',
      maxLength: 400,
      hint: 'One point per line, up to five.',
    },
    colorField('accent', 'Accent', '#6D4AFF'),
    colorField('background', 'Background', '#F3F4F7'),
    fontField(),
    durationField(8, 4, 20),
  ],
  build(v, c) {
    const ink = readableOn(v.background);
    const items = v.items.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
    const step = Math.max(0.25, Math.min(0.7, (v.duration - 2.6) / Math.max(1, items.length)));
    const css = `
      .fl { display: flex; flex-direction: column; justify-content: center; gap: ${c.px(56)}; padding: 0 ${c.px(c.portrait ? 80 : 160)}; color: ${ink}; }
      .fl-title { font-size: ${c.px(c.portrait ? 84 : 96)}; font-weight: 800; letter-spacing: -0.02em; line-height: 1.05; }
      .fl-list { list-style: none; display: flex; flex-direction: column; gap: ${c.px(30)}; }
      .fl-item { display: flex; align-items: center; gap: ${c.px(28)}; font-size: ${c.px(c.portrait ? 44 : 50)}; font-weight: 500; }
      .fl-mark { flex: none; display: grid; place-items: center; width: ${c.px(60)}; height: ${c.px(60)}; border-radius: ${c.px(14)}; background: ${v.accent}; color: ${readableOn(v.accent)}; }
      .fl-mark svg { width: 62%; height: 62%; }`;
    const list = items
      .map((text) => `<li class="fl-item"><span class="fl-mark">${CHECK}</span><span>${c.esc(text)}</span></li>`)
      .join('\n          ');
    const body = `
      <div id="scene" class="clip fl" data-start="0" data-duration="${v.duration}" data-track-index="0">
        <h2 class="fl-title">${c.esc(v.title)}</h2>
        <ul class="fl-list">
          ${list}
        </ul>
      </div>`;
    const timeline = `
      tl.fromTo('.fl-title', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.2);
      document.querySelectorAll('.fl-item').forEach((item, i) => {
        const at = 0.9 + i * ${step.toFixed(3)};
        tl.fromTo(item, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power3.out' }, at);
        tl.fromTo(item.querySelector('.fl-mark'), { scale: 0, rotation: -30 }, { scale: 1, rotation: 0, duration: 0.45, ease: 'back.out(2)' }, at + 0.12);
      });
      tl.to('.fl', { opacity: 0, y: -24, duration: ${OUTRO}, ease: 'power2.in' }, ${v.duration - OUTRO});`;
    return { css, body, timeline };
  },
};
