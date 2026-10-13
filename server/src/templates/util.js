import { FONTS } from '../presets.js';

export function readableOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  return lum > 0.4 ? '#0E1116' : '#F5F6F8';
}

export function splitWords(text, esc) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `<span class="w"><span class="wi">${esc(w)}</span></span>`)
    .join(' ');
}

export const fontField = () => ({
  id: 'font',
  label: 'Typeface',
  type: 'select',
  default: 'geist',
  options: Object.entries(FONTS).map(([value, f]) => ({ value, label: f.label })),
});

export const colorField = (id, label, def) => ({ id, label, type: 'color', default: def });

export const durationField = (def, min = 3, max = 15) => ({
  id: 'duration',
  label: 'Length (seconds)',
  type: 'number',
  default: def,
  min,
  max,
  step: 0.5,
});

// Outro starts this many seconds before the end so every template lands on an empty frame.
export const OUTRO = 0.6;
