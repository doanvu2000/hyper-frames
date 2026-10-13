<script setup>
import { ref } from 'vue';
import Icon from './Icon.vue';
import { filesFromInput, filesFromDrop, planImport, uploadImport } from '../lib/importFiles.js';
import { formatBytes } from '../lib/timecode.js';

defineProps({ assets: { type: Object, default: null } });
const emit = defineEmits(['imported', 'clear-assets']);

const over = ref(false);
const progress = ref(null);
const error = ref('');
const fileInput = ref(null);
const folderInput = ref(null);

async function run(itemsPromise) {
  error.value = '';
  try {
    const plan = planImport(await itemsPromise);
    progress.value = 0;
    const { html, projectId } = await uploadImport(plan, (p) => (progress.value = p));
    emit('imported', { html, projectId, label: plan.label, count: plan.assets.length, size: plan.total });
  } catch (err) {
    error.value = err.message;
  } finally {
    progress.value = null;
  }
}

function onDrop(e) {
  over.value = false;
  run(filesFromDrop(e.dataTransfer));
}
function onPick(e) {
  run(Promise.resolve(filesFromInput(e.target.files)));
  e.target.value = '';
}
</script>

<template>
  <div class="group">
    <h3 class="group-title">Import</h3>
    <div
      class="dropzone"
      :class="{ 'is-over': over, 'is-busy': progress !== null }"
      @dragover.prevent="over = true"
      @dragleave="over = false"
      @drop.prevent="onDrop"
    >
      <template v-if="progress === null">
        <Icon name="upload" :size="20" />
        <p>Drop an .html file or its folder here</p>
        <div class="dropzone-actions">
          <button type="button" class="text-btn" @click="fileInput.click()">Choose file</button>
          <button type="button" class="text-btn" @click="folderInput.click()">Choose folder</button>
        </div>
        <p class="field-hint">Import the folder when the HTML uses local images, video, audio or fonts.</p>
      </template>
      <template v-else>
        <p>Uploading assets · {{ Math.round(progress * 100) }}%</p>
        <div class="progress" role="progressbar" :aria-valuenow="Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100" aria-label="Import progress">
          <span class="progress-fill" :style="{ transform: `scaleX(${progress})` }" />
        </div>
      </template>
      <input ref="fileInput" type="file" accept=".html,.htm,text/html" hidden @change="onPick" />
      <input ref="folderInput" type="file" webkitdirectory multiple hidden @change="onPick" />
    </div>
    <p v-if="error" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ error }}</p>
    <div v-if="assets" class="asset-chip">
      <Icon name="layers" :size="15" />
      <span class="asset-chip-text">
        <strong>{{ assets.label }}</strong>
        <span>{{ assets.count }} asset{{ assets.count === 1 ? '' : 's' }} · {{ formatBytes(assets.size) }}</span>
      </span>
      <button type="button" class="ghost-btn" @click="emit('clear-assets')">Remove</button>
    </div>
  </div>
</template>
