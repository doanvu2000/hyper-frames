import { readableOn, fontField, colorField, durationField, OUTRO } from './util.js';

export default {
  id: 'lower-third',
  name: 'Lower third',
  summary: 'Name and role that slide in at the bottom left. Use over interview or talking-head footage.',
  duration: 5,
  fields: [
    { id: 'name', label: 'Name', type: 'text', default: 'Maya Chen', maxLength: 40 },
    { id: 'role', label: 'Role', type: 'text', default: 'Product lead', maxLength: 60 },
    colorField('accent', 'Accent', '#FF5C39'),
    colorField('panel', 'Panel', '#FFFFFF'),
    colorField('background', 'Background', '#2A2F3A'),
    fontField(),
    durationField(5),
  ],
  build(v, c) {
    const ink = readableOn(v.panel);
    const css = `
      .lt-box { position: absolute; left: ${c.px(c.portrait ? 70 : 110)}; bottom: ${c.px(c.portrait ? 320 : 140)}; display: flex; align-items: stretch; }
      .lt-accent { width: ${c.px(14)}; background: ${v.accent}; transform-origin: bottom center; }
      .lt-card { position: relative; padding: ${c.px(26)} ${c.px(46)} ${c.px(30)}; }
      .lt-bg { position: absolute; inset: 0; background: ${v.panel}; transform-origin: left center; }
      .lt-name, .lt-role { position: relative; color: ${ink}; white-space: nowrap; }
      .lt-name { font-size: ${c.px(58)}; font-weight: 800; letter-spacing: -0.01em; line-height: 1.1; }
      .lt-role { font-size: ${c.px(30)}; font-weight: 500; opacity: 0.7; margin-top: ${c.px(6)}; }`;
    const body = `
      <div id="scene" class="clip lt" data-start="0" data-duration="${v.duration}" data-track-index="0">
        <div class="lt-box">
          <div class="lt-accent"></div>
          <div class="lt-card">
            <div class="lt-bg"></div>
            <p class="lt-name">${c.esc(v.name)}</p>
            <p class="lt-role">${c.esc(v.role)}</p>
          </div>
        </div>
      </div>`;
    const out = v.duration - OUTRO;
    const timeline = `
      tl.fromTo('.lt-accent', { scaleY: 0 }, { scaleY: 1, duration: 0.4, ease: 'power3.out' }, 0.2);
      tl.fromTo('.lt-bg', { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'power4.out' }, 0.4);
      tl.fromTo('.lt-name', { opacity: 0, x: -36 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power3.out' }, 0.6);
      tl.fromTo('.lt-role', { opacity: 0, x: -36 }, { opacity: 0.7, x: 0, duration: 0.5, ease: 'power3.out' }, 0.72);
      tl.to('.lt-name, .lt-role', { opacity: 0, duration: 0.2 }, ${out});
      tl.to('.lt-bg', { scaleX: 0, duration: 0.4, ease: 'power3.in' }, ${out + 0.1});
      tl.to('.lt-accent', { scaleY: 0, duration: 0.2, ease: 'power2.in' }, ${out + 0.4});`;
    return { css, body, timeline };
  },
};
