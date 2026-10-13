<script setup>
import { ref } from 'vue';
import Icon from './Icon.vue';
import { timecode, frameOf, PREVIEW_FPS } from '../lib/timecode.js';
import { t } from '../lib/i18n.js';

const props = defineProps({
  time: { type: Number, default: 0 },
  duration: { type: Number, default: 1 },
  playing: { type: Boolean, default: false },
  size: { type: String, default: '' },
  hasAudio: { type: Boolean, default: false },
  muted: { type: Boolean, default: false },
  volume: { type: Number, default: 1 },
  timeline: { type: Boolean, default: true },
  fullscreen: { type: Boolean, default: false },
});
const emit = defineEmits(['toggle', 'seek', 'scrub-start', 'mute', 'volume', 'timeline', 'fullscreen']);
const step = (dir) => emit('seek', Math.min(props.duration, Math.max(0, props.time + dir / PREVIEW_FPS)));
const level = () => (props.muted ? 0 : props.volume);

const bar = ref(null);
const hover = ref(null);
const scrubbing = ref(false);
const pct = (t) => `${(Math.min(Math.max(t, 0), props.duration) / props.duration) * 100}%`;
function timeAt(clientX) {
  const rect = bar.value.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return Math.round(ratio * props.duration * PREVIEW_FPS) / PREVIEW_FPS;
}
function onDown(e) {
  if (e.button !== 0) return;
  scrubbing.value = true;
  bar.value.setPointerCapture(e.pointerId);
  emit('scrub-start');
  emit('seek', timeAt(e.clientX));
}
function onMove(e) {
  hover.value = timeAt(e.clientX);
  if (scrubbing.value) emit('seek', hover.value);
}
function onUp() {
  scrubbing.value = false;
}
function onKey(e) {
  const moves = { ArrowLeft: -1 / PREVIEW_FPS, ArrowRight: 1 / PREVIEW_FPS, PageDown: -1, PageUp: 1 };
  let next;
  if (e.key in moves) next = props.time + (e.shiftKey ? Math.sign(moves[e.key]) : moves[e.key]);
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
  <div class="transport">
    <div
      ref="bar"
      class="seek"
      :class="{ 'is-scrubbing': scrubbing }"
      role="slider"
      tabindex="0"
      :aria-label="t('transport.seek')"
      :aria-valuemin="0"
      :aria-valuemax="duration"
      :aria-valuenow="Number(time.toFixed(2))"
      :aria-valuetext="timecode(time)"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @pointerleave="hover = null"
      @keydown="onKey"
    >
      <span class="seek-track">
        <span class="seek-fill" :style="{ width: pct(time) }" />
        <span v-if="hover !== null && !scrubbing" class="seek-ghost" :style="{ width: pct(hover) }" />
      </span>
      <span class="seek-thumb" :style="{ left: pct(time) }" />
      <span v-if="hover !== null" class="seek-tip" :style="{ left: pct(hover) }">{{ timecode(hover) }}</span>
    </div>
    <div class="transport-buttons">
      <button type="button" class="icon-btn" :aria-label="t('transport.start')" :title="t('transport.start')" @click="emit('seek', 0)">
        <Icon name="skip-back" />
      </button>
      <button type="button" class="icon-btn" :aria-label="t('transport.prev')" :title="t('transport.prev')" @click="step(-1)">
        <Icon name="chevron-left" />
      </button>
      <button
        type="button"
        class="icon-btn icon-btn--play"
        :aria-label="playing ? t('transport.pause') : t('transport.play')"
        :aria-pressed="playing"
        @click="emit('toggle')"
      >
        <Icon :name="playing ? 'pause' : 'play'" :size="20" />
      </button>
      <button type="button" class="icon-btn" :aria-label="t('transport.next')" :title="t('transport.next')" @click="step(1)">
        <Icon name="chevron-right" />
      </button>
    </div>

    <p class="transport-time" aria-live="off">
      <span class="tc-now">{{ timecode(time) }}</span>
      <span class="tc-sep">/</span>
      <span class="tc-total">{{ timecode(duration) }}</span>
    </p>

    <p class="transport-meta">
      <span>{{ t('transport.frame', { n: frameOf(time) }) }}</span>
      <span v-if="size">{{ size }}</span>
      <span>{{ t('transport.fps', { fps: PREVIEW_FPS }) }}</span>
    </p>

    <div class="transport-tools">
      <div v-if="hasAudio" class="volume">
        <button
          type="button"
          class="icon-btn"
          :aria-label="muted ? t('transport.unmute') : t('transport.mute')"
          :aria-pressed="muted"
          :title="muted ? t('transport.unmute') : t('transport.mute')"
          @click="emit('mute')"
        >
          <Icon :name="level() === 0 ? 'volume-x' : 'volume'" />
        </button>
        <input
          type="range"
          class="volume-range"
          min="0"
          max="1"
          step="0.05"
          :value="level()"
          :aria-label="t('transport.volume')"
          :aria-valuetext="`${Math.round(level() * 100)}%`"
          :title="t('transport.volumeTitle', { p: Math.round(level() * 100) })"
          :style="{ '--fill': `${level() * 100}%` }"
          @input="emit('volume', parseFloat($event.target.value))"
        />
      </div>
      <button
        type="button"
        class="icon-btn"
        :aria-label="t('transport.timeline')"
        :aria-pressed="timeline"
        :title="t('transport.timeline')"
        @click="emit('timeline')"
      >
        <Icon name="timeline" />
      </button>
      <button
        type="button"
        class="icon-btn"
        :aria-label="fullscreen ? t('transport.exitFullscreen') : t('transport.fullscreen')"
        :title="fullscreen ? t('transport.exitFullscreen') : t('transport.fullscreen')"
        @click="emit('fullscreen')"
      >
        <Icon :name="fullscreen ? 'minimize' : 'maximize'" />
      </button>
    </div>
  </div>
</template>
