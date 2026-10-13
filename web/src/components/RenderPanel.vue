<script setup>
import { reactive, computed } from 'vue';
import Icon from './Icon.vue';
import { t } from '../lib/i18n.js';

defineProps({
  disabled: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
  error: { type: String, default: '' },
});
const emit = defineEmits(['submit']);

const FORMATS = [
  { id: 'mp4', label: 'MP4' },
  { id: 'webm', label: 'WebM' },
  { id: 'mov', label: 'MOV' },
  { id: 'gif', label: 'GIF' },
];
const QUALITY = [
  { id: 'draft' },
  { id: 'looks' },
  { id: 'delivery' },
];
const settings = reactive({ format: 'mp4', fps: 30, quality: 'looks' });
const pick = (list, id) => list.find((x) => x.id === id);
const qualityLabel = (id) => t(`render.${id}`);
const summary = computed(() => `${pick(FORMATS, settings.format).label} · ${settings.fps} fps · ${qualityLabel(settings.quality)}`);
</script>

<template>
  <section class="render-bar" :aria-label="t('render.aria')">
    <details class="output">
      <summary class="output-summary">
        <span class="output-label">{{ t('render.output') }}</span>
        <span class="output-value">{{ summary }}</span>
        <Icon name="chevron-right" :size="16" class="output-chevron" />
      </summary>
      <div class="output-grid">
        <div class="field">
          <label class="field-label" for="render-format">{{ t('render.format') }}</label>
          <select id="render-format" v-model="settings.format" class="input">
            <option v-for="f in FORMATS" :key="f.id" :value="f.id">{{ f.label }}</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="render-fps">{{ t('render.fps') }}</label>
          <select id="render-fps" v-model.number="settings.fps" class="input">
            <option :value="24">24 fps</option>
            <option :value="30">30 fps</option>
            <option :value="60">60 fps</option>
          </select>
        </div>
        <div class="field output-wide">
          <label class="field-label" for="render-quality">{{ t('render.quality') }}</label>
          <select id="render-quality" v-model="settings.quality" class="input">
            <option v-for="q in QUALITY" :key="q.id" :value="q.id">{{ qualityLabel(q.id) }}</option>
          </select>
        </div>
        <p class="field-hint output-wide">
          {{ t(`render.${settings.format}`) }}. {{ t(`render.${settings.quality}Note`) }}.
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
      {{ t('render.button', { format: pick(FORMATS, settings.format).label }) }}
    </button>
  </section>
</template>
