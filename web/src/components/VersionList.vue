<script setup>
import { computed } from 'vue';
import Icon from './Icon.vue';
import { t, locale } from '../lib/i18n.js';

const props = defineProps({
  versions: { type: Array, default: () => [] },
  currentId: { type: String, default: '' },
  previewId: { type: String, default: '' },
  filter: { type: String, default: 'all' },
});
const emit = defineEmits(['preview', 'restore']);

const ICON = { api: 'sparkles', 'claude-cli': 'sparkles', 'codex-cli': 'sparkles', manual: 'pencil', mcp: 'plug', template: 'layers', import: 'upload', restore: 'undo' };
const AI = new Set(['api', 'claude-cli', 'codex-cli', 'mcp']);
const SOURCE = { api: 'Claude API', 'claude-cli': 'Claude CLI', 'codex-cli': 'Codex CLI' };

const rows = computed(() =>
  [...props.versions]
    .reverse()
    .filter((v) => props.filter === 'all' || (props.filter === 'ai' ? AI.has(v.source) : !AI.has(v.source))),
);
const sourceLabel = (v) => SOURCE[v.source] ?? t(`ver.source.${v.source}`);
const title = (v) => v.note || t(`ver.default.${v.source}`);
const when = (iso) => {
  const diff = (Date.now() - new Date(iso)) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
  if (diff < 60) return rtf.format(0, 'second');
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  return new Intl.DateTimeFormat(locale.value, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
};
</script>

<template>
  <ul class="versions" :aria-label="t('ver.aria')">
    <li v-for="v in rows" :key="v.id" class="ver" :data-current="v.id === currentId ? '' : undefined" :data-preview="v.id === previewId ? '' : undefined">
      <span class="ver-icon" aria-hidden="true"><Icon :name="ICON[v.source] ?? 'file'" :size="15" /></span>
      <span class="ver-text">
        <span class="ver-title" :title="title(v)">{{ title(v) }}</span>
        <small>{{ sourceLabel(v) }} · {{ when(v.at) }}</small>
      </span>
      <span v-if="v.id === currentId" class="ver-tag">{{ t('ver.current') }}</span>
      <span v-else class="ver-acts">
        <button
          type="button"
          class="icon-btn"
          :aria-pressed="v.id === previewId"
          :aria-label="t('ver.preview', { name: title(v) })"
          :title="t('ver.previewTitle')"
          @click="emit('preview', v.id)"
        >
          <Icon name="columns" :size="15" />
        </button>
        <button type="button" class="icon-btn" :aria-label="t('ver.restore', { name: title(v) })" :title="t('ver.restoreTitle')" @click="emit('restore', v.id)">
          <Icon name="undo" :size="15" />
        </button>
      </span>
    </li>
    <li v-if="!rows.length" class="ver-empty">{{ t('ver.empty') }}</li>
  </ul>
</template>
