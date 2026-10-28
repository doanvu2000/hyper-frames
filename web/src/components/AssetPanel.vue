<script setup>
import { ref, watch } from 'vue';
import Icon from './Icon.vue';
import ImportZone from './ImportZone.vue';
import { api } from '../lib/api.js';
import { formatBytes } from '../lib/timecode.js';
import { t } from '../lib/i18n.js';

const props = defineProps({
  projectId: { type: String, default: '' },
  assets: { type: Object, default: null },
});
const emit = defineEmits(['imported', 'clear-assets', 'copied']);

const files = ref([]);
const ICON = [
  [/\.(png|jpe?g|webp|gif|svg|avif)$/i, 'image'],
  [/\.(mp3|ogg|wav|m4a|aac|flac)$/i, 'music'],
  [/\.(ttf|otf|woff2?)$/i, 'type'],
  [/\.(mp4|webm|mov)$/i, 'film'],
];
const iconFor = (path) => ICON.find(([re]) => re.test(path))?.[1] ?? 'file';

watch(
  () => props.projectId,
  async (id) => {
    files.value = [];
    if (!id) return;
    try {
      files.value = (await api(`/projects/${id}`)).files.filter((f) => !/(^|\/)index\.html?$/i.test(f.path));
    } catch {}
  },
  { immediate: true },
);

async function copy(path) {
  try {
    await navigator.clipboard.writeText(path);
    emit('copied', path);
  } catch {}
}
</script>

<template>
  <div class="asset-panel">
    <ImportZone :assets="assets" @imported="(p) => emit('imported', p)" @clear-assets="emit('clear-assets')" />
    <div v-if="files.length" class="group">
      <h3 class="group-title">{{ t('assets.files', { n: files.length }) }}</h3>
      <ul class="asset-list">
        <li v-for="f in files" :key="f.path">
          <button type="button" class="asset-row" :title="t('assets.copy')" @click="copy(f.path)">
            <Icon :name="iconFor(f.path)" :size="15" />
            <span class="asset-path">{{ f.path }}</span>
            <span class="asset-size">{{ formatBytes(f.size) }}</span>
          </button>
        </li>
      </ul>
      <p class="field-hint">{{ t('assets.hint') }}</p>
    </div>
  </div>
</template>
