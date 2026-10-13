<script setup>
import { reactive, computed } from 'vue';
import Icon from './Icon.vue';

defineProps({
  disabled: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
  error: { type: String, default: '' },
  queued: { type: Number, default: 0 },
});
const emit = defineEmits(['submit']);

const FORMATS = [
  { id: 'mp4', label: 'MP4', note: 'H.264, plays everywhere' },
  { id: 'webm', label: 'WebM', note: 'VP9, keeps transparency' },
  { id: 'mov', label: 'MOV', note: 'ProRes 4444 for editing' },
  { id: 'gif', label: 'GIF', note: 'For docs and chats; use 24 fps' },
];
const QUALITY = [
  { id: 'draft', label: 'Draft', note: 'Fastest, for checking timing' },
  { id: 'looks', label: 'Standard', note: 'CRF 16, the CLI default' },
  { id: 'delivery', label: 'Delivery', note: 'Highest quality, slowest' },
];
const settings = reactive({ format: 'mp4', fps: 30, quality: 'looks' });
const formatLabel = computed(() => FORMATS.find((f) => f.id === settings.format).label);
const note = (list, id) => list.find((x) => x.id === id)?.note;
</script>

<template>
  <section class="render-panel" aria-label="Render settings">
    <h2 class="panel-title"><Icon name="film" :size="16" /> Render</h2>
    <div class="render-grid">
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
      <div class="field render-grid-wide">
        <label class="field-label" for="render-quality">Quality</label>
        <select id="render-quality" v-model="settings.quality" class="input">
          <option v-for="q in QUALITY" :key="q.id" :value="q.id">{{ q.label }}</option>
        </select>
      </div>
    </div>
    <p class="field-hint">{{ note(FORMATS, settings.format) }} · {{ note(QUALITY, settings.quality) }}</p>
    <button
      type="button"
      class="primary-btn"
      :disabled="disabled || submitting"
      :aria-busy="submitting"
      @click="emit('submit', { ...settings })"
    >
      <Icon :name="submitting ? 'loader' : 'film'" :class="{ spin: submitting }" />
      Render {{ formatLabel }}
    </button>
    <p v-if="queued" class="field-hint">{{ queued }} render{{ queued > 1 ? 's' : '' }} ahead in the queue.</p>
    <p v-if="error" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ error }}</p>
  </section>
</template>
