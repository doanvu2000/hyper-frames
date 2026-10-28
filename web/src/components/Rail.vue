<script setup>
import Icon from './Icon.vue';
import { t } from '../lib/i18n.js';

defineProps({
  active: { type: String, required: true },
  badge: { type: Number, default: 0 },
  live: { type: Boolean, default: false },
});
const emit = defineEmits(['select']);

const ITEMS = [
  { id: 'ai', icon: 'sparkles' },
  { id: 'code', icon: 'code' },
  { id: 'templates', icon: 'layers' },
  { id: 'assets', icon: 'image' },
  { id: 'renders', icon: 'film' },
];
</script>

<template>
  <nav class="rail" :aria-label="t('rail.aria')">
    <button
      v-for="(item, i) in ITEMS"
      :key="item.id"
      type="button"
      class="rail-item"
      :aria-current="active === item.id ? 'true' : undefined"
      :title="`${t(`rail.${item.id}`)} (Alt+${i + 1})`"
      @click="emit('select', item.id)"
    >
      <Icon :name="item.icon" :size="20" />
      <span>{{ t(`rail.${item.id}`) }}</span>
      <span v-if="item.id === 'renders' && badge" class="rail-badge" :data-live="live">{{ badge }}</span>
    </button>
    <button
      type="button"
      class="rail-item rail-push"
      :aria-current="active === 'history' ? 'true' : undefined"
      :title="`${t('rail.history')} (Alt+6)`"
      @click="emit('select', 'history')"
    >
      <Icon name="history" :size="20" />
      <span>{{ t('rail.history') }}</span>
    </button>
  </nav>
</template>
