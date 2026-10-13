import { readableOn, splitWords, fontField, colorField, durationField, OUTRO } from './util.js';

export default {
  id: 'title-card',
  name: 'Title card',
  summary: 'Headline that rises word by word, with an eyebrow and subtitle. For intros and chapter breaks.',
  duration: 6,
  fields: [
    { id: 'eyebrow', label: 'Eyebrow', type: 'text', default: 'Chapter two', maxLength: 40 },
    { id: 'headline', label: 'Headline', type: 'textarea', default: 'Make motion from markup', maxLength: 90 },
    { id: 'subtitle', label: 'Subtitle', type: 'text', default: 'HTML in, video out.', maxLength: 120 },
    colorField('accent', 'Accent', '#3D5AFE'),
    colorField('background', 'Background', '#0E1116'),
    fontField(),
    durationField(6),
  ],
  build(v, c) {
    const ink = readableOn(v.background);
    const css = `
      .tc { display: flex; flex-direction: column; justify-content: center; gap: ${c.px(30)}; padding: 0 ${c.portrait ? c.px(90) : c.px(150)}; color: ${ink}; }
      .tc-bar { width: ${c.px(120)}; height: ${c.px(10)}; background: ${v.accent}; transform-origin: left center; }
      .tc-eyebrow { font-size: ${c.px(30)}; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: ${v.accent}; }
      .tc-headline { font-size: ${c.px(c.portrait ? 112 : 128)}; font-weight: 800; line-height: 1; letter-spacing: -0.02em; max-width: ${c.portrait ? '100%' : '15ch'}; }
      .tc-headline .w { display: inline-block; overflow: hidden; vertical-align: top; padding-bottom: 0.08em; }
      .tc-headline .wi { display: inline-block; }
      .tc-sub { font-size: ${c.px(40)}; opacity: 0.72; max-width: 32ch; }`;
    const body = `
      <div id="scene" class="clip tc" data-start="0" data-duration="${v.duration}" data-track-index="0">
        <div class="tc-bar"></div>
        <p class="tc-eyebrow">${c.esc(v.eyebrow)}</p>
        <h1 class="tc-headline">${splitWords(v.headline, c.esc)}</h1>
        <p class="tc-sub">${c.esc(v.subtitle)}</p>
      </div>`;
    const timeline = `
      tl.fromTo('.tc-bar', { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'power3.out' }, 0.1);
      tl.fromTo('.tc-eyebrow', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 0.3);
      tl.fromTo('.tc-headline .wi', { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: 'power4.out', stagger: 0.08 }, 0.45);
      tl.fromTo('.tc-sub', { opacity: 0, y: 24 }, { opacity: 0.72, y: 0, duration: 0.6, ease: 'power2.out' }, 1.2);
      tl.to('.tc', { opacity: 0, y: -30, duration: ${OUTRO}, ease: 'power2.in' }, ${v.duration - OUTRO});`;
    return { css, body, timeline };
  },
};
