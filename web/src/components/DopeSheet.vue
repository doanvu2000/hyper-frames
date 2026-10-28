<script setup>
import { computed, ref } from 'vue';
import { timecode, PREVIEW_FPS } from '../lib/timecode.js';
import { t } from '../lib/i18n.js';

const props = defineProps({
  duration: { type: Number, default: 1 },
  time: { type: Number, default: 0 },
  tracks: { type: Array, default: () => [] },
  audio: { type: Array, default: () => [] },
  markers: { type: Array, default: () => [] },
  inPoint: { type: Number, default: null },
  outPoint: { type: Number, default: null },
});
const emit = defineEmits(['seek', 'scrub-start', 'remove-marker']);

const MAX_LANES = 8;
const area = ref(null);
const dragging = ref(false);

const audioLanes = computed(() =>
  props.audio.map((clip) => ({
    label: decodeURIComponent(clip.url.split('/').pop() ?? 'audio'),
    start: clip.start,
    end: clip.duration ? clip.start + clip.duration : props.duration,
  })),
);
const lanes = computed(() => props.tracks.slice(0, Math.max(1, MAX_LANES - audioLanes.value.length)));
const hiddenCount = computed(() => Math.max(0, props.tracks.length - lanes.value.length));
const ratio = (v) => Math.min(Math.max(v, 0), props.duration) / props.duration;
const pct = (v) => `${ratio(v) * 100}%`;
const range = computed(() => {
  const a = props.inPoint ?? 0;
  const b = props.outPoint ?? props.duration;
  return props.inPoint === null && props.outPoint === null ? null : { left: pct(a), width: `${(ratio(b) - ratio(a)) * 100}%` };
});

const ticks = computed(() => {
  const d = props.duration;
  const step = d > 30 ? 5 : d > 12 ? 2 : 1;
  const out = [];
  for (let s = 0; s <= d + 1e-6; s += step) out.push(s);
  return out;
});

// Deterministic pseudo-waveform: the real samples live in the audio thread, and a drawn shape only signals "sound here".
const WAVE = Array.from({ length: 96 }, (_, i) => 0.25 + Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11)) * 0.75);

function timeAt(clientX) {
  const rect = area.value.getBoundingClientRect();
  const r = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return Math.round(r * props.duration * PREVIEW_FPS) / PREVIEW_FPS;
}
function onPointerDown(e) {
  if (e.button !== 0) return;
  dragging.value = true;
  area.value.setPointerCapture(e.pointerId);
  emit('scrub-start');
  emit('seek', timeAt(e.clientX));
}
function onPointerMove(e) {
  if (dragging.value) emit('seek', timeAt(e.clientX));
}
function onPointerUp(e) {
  dragging.value = false;
  area.value.releasePointerCapture?.(e.pointerId);
}
function onKey(e) {
  const frame = 1 / PREVIEW_FPS;
  const moves = { ArrowLeft: -(e.shiftKey ? 1 : frame), ArrowRight: e.shiftKey ? 1 : frame, PageDown: -1, PageUp: 1 };
  let next;
  if (e.key in moves) next = props.time + moves[e.key];
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = props.duration;
  else return;
  e.preventDefault();
  e.stopPropagation();
  emit('scrub-start');
  emit('seek', Math.min(props.duration, Math.max(0, next)));
}
</script>

<template>
  <section class="dope" :aria-label="t('dope.aria')">
    <div class="dope-corner">{{ t('dope.layers', { n: tracks.length + audio.length }) }}</div>
    <div class="dope-ruler">
      <span v-for="s in ticks" :key="s" class="dope-tick" :style="{ left: pct(s) }">{{ s }}s</span>
      <span v-if="range" class="dope-range dope-range--ruler" :style="range" />
      <button
        v-for="m in markers"
        :key="m"
        type="button"
        class="dope-marker"
        :style="{ left: pct(m) }"
        :title="t('dope.marker', { tc: timecode(m) })"
        :aria-label="t('dope.marker', { tc: timecode(m) })"
        @click="emit('seek', m)"
        @dblclick="emit('remove-marker', m)"
      />
      <span class="dope-ph-tag" :data-edge="time < duration * 0.05 ? 'start' : time > duration * 0.95 ? 'end' : undefined" :style="{ left: pct(time) }">{{ timecode(time) }}</span>
    </div>

    <div class="dope-names">
      <div v-for="lane in lanes" :key="lane.label" class="dope-name" :title="lane.label">{{ lane.label }}</div>
      <div v-for="(a, i) in audioLanes" :key="`a${i}`" class="dope-name dope-name--audio" :title="a.label">♪ {{ a.label }}</div>
      <div v-if="!lanes.length && !audioLanes.length" class="dope-name dope-name--empty">{{ t('dope.empty') }}</div>
      <div v-if="hiddenCount" class="dope-name dope-name--more">{{ t('dope.more', { n: hiddenCount }) }}</div>
    </div>

    <div
      ref="area"
      class="dope-lanes"
      role="slider"
      tabindex="0"
      :aria-label="t('dope.playhead')"
      :aria-valuemin="0"
      :aria-valuemax="duration"
      :aria-valuenow="Number(time.toFixed(2))"
      :aria-valuetext="timecode(time)"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKey"
    >
      <span v-if="range" class="dope-range" :style="range" />
      <div v-for="lane in lanes" :key="lane.label" class="dope-lane">
        <span
          v-for="(bar, i) in lane.bars"
          :key="i"
          class="dope-bar"
          :class="{ 'is-live': time >= bar.start && time <= bar.end }"
          :style="{ left: pct(bar.start), width: `max(3px, calc(${pct(bar.end)} - ${pct(bar.start)}))` }"
        />
      </div>
      <div v-for="(a, i) in audioLanes" :key="`a${i}`" class="dope-lane">
        <span class="dope-bar dope-bar--audio" :style="{ left: pct(a.start), width: `calc(${pct(a.end)} - ${pct(a.start)})` }">
          <i v-for="(h, k) in WAVE" :key="k" :style="{ height: `${h * 100}%` }" />
        </span>
      </div>
      <div v-if="hiddenCount" class="dope-lane" />
      <span class="dope-playhead" :style="{ left: pct(time) }" />
    </div>
  </section>
</template>
