<script setup>
import { ref, reactive, watch, onMounted, onBeforeUnmount } from 'vue';
import { withPreviewShim, readComposition } from '../lib/previewShim.js';
import Icon from './Icon.vue';
import { t } from '../lib/i18n.js';

const props = defineProps({
  html: { type: String, default: '' },
  time: { type: Number, default: 0 },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
  base: { type: String, default: '' },
});
const emit = defineEmits(['ready']);

const well = ref(null);
const frameEls = ref([]);
// Two iframes: the next composition loads behind the visible one, so edits never flash an empty frame.
const docs = reactive(['', '']);
const front = ref(0);
const size = reactive({ w: 1920, h: 1080 });
const scale = ref(0.25);
const scriptErrors = ref([]);
const tokens = [0, 0];
let rev = 0;

watch(
  () => [props.html, props.base],
  ([html, base]) => {
    if (!html) return;
    const target = docs[front.value] ? 1 - front.value : front.value;
    rev += 1;
    tokens[target] = rev;
    docs[target] = withPreviewShim(html, rev, base);
  },
  { immediate: true },
);

async function onLoad(i) {
  if (tokens[i] !== rev || !docs[i]) return;
  const win = frameEls.value[i]?.contentWindow;
  if (!win) return;
  await Promise.race([win.document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
  if (tokens[i] !== rev) return;
  let info;
  try {
    info = readComposition(win);
  } catch (err) {
    info = { duration: 1, width: 1920, height: 1080, tracks: [], audio: [], hasTimeline: false, errors: [String(err.message ?? err)] };
  }
  size.w = info.width;
  size.h = info.height;
  fit();
  win.__hfPreview?.seek(Math.min(props.time, info.duration));
  front.value = i;
  scriptErrors.value = info.errors;
  emit('ready', info);
}

watch(
  () => props.time,
  (t) => frameEls.value[front.value]?.contentWindow?.__hfPreview?.seek(t),
);

function fit() {
  const el = well.value;
  if (!el) return;
  const pad = window.matchMedia('(max-width: 640px)').matches ? 16 : 32;
  const aw = el.clientWidth - pad * 2;
  const ah = el.clientHeight - pad * 2;
  scale.value = Math.max(0.05, Math.min(aw / size.w, ah / size.h));
}

let observer;
onMounted(() => {
  observer = new ResizeObserver(fit);
  observer.observe(well.value);
  fit();
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div ref="well" class="stage-well" :style="{ '--frame-ratio': `${size.w} / ${size.h}` }">
    <div class="stage-frame" :style="{ width: `${size.w * scale}px`, height: `${size.h * scale}px` }">
      <iframe
        v-for="(doc, i) in docs"
        :key="i"
        :ref="(el) => (frameEls[i] = el)"
        class="stage-iframe"
        :class="{ 'is-front': i === front }"
        :srcdoc="doc"
        :title="i === front ? t('preview.frame') : t('preview.loading')"
        :aria-hidden="i !== front"
        tabindex="-1"
        :style="{ width: `${size.w}px`, height: `${size.h}px`, transform: `scale(${scale})` }"
        @load="onLoad(i)"
      />
    </div>
    <p v-if="busy" class="stage-busy" role="status">
      <Icon name="loader" :size="14" class="spin" /> {{ t('preview.updating') }}
    </p>
    <div v-if="error || scriptErrors.length" class="stage-alert" role="alert">
      <Icon name="alert" :size="16" />
      <span>{{ error || t('preview.scriptError', { message: scriptErrors[0] }) }}</span>
    </div>
  </div>
</template>
