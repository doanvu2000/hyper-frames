<script setup>
import { computed, ref } from 'vue';
import { timecode, PREVIEW_FPS } from '../lib/timecode.js';

const props = defineProps({
  duration: { type: Number, default: 1 },
  time: { type: Number, default: 0 },
  tracks: { type: Array, default: () => [] },
});
const emit = defineEmits(['seek', 'scrub-start']);

const MAX_LANES = 7;
const area = ref(null);
const dragging = ref(false);

const lanes = computed(() => props.tracks.slice(0, MAX_LANES));
const hiddenCount = computed(() => Math.max(0, props.tracks.length - MAX_LANES));
const pct = (t) => `${(Math.min(Math.max(t, 0), props.duration) / props.duration) * 100}%`;

const ticks = computed(() => {
  const d = props.duration;
  const step = d > 20 ? 5 : d > 8 ? 1 : 0.5;
  const out = [];
  for (let t = 0; t <= d + 1e-6; t += step) {
    const major = Math.abs(t - Math.round(t)) < 1e-6;
    out.push({ t, major, odd: major && Math.round(t / Math.max(1, step)) % 2 === 1, last: d - t < step });
  }
  return out;
});

function timeAt(clientX) {
  const rect = area.value.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return Math.round(ratio * props.duration * PREVIEW_FPS) / PREVIEW_FPS;
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
  const moves = {
    ArrowLeft: -(e.shiftKey ? 1 : frame),
    ArrowRight: e.shiftKey ? 1 : frame,
    PageDown: -1,
    PageUp: 1,
  };
  let next;
  if (e.key in moves) next = props.time + moves[e.key];
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = props.duration;
  else return;
  e.preventDefault();
  emit('scrub-start');
  emit('seek', Math.min(props.duration, Math.max(0, next)));
}
</script>

<template>
  <section class="dope" aria-label="Animation timeline">
    <div class="dope-grid">
      <div class="dope-corner">Layer</div>
      <div class="dope-ruler">
        <span
          v-for="tick in ticks"
          :key="tick.t"
          class="dope-tick"
          :class="{ 'is-major': tick.major, 'is-odd': tick.odd, 'is-last': tick.last }"
          :style="{ left: pct(tick.t) }"
        >
          <span v-if="tick.major" class="dope-tick-label">{{ tick.t }}s</span>
        </span>
      </div>

      <template v-for="lane in lanes" :key="lane.label">
        <div class="dope-label" :title="lane.label">{{ lane.label }}</div>
        <div class="dope-lane">
          <span
            v-for="(bar, i) in lane.bars"
            :key="i"
            class="dope-bar"
            :class="{ 'is-live': time >= bar.start && time <= bar.end }"
            :style="{ left: pct(bar.start), width: `max(3px, calc(${pct(bar.end)} - ${pct(bar.start)}))` }"
          />
        </div>
      </template>
      <p v-if="!lanes.length" class="dope-empty">No tweens on the main timeline yet. Add them with tl.to / tl.fromTo.</p>
      <p v-if="hiddenCount" class="dope-more">+{{ hiddenCount }} more layers</p>

      <div
        ref="area"
        class="dope-hit"
        role="slider"
        tabindex="0"
        aria-label="Playhead"
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
        <div class="dope-playhead" :style="{ left: pct(time) }">
          <span class="dope-flag">{{ timecode(time) }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
