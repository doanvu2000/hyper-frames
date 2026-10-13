import { readableOn, fontField, colorField, durationField, OUTRO } from './util.js';

export default {
  id: 'stat-countup',
  name: 'Stat count-up',
  summary: 'One big number that counts up, with a label above and a source line below.',
  duration: 5,
  fields: [
    { id: 'label', label: 'Label', type: 'text', default: 'Installs since launch', maxLength: 60 },
    { id: 'value', label: 'Number', type: 'number', default: 1250000, min: 0, max: 999999999999, step: 1 },
    { id: 'prefix', label: 'Prefix', type: 'text', default: '', maxLength: 4 },
    { id: 'suffix', label: 'Suffix', type: 'text', default: '+', maxLength: 6 },
    { id: 'caption', label: 'Source line', type: 'text', default: 'Android and iOS combined', maxLength: 90 },
    colorField('accent', 'Accent', '#FFC53D'),
    colorField('background', 'Background', '#101828'),
    fontField(),
    durationField(5),
  ],
  build(v, c) {
    const ink = readableOn(v.background);
    const decimals = Math.min(2, (String(v.value).split('.')[1] ?? '').length);
    const countFor = Math.max(1, Math.min(2.4, v.duration - 1.8));
    const finalText = `${v.prefix}${new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v.value)}${v.suffix}`;
    // ~0.8em per glyph is the widest case (Archivo at 125% width, weight 900); shrink so the final number fits.
    const fitSize = Math.floor((c.width * 0.86) / (finalText.length * 0.8));
    const numSize = Math.min(Math.round((c.portrait ? 150 : 210) * (Math.min(c.width, c.height) / 1080)), fitSize);
    const css = `
      .sc { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${c.px(26)}; padding: 0 ${c.px(80)}; color: ${ink}; text-align: center; }
      .sc-label { font-size: ${c.px(36)}; font-weight: 600; letter-spacing: 0.04em; opacity: 0.8; }
      .sc-num { font-size: ${numSize}px; font-weight: 900; line-height: 1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; color: ${v.accent}; white-space: nowrap; }
      .sc-rule { width: ${c.px(420)}; height: ${c.px(6)}; background: ${ink}; opacity: 0.25; transform-origin: center; }
      .sc-caption { font-size: ${c.px(28)}; opacity: 0.6; }`;
    const body = `
      <div id="scene" class="clip sc" data-start="0" data-duration="${v.duration}" data-track-index="0">
        <p class="sc-label">${c.esc(v.label)}</p>
        <p class="sc-num"><span>${c.esc(v.prefix)}</span><span class="sc-value">0</span><span>${c.esc(v.suffix)}</span></p>
        <div class="sc-rule"></div>
        <p class="sc-caption">${c.esc(v.caption)}</p>
      </div>`;
    // A getter/setter method lets GSAP write the text on every seek, so scrubbing stays deterministic without onUpdate.
    const timeline = `
      const valueEl = document.querySelector('.sc-value');
      const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: ${decimals}, maximumFractionDigits: ${decimals} });
      let current = 0;
      const counter = { value(next) { if (next === undefined) return current; current = next; valueEl.textContent = fmt.format(next); } };
      tl.fromTo('.sc-label', { opacity: 0, y: 16 }, { opacity: 0.8, y: 0, duration: 0.5, ease: 'power2.out' }, 0.2);
      tl.fromTo('.sc-num', { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'power3.out' }, 0.35);
      tl.fromTo(counter, { value: 0 }, { value: ${v.value}, duration: ${countFor}, ease: 'expo.out' }, 0.4);
      tl.fromTo('.sc-rule', { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: 'power3.inOut' }, 0.7);
      tl.fromTo('.sc-caption', { opacity: 0 }, { opacity: 0.6, duration: 0.5 }, 1.3);
      tl.to('.sc', { opacity: 0, duration: ${OUTRO}, ease: 'power2.in' }, ${v.duration - OUTRO});`;
    return { css, body, timeline };
  },
};
