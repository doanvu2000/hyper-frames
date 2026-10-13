<script setup>
import { ref } from 'vue';
import Icon from './Icon.vue';
import { fileUrl } from '../lib/api.js';
import { formatBytes } from '../lib/timecode.js';
import { t, tr, locale } from '../lib/i18n.js';

const props = defineProps({
  renders: { type: Array, default: () => [] },
  sources: { type: Array, default: () => [] },
});
const emit = defineEmits(['cancel', 'remove']);

const watching = ref(null);
const STAGES = new Set(['queued', 'starting', 'capture', 'encode', 'assemble']);
const stageLabel = (stage) => t(`renders.stage.${STAGES.has(stage) ? stage : 'working'}`);
const STATUS_ICON = { queued: 'loader', running: 'loader', done: 'check', failed: 'alert', cancelled: 'x' };

const originLabel = (job) => props.sources.find((s) => s.id === job.origin)?.label ?? null;
const statusLabel = (job) =>
  job.status === 'running' && originLabel(job) ? t('renders.renderingWith', { label: originLabel(job) }) : t(`renders.status.${job.status}`);

const when = (iso) =>
  new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(new Date(iso));
const elapsed = (job) =>
  job.startedAt && job.finishedAt ? `${((new Date(job.finishedAt) - new Date(job.startedAt)) / 1000).toFixed(1)}s` : '';

function confirmRemove(job) {
  const running = job.status === 'running' || job.status === 'queued';
  const msg = running ? t('renders.confirmStop', { name: job.name }) : t('renders.confirmDelete', { name: job.name });
  if (window.confirm(msg)) emit('remove', job.id);
}
</script>

<template>
  <section class="renders" :aria-label="t('renders.aria')">
    <div v-if="!renders.length" class="renders-empty">
      <Icon name="film" :size="28" />
      <p>{{ t('renders.empty') }}</p>
      <p class="field-hint" v-html="tr('renders.emptyHint')" />
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
            <span v-if="originLabel(job)" class="job-origin">{{ t('renders.via', { label: originLabel(job) }) }}</span>
          </p>
        </div>

        <p class="job-status" :data-status="job.status">
          <Icon
            :name="STATUS_ICON[job.status]"
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
            :aria-label="t('renders.progress', { name: job.name })"
          >
            <span class="progress-fill" :style="{ transform: `scaleX(${job.progress / 100})` }" />
          </div>
          <span class="job-detail">{{ stageLabel(job.stage) }} · {{ Math.round(job.progress) }}%</span>
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
            <Icon name="eye" :size="14" /> {{ watching === job.id ? t('renders.hide') : t('renders.watch') }}
          </button>
          <a v-if="job.status === 'done'" class="text-btn" :href="fileUrl(job)" download>
            <Icon name="download" :size="14" /> {{ t('renders.download') }}
          </a>
          <button
            v-if="job.status === 'running' || job.status === 'queued'"
            type="button"
            class="text-btn"
            @click="emit('cancel', job.id)"
          >
            <Icon name="x" :size="14" /> {{ t('renders.stop') }}
          </button>
          <button type="button" class="text-btn text-btn--danger" :aria-label="t('renders.deleteName', { name: job.name })" @click="confirmRemove(job)">
            <Icon name="trash" :size="14" /> {{ t('renders.delete') }}
          </button>
        </div>

        <div v-if="watching === job.id" class="job-player">
          <img v-if="job.format === 'gif'" :src="fileUrl(job, true)" :alt="t('renders.alt', { name: job.name })" />
          <video v-else :src="fileUrl(job, true)" controls playsinline loop />
        </div>
      </li>
    </ul>
  </section>
</template>
