<script setup>
import { reactive, computed, watch, ref, nextTick, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
import { timecode } from '../lib/timecode.js';
import { t, locale } from '../lib/i18n.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  mode: { type: String, default: 'html' },
  aspects: { type: Array, default: () => [] },
  aspect: { type: String, default: '16:9' },
  width: { type: Number, default: 1920 },
  height: { type: Number, default: 1080 },
  duration: { type: Number, default: 0 },
  inPoint: { type: Number, default: null },
  outPoint: { type: Number, default: null },
  submitting: { type: Boolean, default: false },
  error: { type: String, default: '' },
});
const emit = defineEmits(['close', 'submit']);

const FORMATS = ['mp4', 'webm', 'mov', 'gif'];
const FPS = [24, 30, 60];
const QUALITY = ['draft', 'looks', 'delivery'];
const KEY = 'hfs-export-v2';
const panel = ref(null);

const settings = reactive(read());
watch(settings, () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {}
});

function read() {
  const base = { formats: ['mp4'], aspects: [], fps: 30, quality: 'looks', range: 'all', notify: true };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      formats: Array.isArray(saved.formats) && saved.formats.some((f) => FORMATS.includes(f)) ? saved.formats.filter((f) => FORMATS.includes(f)) : base.formats,
      aspects: Array.isArray(saved.aspects) ? saved.aspects : base.aspects,
      fps: FPS.includes(saved.fps) ? saved.fps : base.fps,
      quality: QUALITY.includes(saved.quality) ? saved.quality : base.quality,
      range: saved.range === 'inout' ? 'inout' : 'all',
      notify: saved.notify !== false,
    };
  } catch {
    return base;
  }
}

const hasRange = computed(() => props.inPoint !== null || props.outPoint !== null);
const rangeStart = computed(() => props.inPoint ?? 0);
const rangeEnd = computed(() => props.outPoint ?? props.duration);
const useRange = computed(() => settings.range === 'inout' && hasRange.value && rangeEnd.value > rangeStart.value);
const pickedAspects = computed(() => {
  if (props.mode !== 'template') return [null];
  const valid = settings.aspects.filter((a) => props.aspects.some((x) => x.id === a));
  return valid.length ? valid : [props.aspect];
});
const count = computed(() => pickedAspects.value.length * settings.formats.length);
const length = computed(() => (useRange.value ? rangeEnd.value - rangeStart.value : props.duration));
const num = (n) => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(n);

function toggleIn(list, value) {
  const i = list.indexOf(value);
  if (i === -1) list.push(value);
  else if (list.length > 1) list.splice(i, 1);
}
function toggleAspect(id) {
  if (!settings.aspects.length) settings.aspects = [props.aspect];
  toggleIn(settings.aspects, id);
}
const aspectOn = (id) => (settings.aspects.length ? settings.aspects.includes(id) : id === props.aspect);

function submit() {
  emit('submit', {
    aspects: pickedAspects.value,
    formats: [...settings.formats],
    fps: settings.fps,
    quality: settings.quality,
    range: useRange.value ? { start: rangeStart.value, end: rangeEnd.value } : null,
    notify: settings.notify,
  });
}

let returnFocus = null;
watch(
  () => props.open,
  async (open) => {
    if (!open) {
      window.removeEventListener('keydown', onKey);
      returnFocus?.focus?.();
      returnFocus = null;
      return;
    }
    returnFocus = document.activeElement;
    window.addEventListener('keydown', onKey);
    await nextTick();
    panel.value?.querySelector('button')?.focus();
  },
);
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

function onKey(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    emit('close');
  }
}
</script>

<template>
  <div v-if="open" class="scrim" @pointerdown.self="emit('close')" />
  <section
    v-if="open"
    ref="panel"
    class="sheet"
    role="dialog"
    aria-modal="true"
    aria-labelledby="export-title"
    @keydown="onKey"
  >
    <header class="sheet-head">
      <h2 id="export-title">{{ t('export.title') }}</h2>
      <button type="button" class="icon-btn" :aria-label="t('app.dismiss')" @click="emit('close')"><Icon name="x" :size="16" /></button>
    </header>

    <div class="sheet-body">
      <div class="field">
        <span class="field-label">{{ t('export.frames') }}</span>
        <div v-if="mode === 'template'" class="pills">
          <button
            v-for="a in aspects"
            :key="a.id"
            type="button"
            class="pill"
            :aria-pressed="aspectOn(a.id)"
            @click="toggleAspect(a.id)"
          >
            {{ a.id }} · {{ a.width }}×{{ a.height }}
          </button>
        </div>
        <p v-else class="sheet-fixed">{{ width }}×{{ height }}</p>
        <p class="field-hint">{{ mode === 'template' ? t('export.framesTemplate') : t('export.framesHtml') }}</p>
      </div>

      <div class="field">
        <span class="field-label">{{ t('export.formats') }}</span>
        <div class="pills">
          <button v-for="f in FORMATS" :key="f" type="button" class="pill" :aria-pressed="settings.formats.includes(f)" @click="toggleIn(settings.formats, f)">
            {{ f.toUpperCase() }}
          </button>
        </div>
        <p class="field-hint">{{ settings.formats.map((f) => t(`render.${f}`)).join(' ') }}</p>
      </div>

      <div class="field">
        <span id="export-range" class="field-label">{{ t('export.range') }}</span>
        <div class="segmented" role="radiogroup" aria-labelledby="export-range">
          <button type="button" role="radio" class="segmented-item" :aria-checked="!useRange" @click="settings.range = 'all'">
            {{ t('export.all', { s: num(duration) }) }}
          </button>
          <button
            type="button"
            role="radio"
            class="segmented-item"
            :aria-checked="useRange"
            :disabled="!hasRange"
            :title="hasRange ? '' : t('export.noRange')"
            @click="settings.range = 'inout'"
          >
            {{ hasRange ? t('export.inout', { a: timecode(rangeStart), b: timecode(rangeEnd) }) : t('export.inoutEmpty') }}
          </button>
        </div>
      </div>

      <div class="sheet-row">
        <div class="field">
          <span id="export-fps" class="field-label">{{ t('render.fps') }}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="export-fps">
            <button v-for="f in FPS" :key="f" type="button" role="radio" class="segmented-item" :aria-checked="settings.fps === f" @click="settings.fps = f">{{ f }}</button>
          </div>
        </div>
        <div class="field">
          <span id="export-q" class="field-label">{{ t('render.quality') }}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="export-q">
            <button v-for="q in QUALITY" :key="q" type="button" role="radio" class="segmented-item" :aria-checked="settings.quality === q" @click="settings.quality = q">
              {{ t(`render.${q}`) }}
            </button>
          </div>
        </div>
      </div>

      <label class="check">
        <input v-model="settings.notify" type="checkbox" />
        <span>{{ t('export.notify') }}</span>
      </label>

      <p class="sheet-sum">
        <span>{{ t('export.summary', { n: count, s: num(length) }) }}</span>
        <b>{{ t('export.frameCount', { n: Math.round(length * settings.fps * count) }) }}</b>
      </p>
      <p v-if="error" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ error }}</p>
      <button type="button" class="btn btn--go btn--block" :disabled="submitting || !count" :aria-busy="submitting" @click="submit">
        <Icon :name="submitting ? 'loader' : 'export'" :size="16" :class="{ spin: submitting }" />
        {{ count === 1 ? t('export.goOne', { format: settings.formats[0].toUpperCase() }) : t('export.goMany', { n: count }) }}
      </button>
    </div>
  </section>
</template>
