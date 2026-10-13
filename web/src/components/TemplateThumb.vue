<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { withPreviewShim } from '../lib/previewShim.js';

const props = defineProps({
  html: { type: String, default: '' },
  time: { type: Number, default: 2 },
});

const box = ref(null);
const frame = ref(null);
const scale = ref(0.1);
const ready = ref(false);
const doc = computed(() => (props.html ? withPreviewShim(props.html, 'thumb') : ''));

async function onLoad() {
  const win = frame.value?.contentWindow;
  if (!win?.__hfPreview) return;
  await Promise.race([win.document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
  win.__hfPreview.seek(props.time);
  ready.value = true;
}

let observer;
onMounted(() => {
  observer = new ResizeObserver(() => (scale.value = box.value.clientWidth / 1920));
  observer.observe(box.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <span ref="box" class="thumb" :class="{ 'is-ready': ready }" aria-hidden="true">
    <iframe
      v-if="doc"
      ref="frame"
      class="thumb-frame"
      :srcdoc="doc"
      tabindex="-1"
      title=""
      loading="lazy"
      :style="{ transform: `scale(${scale})` }"
      @load="onLoad"
    />
  </span>
</template>
