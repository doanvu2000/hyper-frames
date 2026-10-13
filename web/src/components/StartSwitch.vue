<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
import TemplateThumb from './TemplateThumb.vue';
import { t } from '../lib/i18n.js';

const props = defineProps({
  templates: { type: Array, default: () => [] },
  thumbs: { type: Object, default: () => ({}) },
  activeId: { type: String, default: '' },
  mode: { type: String, default: 'html' },
});
const emit = defineEmits(['select', 'custom']);

const open = ref(false);
const root = ref(null);
const active = computed(() => (props.mode === 'template' ? props.templates.find((tpl) => tpl.id === props.activeId) : null));
const posterTime = (tpl) => Math.min(3, tpl.duration - 1);

function pick(id) {
  emit('select', id);
  open.value = false;
}

function onDocPointer(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false;
}
function onKey(e) {
  if (e.key === 'Escape' && open.value) {
    open.value = false;
    root.value?.querySelector('.start-tpl')?.focus();
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer);
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <nav ref="root" class="start" :aria-label="t('rail.nav')">
    <button type="button" class="start-btn" :aria-current="mode === 'html' ? 'true' : undefined" @click="emit('custom')">
      <Icon name="sparkles" :size="16" />
      <span>{{ t('rail.custom') }}</span>
    </button>
    <button
      type="button"
      class="start-btn start-tpl"
      :aria-current="mode === 'template' ? 'true' : undefined"
      :aria-expanded="open"
      aria-controls="start-templates"
      @click="open = !open"
    >
      <Icon name="layers" :size="16" />
      <span class="start-tpl-text">{{ active ? active.name : t('rail.templates') }}</span>
      <Icon name="chevron-down" :size="14" class="start-chevron" />
    </button>

    <div v-if="open" id="start-templates" class="start-panel" role="dialog" :aria-label="t('rail.templates')">
      <p class="start-panel-hint">{{ t('rail.templatesHint') }}</p>
      <ul class="start-grid">
        <li v-for="tpl in templates" :key="tpl.id">
          <button
            type="button"
            class="start-card"
            :aria-current="mode === 'template' && tpl.id === activeId ? 'true' : undefined"
            @click="pick(tpl.id)"
          >
            <TemplateThumb :html="thumbs[tpl.id]" :time="posterTime(tpl)" />
            <span class="start-card-name">{{ tpl.name }}</span>
            <span class="start-card-summary">{{ tpl.summary }}</span>
          </button>
        </li>
      </ul>
    </div>
  </nav>
</template>
