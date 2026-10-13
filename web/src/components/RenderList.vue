<script setup>
import { ref } from 'vue';
import Icon from './Icon.vue';
import { fileUrl } from '../lib/api.js';
import { formatBytes } from '../lib/timecode.js';

const props = defineProps({
  renders: { type: Array, default: () => [] },
  sources: { type: Array, default: () => [] },
});
const emit = defineEmits(['cancel', 'remove']);

const watching = ref(null);
const STAGES = {
  queued: 'Waiting in queue',
  starting: 'Starting Chrome',
  capture: 'Capturing frames',
  encode: 'Encoding',
  assemble: 'Assembling file',
};
const STATUS = {
  queued: { label: 'Queued', icon: 'loader' },
  running: { label: 'Rendering', icon: 'loader' },
  done: { label: 'Ready', icon: 'check' },
  failed: { label: 'Failed', icon: 'alert' },
  cancelled: { label: 'Cancelled', icon: 'x' },
};

const originLabel = (job) => props.sources.find((s) => s.id === job.origin)?.label ?? null;
const statusLabel = (job) => (job.status === 'running' && originLabel(job) ? `Rendering with ${originLabel(job)}` : STATUS[job.status].label);

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
const when = (iso) => timeFmt.format(new Date(iso));
const elapsed = (job) =>
  job.startedAt && job.finishedAt ? `${((new Date(job.finishedAt) - new Date(job.startedAt)) / 1000).toFixed(1)}s` : '';

function confirmRemove(job) {
  const running = job.status === 'running' || job.status === 'queued';
  const msg = running ? `Stop and delete "${job.name}"?` : `Delete "${job.name}" and its file?`;
  if (window.confirm(msg)) emit('remove', job.id);
}
</script>

<template>
  <section class="renders" aria-label="Renders">
    <div v-if="!renders.length" class="renders-empty">
      <Icon name="film" :size="28" />
      <p>No renders yet.</p>
      <p class="field-hint">Press Render below. Finished files are kept in <code>server/data/renders</code>.</p>
    </div>
    <ul v-else class="renders-list">
      <li v-for="job in renders" :key="job.id" class="job" :data-status="job.status">
        <div class="job-main">
          <p class="job-name">{{ job.name }}</p>
          <p class="job-meta">
            <span>{{ job.format.toUpperCase() }}</span>
            <span v-if="job.width">{{ job.width }}×{{ job.height }}</span>
            <span>{{ job.fps }} fps</span>
            <span v-if="job.duration">{{ job.duration }}s</span>
            <span>{{ when(job.createdAt) }}</span>
            <span v-if="originLabel(job)" class="job-origin">via {{ originLabel(job) }}</span>
          </p>
        </div>

        <p class="job-status" :data-status="job.status">
          <Icon
            :name="STATUS[job.status].icon"
            :size="14"
            :class="{ spin: job.status === 'running' || job.status === 'queued' }"
          />
          {{ statusLabel(job) }}
          <span v-if="job.status === 'done'" class="job-detail">{{ formatBytes(job.size) }} · {{ elapsed(job) }}</span>
        </p>

        <div v-if="job.status === 'running' || job.status === 'queued'" class="job-progress">
          <div
            class="progress"
            role="progressbar"
            :aria-valuenow="job.progress"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="`${job.name} progress`"
          >
            <span class="progress-fill" :style="{ transform: `scaleX(${job.progress / 100})` }" />
          </div>
          <span class="job-detail">{{ STAGES[job.stage] ?? 'Working' }} · {{ Math.round(job.progress) }}%</span>
        </div>

        <p v-if="job.status === 'failed'" class="job-error">{{ job.error }}</p>

        <div class="job-actions">
          <button
            v-if="job.status === 'done' && job.format !== 'mov'"
            type="button"
            class="text-btn"
            :aria-expanded="watching === job.id"
            @click="watching = watching === job.id ? null : job.id"
          >
            <Icon name="eye" :size="14" /> {{ watching === job.id ? 'Hide' : 'Watch' }}
          </button>
          <a v-if="job.status === 'done'" class="text-btn" :href="fileUrl(job)" download>
            <Icon name="download" :size="14" /> Download
          </a>
          <button
            v-if="job.status === 'running' || job.status === 'queued'"
            type="button"
            class="text-btn"
            @click="emit('cancel', job.id)"
          >
            <Icon name="x" :size="14" /> Stop
          </button>
          <button type="button" class="text-btn text-btn--danger" :aria-label="`Delete ${job.name}`" @click="confirmRemove(job)">
            <Icon name="trash" :size="14" /> Delete
          </button>
        </div>

        <div v-if="watching === job.id" class="job-player">
          <img v-if="job.format === 'gif'" :src="fileUrl(job, true)" :alt="`${job.name} render`" />
          <video v-else :src="fileUrl(job, true)" controls playsinline loop />
        </div>
      </li>
    </ul>
  </section>
</template>
