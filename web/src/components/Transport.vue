<script setup>
import Icon from './Icon.vue';
import { timecode, frameOf, PREVIEW_FPS } from '../lib/timecode.js';

const props = defineProps({
  time: { type: Number, default: 0 },
  duration: { type: Number, default: 1 },
  playing: { type: Boolean, default: false },
  size: { type: String, default: '' },
  hasAudio: { type: Boolean, default: false },
  muted: { type: Boolean, default: false },
});
const emit = defineEmits(['toggle', 'seek', 'mute']);
const step = (dir) => emit('seek', Math.min(props.duration, Math.max(0, props.time + dir / PREVIEW_FPS)));
</script>

<template>
  <div class="transport">
    <div class="transport-buttons">
      <button type="button" class="icon-btn" aria-label="Go to start" @click="emit('seek', 0)">
        <Icon name="skip-back" />
      </button>
      <button type="button" class="icon-btn" aria-label="Previous frame" @click="step(-1)">
        <Icon name="chevron-left" />
      </button>
      <button
        type="button"
        class="icon-btn icon-btn--play"
        :aria-label="playing ? 'Pause' : 'Play'"
        :aria-pressed="playing"
        @click="emit('toggle')"
      >
        <Icon :name="playing ? 'pause' : 'play'" :size="20" />
      </button>
      <button type="button" class="icon-btn" aria-label="Next frame" @click="step(1)">
        <Icon name="chevron-right" />
      </button>
      <button
        v-if="hasAudio"
        type="button"
        class="icon-btn"
        :aria-label="muted ? 'Unmute preview' : 'Mute preview'"
        :aria-pressed="muted"
        :title="muted ? 'Unmute preview' : 'Mute preview'"
        @click="emit('mute')"
      >
        <Icon :name="muted ? 'volume-x' : 'volume'" />
      </button>
    </div>
    <p class="transport-time" aria-live="off">
      <span class="tc-now">{{ timecode(time) }}</span>
      <span class="tc-sep">/</span>
      <span class="tc-total">{{ timecode(duration) }}</span>
    </p>
    <p class="transport-meta">
      <span>Frame {{ frameOf(time) }}</span>
      <span v-if="size">{{ size }}</span>
      <span>{{ PREVIEW_FPS }} fps preview</span>
    </p>
  </div>
</template>
