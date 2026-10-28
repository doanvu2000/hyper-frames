import { ref } from 'vue';
import { MESSAGES } from './messages.js';
import { STUDIO_MESSAGES } from './messages-studio.js';

for (const code of Object.keys(STUDIO_MESSAGES)) Object.assign(MESSAGES[code], STUDIO_MESSAGES[code]);

const KEY = 'hfs-locale';
export const LOCALES = ['vi', 'en'];
export const locale = ref(readLocale());
applyLang(locale.value);

function readLocale() {
  try {
    const saved = localStorage.getItem(KEY);
    return LOCALES.includes(saved) ? saved : 'vi';
  } catch {
    return 'vi';
  }
}

function applyLang(code) {
  document.documentElement.lang = code;
}

export function setLocale(code) {
  if (!LOCALES.includes(code)) return;
  locale.value = code;
  applyLang(code);
  try {
    localStorage.setItem(KEY, code);
  } catch {}
}

export function t(key, params) {
  const text = MESSAGES[locale.value][key] ?? MESSAGES.en[key] ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : text;
}

const escape = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// For v-html: messages may mark **bold** and `code`; everything else, params included, is escaped first.
export function tr(key, params) {
  return escape(t(key, params))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}
