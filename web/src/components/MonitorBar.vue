<script setup>
import { computed } from 'vue';
import Dropdown from './Dropdown.vue';
import Icon from './Icon.vue';
import { t } from '../lib/i18n.js';

defineProps({
  overlay: { type: String, default: '' },
  zoom: { type: [String, Number], default: 'fit' },
  snapping: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['overlay', 'zoom', 'snapshot']);

const overlays = computed(() => [
  { value: '', label: t('overlay.none') },
  { value: 'title', label: t('overlay.title'), hint: t('overlay.titleHint'), group: t('overlay.tv') },
  { value: 'tiktok', label: 'TikTok', kbd: 'Shift S', group: t('overlay.social') },
  { value: 'reels', label: 'Instagram Reels', group: t('overlay.social') },
  { value: 'shorts', label: 'YouTube Shorts', group: t('overlay.social') },
]);
const zooms = computed(() => [
  { value: 'fit', label: t('zoom.fit'), kbd: 'Shift F' },
  { value: 0.5, label: '50%', group: t('zoom.fixed') },
  { value: 1, label: '100%', kbd: 'Shift 1', group: t('zoom.fixed') },
  { value: 2, label: '200%', group: t('zoom.fixed') },
]);
</script>

<template>
  <div class="mon-bar">
    <Dropdown
      :model-value="overlay"
      :options="overlays"
      :label="t('overlay.label')"
      icon="scan"
      trigger-class="wchip"
      @update:model-value="(v) => emit('overlay', v)"
    />
    <Dropdown
      :model-value="zoom"
      :options="zooms"
      :label="t('zoom.label')"
      trigger-class="wchip"
      @update:model-value="(v) => emit('zoom', v)"
    />
    <span class="mon-grow" />
    <button type="button" class="wchip" :disabled="disabled || snapping" :title="t('snap.title')" @click="emit('snapshot')">
      <Icon :name="snapping ? 'loader' : 'camera'" :size="15" :class="{ spin: snapping }" />
      <span class="wchip-text">{{ t('snap.button') }}</span>
    </button>
  </div>
</template>
