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
  job.startedAt && job.finishedAt
    ? `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format((new Date(job.finishedAt) - new Date(job.startedAt)) / 1000)}s`
    : '';
const active = (job) => job.status === 'running' || job.status === 'queued';
// The tile draws the video's own shape, so a portrait reel and a landscape intro read apart at a glance.
const tileStyle = (job) => {
  const w = job.width || 16;
  const h = job.height || 9;
  const k = 26 / Math.max(w, h);
  return { width: `${Math.round(w * k)}px`, height: `${Math.round(h * k)}px` };
};

function confirmRemove(job) {
  const running = job.status === 'running' || job.status === 'queued';
  const msg = running ? t('renders.confirmStop', { name: job.name }) : t('renders.confirmDelete', { name: job.name });
  if (window.confirm(msg)) emit('remove', job.id);
}
</script>

<template>
  <section class="renders" :aria-label="t('renders.aria')">
    <div v-if="!renders.length" class="renders-empty">
      <span class="renders-empty-icon"><Icon name="film" :size="22" /></span>
      <p>{{ t('renders.empty') }}</p>
      <p class="field-hint" v-html="tr('renders.emptyHint')" />
    </div>
    <ul v-else class="renders-list">
      <li v-for="job in renders" :key="job.id" class="job" :data-status="job.status">
        <div class="job-tile" aria-hidden="true">
          <span v-if="active(job)" class="job-tile-pct">{{ Math.round(job.progress) }}%</span>
          <template v-else>
            <span class="job-tile-frame" :style="tileStyle(job)" />
            <span class="job-tile-fmt">{{ job.format.toUpperCase() }}</span>
          </template>
        </div>

        <div class="job-body">
          <div class="job-top">
            <p class="job-name" :title="job.name">{{ job.name }}</p>
            <button type="button" class="job-delete" :aria-label="t('renders.deleteName', { name: job.name })" :title="t('renders.delete')" @click="confirmRemove(job)">
              <Icon name="trash" :size="15" />
            </button>
          </div>
          <p class="job-meta">
            <span v-if="job.width">{{ job.width }}×{{ job.height }}</span>
            <span v-if="job.duration">{{ job.duration }}s</span>
            <span>{{ job.fps }} fps</span>
            <span>{{ when(job.createdAt) }}</span>
            <span v-if="originLabel(job)" class="job-origin">{{ t('renders.via', { label: originLabel(job) }) }}</span>
          </p>

          <div v-if="active(job)" class="job-progress">
            <div
              class="job-track"
              role="progressbar"
              :aria-valuenow="Math.round(job.progress)"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="t('renders.progress', { name: job.name })"
            >
              <span class="job-track-fill" :style="{ transform: `scaleX(${job.progress / 100})` }" />
              <span class="job-track-head" :style="{ left: `${job.progress}%` }" />
            </div>
            <div class="job-progress-row">
              <span class="job-status" :data-status="job.status">
                <Icon name="loader" :size="13" class="spin" /> {{ job.status === 'queued' ? statusLabel(job) : stageLabel(job.stage) }}
              </span>
              <button type="button" class="ghost-btn job-stop" @click="emit('cancel', job.id)"><Icon name="stop" :size="12" /> {{ t('renders.stop') }}</button>
            </div>
          </div>

          <p v-else class="job-status" :data-status="job.status">
            <Icon :name="STATUS_ICON[job.status]" :size="14" />
            {{ statusLabel(job) }}
            <span v-if="job.status === 'done'" class="job-detail">{{ formatBytes(job.size) }} · {{ t('renders.took', { s: elapsed(job) }) }}</span>
          </p>

          <p v-if="job.status === 'failed'" class="job-error">{{ job.error }}</p>

          <div v-if="job.status === 'done'" class="job-actions">
            <a class="text-btn text-btn--strong" :href="fileUrl(job)" download><Icon name="download" :size="14" /> {{ t('renders.download') }}</a>
            <button
              v-if="job.format !== 'mov'"
              type="button"
              class="text-btn"
              :aria-expanded="watching === job.id"
              @click="watching = watching === job.id ? null : job.id"
            >
              <Icon :name="watching === job.id ? 'x' : 'play'" :size="14" /> {{ watching === job.id ? t('renders.hide') : t('renders.watch') }}
            </button>
          </div>
        </div>

        <div v-if="watching === job.id" class="job-player">
          <img v-if="job.format === 'gif'" :src="fileUrl(job, true)" :alt="t('renders.alt', { name: job.name })" />
          <video v-else :src="fileUrl(job, true)" controls playsinline loop />
        </div>
      </li>
    </ul>
  </section>
</template>
