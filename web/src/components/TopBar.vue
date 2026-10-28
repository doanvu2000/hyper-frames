<script setup>
import { computed } from 'vue';
import Icon from './Icon.vue';
import ProjectMenu from './ProjectMenu.vue';
import ConnectionsMenu from './ConnectionsMenu.vue';
import { t, locale, setLocale } from '../lib/i18n.js';

const props = defineProps({
  library: { type: Object, required: true },
  status: { type: Object, default: null },
  renders: { type: Array, default: () => [] },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
  theme: { type: String, default: 'system' },
  exportDisabled: { type: Boolean, default: false },
});
const emit = defineEmits(['undo', 'redo', 'status', 'renders', 'palette', 'guide', 'theme', 'export', 'project']);

const THEME_ICON = { system: 'monitor', light: 'sun', dark: 'moon' };
const active = computed(() => props.renders.filter((r) => r.status === 'running' || r.status === 'queued'));
const running = computed(() => props.renders.find((r) => r.status === 'running'));
const chipText = computed(() =>
  running.value ? t('top.rendering', { p: Math.round(running.value.progress) }) : t('top.queued', { n: active.value.length }),
);
</script>

<template>
  <header class="top">
    <img class="brand-mark" src="/logo.svg" alt="HyperFrames Studio" width="26" height="26" />
    <ProjectMenu
      :docs="library.docs.value"
      :current-id="library.id.value"
      :name="library.name.value"
      :save-state="library.saveState.value"
      @refresh="library.refresh()"
      @open="(id) => emit('project', 'open', id)"
      @create="emit('project', 'create')"
      @duplicate="emit('project', 'duplicate')"
      @rename="(name) => emit('project', 'rename', name)"
      @remove="(id) => emit('project', 'remove', id)"
    />
    <span class="top-sep" aria-hidden="true" />
    <button type="button" class="icon-btn top-hist" :disabled="!canUndo" :aria-label="t('top.undo')" :title="t('top.undoKey')" @click="emit('undo')">
      <Icon name="undo" :size="17" />
    </button>
    <button type="button" class="icon-btn top-hist" :disabled="!canRedo" :aria-label="t('top.redo')" :title="t('top.redoKey')" @click="emit('redo')">
      <Icon name="redo" :size="17" />
    </button>

    <span class="top-grow" />

    <ConnectionsMenu class="top-conn" :status="status" :renders="renders" @status="(s) => emit('status', s)" />
    <button v-if="active.length" type="button" class="chip chip--rec" :title="t('top.openRenders')" @click="emit('renders')">
      <span class="state-dot" data-state="rendering" aria-hidden="true" />
      <span class="chip-text">{{ chipText }}</span>
    </button>

    <span class="top-sep" aria-hidden="true" />
    <button type="button" class="icon-btn top-opt" :aria-label="t('top.palette')" :title="t('top.paletteKey')" @click="emit('palette')">
      <Icon name="command" :size="17" />
    </button>
    <button type="button" class="icon-btn top-opt" :aria-label="t('app.openGuide')" :title="t('app.guide')" @click="emit('guide')">
      <Icon name="help" :size="17" />
    </button>
    <button type="button" class="icon-btn lang-btn" :aria-label="t('app.language')" :title="t('app.language')" @click="setLocale(locale === 'vi' ? 'en' : 'vi')">
      {{ locale.toUpperCase() }}
    </button>
    <button
      type="button"
      class="icon-btn"
      :aria-label="t('app.theme', { theme: t(`theme.${theme}`) })"
      :title="t('app.themeTitle', { theme: t(`theme.${theme}`) })"
      @click="emit('theme')"
    >
      <Icon :name="THEME_ICON[theme]" :size="17" />
    </button>
    <button type="button" class="btn btn--go top-export" :disabled="exportDisabled" :title="t('top.exportKey')" @click="emit('export')">
      <Icon name="export" :size="16" /><span>{{ t('top.export') }}</span>
    </button>
  </header>
</template>
