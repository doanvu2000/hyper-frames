<script setup>
import Icon from './Icon.vue';
import { t } from '../lib/i18n.js';
import { timecode, frameOf, PREVIEW_FPS } from '../lib/timecode.js';

const props = defineProps({
  time: { type: Number, default: 0 },
  duration: { type: Number, default: 1 },
  playing: { type: Boolean, default: false },
  size: { type: String, default: '' },
  hasAudio: { type: Boolean, default: false },
  muted: { type: Boolean, default: false },
  volume: { type: Number, default: 1 },
});
const emit = defineEmits(['toggle', 'seek', 'mute', 'volume']);
const step = (dir) => emit('seek', Math.min(props.duration, Math.max(0, props.time + dir / PREVIEW_FPS)));
</script>

<template>
  <div class="transport">
    <div class="transport-buttons">
      <button type="button" class="icon-btn" :aria-label="t('transport.start')" @click="emit('seek', 0)">
        <Icon name="skip-back" />
      </button>
      <button type="button" class="icon-btn" :aria-label="t('transport.prev')" @click="step(-1)">
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
      <button type="button" class="icon-btn" :aria-label="t('transport.next')" @click="step(1)">
        <Icon name="chevron-right" />
      </button>
      <button
        v-if="hasAudio"
        type="button"
        class="icon-btn"
        :aria-label="muted ? t('transport.unmute') : t('transport.mute')"
        :aria-pressed="muted"
        :title="muted ? t('transport.unmute') : t('transport.mute')"
        @click="emit('mute')"
      >
        <Icon :name="muted || volume === 0 ? 'volume-x' : 'volume'" />
      </button>
      <input
        v-if="hasAudio"
        type="range"
        class="volume-range"
        min="0"
        max="1"
        step="0.05"
        :value="muted ? 0 : volume"
        :aria-label="t('transport.volume')"
        :aria-valuetext="`${Math.round((muted ? 0 : volume) * 100)}%`"
        :title="t('transport.volumeTitle', { p: Math.round((muted ? 0 : volume) * 100) })"
        :style="{ '--fill': `${(muted ? 0 : volume) * 100}%` }"
        @input="emit('volume', parseFloat($event.target.value))"
      />
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
  </div>
</template>
