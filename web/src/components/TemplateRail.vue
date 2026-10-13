<script setup>
import Icon from './Icon.vue';

defineProps({
  templates: { type: Array, default: () => [] },
  activeId: { type: String, default: '' },
  mode: { type: String, default: 'template' },
});
const emit = defineEmits(['select', 'custom']);
</script>

<template>
  <nav class="rail" aria-label="Templates">
    <h2 class="panel-title"><Icon name="layers" :size="16" /> Templates</h2>
    <ul class="rail-list">
      <li v-for="t in templates" :key="t.id">
        <button
          type="button"
          class="rail-item"
          :class="{ 'is-active': mode === 'template' && t.id === activeId }"
          :aria-current="mode === 'template' && t.id === activeId ? 'true' : undefined"
          @click="emit('select', t.id)"
        >
          <span class="rail-name">{{ t.name }}</span>
          <span class="rail-summary">{{ t.summary }}</span>
          <span class="rail-length">{{ t.duration }}s default</span>
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
          <span class="rail-name"><Icon name="code" :size="15" /> Custom HTML</span>
          <span class="rail-summary">Write or paste your own composition. Same rules as the HyperFrames CLI.</span>
        </button>
      </li>
    </ul>
  </nav>
</template>
