<script setup>
import Icon from './Icon.vue';
import TemplateThumb from './TemplateThumb.vue';

defineProps({
  templates: { type: Array, default: () => [] },
  thumbs: { type: Object, default: () => ({}) },
  activeId: { type: String, default: '' },
  mode: { type: String, default: 'template' },
});
const emit = defineEmits(['select', 'custom']);
const posterTime = (t) => Math.min(3, t.duration - 1);
</script>

<template>
  <nav class="rail" aria-label="Templates">
    <h2 class="panel-title">Templates</h2>
    <ul class="rail-list">
      <li v-for="t in templates" :key="t.id">
        <button
          type="button"
          class="rail-item"
          :class="{ 'is-active': mode === 'template' && t.id === activeId }"
          :aria-current="mode === 'template' && t.id === activeId ? 'true' : undefined"
          @click="emit('select', t.id)"
        >
          <TemplateThumb :html="thumbs[t.id]" :time="posterTime(t)" />
          <span class="rail-text">
            <span class="rail-name">{{ t.name }}</span>
            <span class="rail-summary">{{ t.summary }}</span>
          </span>
        </button>
      </li>
      <li>
        <button
          type="button"
          class="rail-item rail-item--custom"
          :class="{ 'is-active': mode === 'html' }"
          :aria-current="mode === 'html' ? 'true' : undefined"
          @click="emit('custom')"
        >
          <span class="thumb thumb--code" aria-hidden="true"><Icon name="sparkles" :size="22" /></span>
          <span class="rail-text">
            <span class="rail-name">AI &amp; custom HTML</span>
            <span class="rail-summary">Generate with AI, import a file or folder, or paste your own.</span>
          </span>
        </button>
      </li>
    </ul>
  </nav>
</template>
