<script setup>
import { ref, watch } from 'vue';
import Icon from './Icon.vue';
import TemplateThumb from './TemplateThumb.vue';
import { t } from '../lib/i18n.js';

defineProps({
  templates: { type: Array, default: () => [] },
  thumbs: { type: Object, default: () => ({}) },
  activeId: { type: String, default: '' },
  mode: { type: String, default: 'template' },
});
const emit = defineEmits(['select', 'custom']);
const posterTime = (t) => Math.min(3, t.duration - 1);

const OPEN_KEY = 'hfs-templates-open';
const showTemplates = ref(readOpen());
function readOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}
watch(showTemplates, (open) => {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {}
});
</script>

<template>
  <nav class="rail" :aria-label="t('rail.nav')">
    <button
      type="button"
      class="rail-item rail-item--custom rail-item--lead"
      :class="{ 'is-active': mode === 'html' }"
      :aria-current="mode === 'html' ? 'true' : undefined"
      @click="emit('custom')"
    >
      <span class="thumb thumb--code" aria-hidden="true"><Icon name="sparkles" :size="22" /></span>
      <span class="rail-text">
        <span class="rail-name">{{ t('rail.custom') }}</span>
        <span class="rail-summary">{{ t('rail.customSummary') }}</span>
      </span>
    </button>

    <button
      type="button"
      class="rail-toggle"
      :aria-expanded="showTemplates"
      aria-controls="rail-templates"
      @click="showTemplates = !showTemplates"
    >
      <Icon name="layers" :size="14" />
      <span>{{ t('rail.templates') }}</span>
      <span class="rail-count">{{ templates.length }}</span>
      <Icon name="chevron-down" :size="14" class="rail-chevron" />
    </button>

    <ul v-show="showTemplates" id="rail-templates" class="rail-list">
      <li v-for="tpl in templates" :key="tpl.id">
        <button
          type="button"
          class="rail-item"
          :class="{ 'is-active': mode === 'template' && tpl.id === activeId }"
          :aria-current="mode === 'template' && tpl.id === activeId ? 'true' : undefined"
          @click="emit('select', tpl.id)"
        >
          <TemplateThumb :html="thumbs[tpl.id]" :time="posterTime(tpl)" />
          <span class="rail-text">
            <span class="rail-name">{{ tpl.name }}</span>
            <span class="rail-summary">{{ tpl.summary }}</span>
          </span>
        </button>
      </li>
    </ul>
  </nav>
</template>
