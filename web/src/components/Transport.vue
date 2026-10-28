<script setup>
import { ref, computed } from 'vue';
import Icon from './Icon.vue';
import Dropdown from './Dropdown.vue';
import Popover from './Popover.vue';
import { timecode, frameOf, PREVIEW_FPS } from '../lib/timecode.js';
import { SPEEDS } from '../composables/usePlayback.js';
import { t } from '../lib/i18n.js';

const props = defineProps({
  time: { type: Number, default: 0 },
  duration: { type: Number, default: 1 },
  playing: { type: Boolean, default: false },
  rate: { type: Number, default: 1 },
  speed: { type: Number, default: 1 },
  loop: { type: Boolean, default: false },
  inPoint: { type: Number, default: null },
  outPoint: { type: Number, default: null },
  size: { type: String, default: '' },
  hasAudio: { type: Boolean, default: false },
  muted: { type: Boolean, default: false },
  volume: { type: Number, default: 1 },
  timeline: { type: Boolean, default: true },
  fullscreen: { type: Boolean, default: false },
});
const emit = defineEmits(['toggle', 'seek', 'scrub-start', 'step', 'set-in', 'set-out', 'loop', 'speed', 'marker', 'mute', 'volume', 'timeline', 'fullscreen']);

const level = () => (props.muted ? 0 : props.volume);
const speedOptions = computed(() => [
  ...SPEEDS.map((s) => ({ value: s, label: `${s}×`, kbd: s === 1 ? 'K' : s === 2 ? 'L L' : '' })),
]);
const rateLabel = computed(() => (props.playing && props.rate < 0 ? `◂ ${Math.abs(props.rate)}×` : `${props.speed}×`));

const bar = ref(null);
const scrubbing = ref(false);
const pct = (v) => `${(Math.min(Math.max(v, 0), props.duration) / props.duration) * 100}%`;
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
  if (scrubbing.value) emit('seek', timeAt(e.clientX));
}
</script>

<template>
  <div class="transport">
    <div
      v-if="!timeline"
      ref="bar"
      class="seek"
      role="slider"
      tabindex="0"
      :aria-label="t('transport.seek')"
      :aria-valuemin="0"
      :aria-valuemax="duration"
      :aria-valuenow="Number(time.toFixed(2))"
      :aria-valuetext="timecode(time)"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="scrubbing = false"
      @pointercancel="scrubbing = false"
    >
      <span class="seek-track"><span class="seek-fill" :style="{ width: pct(time) }" /></span>
    </div>

    <div class="tp-row">
      <button type="button" class="tb" :aria-label="t('transport.start')" :title="`${t('transport.start')} (Home)`" @click="emit('seek', inPoint ?? 0)">
        <Icon name="skip-back" :size="16" />
      </button>
      <button type="button" class="tb" :aria-label="t('transport.prev')" :title="`${t('transport.prev')} (←)`" @click="emit('step', -1)">
        <Icon name="chevron-left" :size="18" />
      </button>
      <button
        type="button"
        class="tb tb--play"
        :aria-label="playing ? t('transport.pause') : t('transport.play')"
        :aria-pressed="playing"
        :title="`${playing ? t('transport.pause') : t('transport.play')} (Space)`"
        @click="emit('toggle')"
      >
        <Icon :name="playing ? 'pause' : 'play'" :size="18" />
      </button>
      <button type="button" class="tb" :aria-label="t('transport.next')" :title="`${t('transport.next')} (→)`" @click="emit('step', 1)">
        <Icon name="chevron-right" :size="18" />
      </button>

      <p class="tc" aria-live="off">
        <span class="tc-now">{{ timecode(time) }}</span>
        <span class="tc-of">/ {{ timecode(duration) }}</span>
      </p>
      <p class="tp-meta">
        {{ t('transport.frame', { n: frameOf(time) }) }}<template v-if="size"> · {{ size }}</template> · {{ PREVIEW_FPS }} fps
      </p>

      <span class="tp-grow" />

      <span class="tp-inout">
        <button type="button" class="tb tb--tc" :aria-pressed="inPoint !== null" :title="t('transport.setIn')" @click="emit('set-in')">
          I <span>{{ inPoint !== null ? timecode(inPoint) : '--:--:--' }}</span>
        </button>
        <button type="button" class="tb tb--tc" :aria-pressed="outPoint !== null" :title="t('transport.setOut')" @click="emit('set-out')">
          O <span>{{ outPoint !== null ? timecode(outPoint) : '--:--:--' }}</span>
        </button>
      </span>
      <button
        type="button"
        class="tb"
        :aria-pressed="loop"
        :aria-label="t('transport.loop')"
        :title="`${t('transport.loop')} (Shift+L)`"
        @click="emit('loop')"
      >
        <Icon name="repeat" :size="16" />
      </button>
      <Dropdown
        :model-value="speed"
        :options="speedOptions"
        :label="t('transport.speed')"
        :display="rateLabel"
        :footer="t('transport.speedNote')"
        trigger-class="tsel"
        placement="up"
        align="end"
        @update:model-value="(v) => emit('speed', v)"
      />
      <button type="button" class="tb tp-opt" :aria-label="t('transport.marker')" :title="`${t('transport.marker')} (M)`" @click="emit('marker')">
        <Icon name="flag" :size="16" />
      </button>

      <Popover
        v-if="hasAudio"
        :label="t('transport.volume')"
        :title="t('transport.volumeTitle', { p: Math.round(level() * 100) })"
        role="dialog"
        trigger-class="tb"
        placement="up"
        align="end"
        :chevron="false"
        panel-class="pop--volume"
      >
        <template #trigger><Icon :name="level() === 0 ? 'volume-x' : 'volume'" :size="16" /></template>
        <div class="vol-row">
          <button type="button" class="icon-btn" :aria-pressed="muted" :aria-label="muted ? t('transport.unmute') : t('transport.mute')" @click="emit('mute')">
            <Icon :name="level() === 0 ? 'volume-x' : 'volume'" :size="16" />
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
            :style="{ '--fill': `${level() * 100}%` }"
            @input="emit('volume', parseFloat($event.target.value))"
          />
          <span class="vol-num">{{ Math.round(level() * 100) }}%</span>
        </div>
      </Popover>

      <button
        type="button"
        class="tb tp-opt"
        :aria-pressed="timeline"
        :aria-label="t('transport.timeline')"
        :title="t('transport.timeline')"
        @click="emit('timeline')"
      >
        <Icon name="timeline" :size="16" />
      </button>
      <button
        type="button"
        class="tb"
        :aria-label="fullscreen ? t('transport.exitFullscreen') : t('transport.fullscreen')"
        :title="`${fullscreen ? t('transport.exitFullscreen') : t('transport.fullscreen')} (F)`"
        @click="emit('fullscreen')"
      >
        <Icon :name="fullscreen ? 'minimize' : 'maximize'" :size="16" />
      </button>
    </div>
  </div>
</template>
