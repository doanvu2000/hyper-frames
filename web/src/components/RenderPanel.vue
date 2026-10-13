<script setup>
import { reactive, computed } from 'vue';
import Icon from './Icon.vue';

defineProps({
  disabled: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
  error: { type: String, default: '' },
});
const emit = defineEmits(['submit']);

const FORMATS = [
  { id: 'mp4', label: 'MP4', note: 'H.264, plays everywhere' },
  { id: 'webm', label: 'WebM', note: 'VP9, keeps transparency' },
  { id: 'mov', label: 'MOV', note: 'ProRes 4444 for editing apps' },
  { id: 'gif', label: 'GIF', note: 'For docs and chats; 24 fps works best' },
];
const QUALITY = [
  { id: 'draft', label: 'Draft', note: 'Fastest, for checking timing' },
  { id: 'looks', label: 'Standard', note: 'Good for most uses' },
  { id: 'delivery', label: 'Delivery', note: 'Highest quality, slowest' },
];
const settings = reactive({ format: 'mp4', fps: 30, quality: 'looks' });
const pick = (list, id) => list.find((x) => x.id === id);
const summary = computed(() => `${pick(FORMATS, settings.format).label} · ${settings.fps} fps · ${pick(QUALITY, settings.quality).label}`);
</script>

<template>
  <section class="render-bar" aria-label="Render">
    <details class="output">
      <summary class="output-summary">
        <span class="output-label">Output</span>
        <span class="output-value">{{ summary }}</span>
        <Icon name="chevron-right" :size="16" class="output-chevron" />
      </summary>
      <div class="output-grid">
        <div class="field">
          <label class="field-label" for="render-format">Format</label>
          <select id="render-format" v-model="settings.format" class="input">
            <option v-for="f in FORMATS" :key="f.id" :value="f.id">{{ f.label }}</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="render-fps">Frame rate</label>
          <select id="render-fps" v-model.number="settings.fps" class="input">
            <option :value="24">24 fps</option>
            <option :value="30">30 fps</option>
            <option :value="60">60 fps</option>
          </select>
        </div>
        <div class="field output-wide">
          <label class="field-label" for="render-quality">Quality</label>
          <select id="render-quality" v-model="settings.quality" class="input">
            <option v-for="q in QUALITY" :key="q.id" :value="q.id">{{ q.label }}</option>
          </select>
        </div>
        <p class="field-hint output-wide">
          {{ pick(FORMATS, settings.format).note }}. {{ pick(QUALITY, settings.quality).note }}.
        </p>
      </div>
    </details>
    <p v-if="error" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ error }}</p>
    <button
      type="button"
      class="primary-btn"
      :disabled="disabled || submitting"
      :aria-busy="submitting"
      @click="emit('submit', { ...settings })"
    >
      <Icon :name="submitting ? 'loader' : 'film'" :class="{ spin: submitting }" />
      Render {{ pick(FORMATS, settings.format).label }}
    </button>
  </section>
</template>
