<script setup>
import { reactive, computed, watch } from 'vue';
import Icon from './Icon.vue';
import { t, locale } from '../lib/i18n.js';

const props = defineProps({
  width: { type: Number, default: 1920 },
  height: { type: Number, default: 1080 },
  duration: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
  error: { type: String, default: '' },
});
const emit = defineEmits(['submit']);

const FORMATS = [
  { id: 'mp4', label: 'MP4' },
  { id: 'webm', label: 'WebM' },
  { id: 'mov', label: 'MOV' },
  { id: 'gif', label: 'GIF' },
];
const FPS = [24, 30, 60];
const QUALITY = ['draft', 'looks', 'delivery'];
const SETTINGS_KEY = 'hfs-output';

const settings = reactive(readSettings());
watch(settings, () => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
});

function readSettings() {
  const fallback = { format: 'mp4', fps: 30, quality: 'looks' };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return {
      format: FORMATS.some((f) => f.id === saved.format) ? saved.format : fallback.format,
      fps: FPS.includes(saved.fps) ? saved.fps : fallback.fps,
      quality: QUALITY.includes(saved.quality) ? saved.quality : fallback.quality,
    };
  } catch {
    return fallback;
  }
}

const formatLabel = computed(() => FORMATS.find((f) => f.id === settings.format).label);
const num = (n, digits = 0) => new Intl.NumberFormat(locale.value, { maximumFractionDigits: digits }).format(n);
const frames = computed(() => Math.round(props.duration * settings.fps));
const moreSummary = computed(() => `${settings.fps} fps · ${t(`render.${settings.quality}`)}`);
</script>

<template>
  <section class="render-bar" :aria-label="t('render.aria')">
    <div class="slate" :aria-label="t('render.slate')">
      <span class="slate-clap" aria-hidden="true" />
      <dl class="slate-specs">
        <div>
          <dt>{{ t('render.size') }}</dt>
          <dd>{{ width }}×{{ height }}</dd>
        </div>
        <div>
          <dt>{{ t('render.length') }}</dt>
          <dd>{{ num(duration, 1) }}s</dd>
        </div>
        <div>
          <dt>{{ t('render.frames') }}</dt>
          <dd>{{ num(frames) }}</dd>
        </div>
      </dl>
    </div>

    <div class="out-row">
      <span id="out-format" class="out-label">{{ t('render.format') }}</span>
      <div class="chips" role="radiogroup" aria-labelledby="out-format">
        <button
          v-for="f in FORMATS"
          :key="f.id"
          type="button"
          role="radio"
          class="chip"
          :aria-checked="settings.format === f.id"
          @click="settings.format = f.id"
        >
          {{ f.label }}
        </button>
      </div>
    </div>
    <p class="out-note">{{ t(`render.${settings.format}`) }}</p>

    <details class="out-more">
      <summary class="out-more-summary">
        <span>{{ t('render.more') }}</span>
        <span class="out-more-value">{{ moreSummary }}</span>
        <Icon name="chevron-down" :size="14" class="out-more-chevron" />
      </summary>
      <div class="out-row">
        <span id="out-fps" class="out-label">{{ t('render.fps') }}</span>
        <div class="chips" role="radiogroup" aria-labelledby="out-fps">
          <button
            v-for="f in FPS"
            :key="f"
            type="button"
            role="radio"
            class="chip chip--mono"
            :aria-checked="settings.fps === f"
            @click="settings.fps = f"
          >
            {{ f }}
          </button>
        </div>
      </div>
      <div class="out-row">
        <span id="out-quality" class="out-label">{{ t('render.quality') }}</span>
        <div class="chips" role="radiogroup" aria-labelledby="out-quality">
          <button
            v-for="q in QUALITY"
            :key="q"
            type="button"
            role="radio"
            class="chip"
            :aria-checked="settings.quality === q"
            @click="settings.quality = q"
          >
            {{ t(`render.${q}`) }}
          </button>
        </div>
      </div>
      <p class="out-note">{{ t(`render.${settings.quality}Note`) }}</p>
    </details>

    <p v-if="error" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ error }}</p>
    <button
      type="button"
      class="primary-btn render-go"
      :disabled="disabled || submitting"
      :aria-busy="submitting"
      @click="emit('submit', { ...settings })"
    >
      <Icon :name="submitting ? 'loader' : 'film'" :class="{ spin: submitting }" />
      {{ t('render.button', { format: formatLabel }) }}
    </button>
  </section>
</template>
