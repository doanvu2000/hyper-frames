<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { api } from './lib/api.js';
import Icon from './components/Icon.vue';
import TemplateRail from './components/TemplateRail.vue';
import PreviewStage from './components/PreviewStage.vue';
import Transport from './components/Transport.vue';
import DopeSheet from './components/DopeSheet.vue';
import Inspector from './components/Inspector.vue';
import RenderPanel from './components/RenderPanel.vue';
import RenderList from './components/RenderList.vue';

const DRAFT_KEY = 'hfs-draft';
const POSTER_TIME = 2;

const catalog = reactive({ templates: [], aspects: [] });
const health = ref(null);
const loadError = ref('');

const mode = ref('template');
const templateId = ref('title-card');
const aspect = ref('16:9');
const valuesByTemplate = reactive({});
const customHtml = ref('');

const html = ref('');
const composing = ref(false);
const composeError = ref('');
const info = reactive({ duration: 1, width: 1920, height: 1080, tracks: [] });

const time = ref(POSTER_TIME);
const playing = ref(false);

const renders = ref([]);
const submitting = ref(false);
const renderError = ref('');

const theme = ref(document.documentElement.dataset.theme ?? 'system');

const template = computed(() => catalog.templates.find((t) => t.id === templateId.value) ?? null);
const values = computed(() => valuesByTemplate[templateId.value] ?? {});
const queuedCount = computed(() => renders.value.filter((r) => r.status === 'queued').length);
const sizeLabel = computed(() => `${info.width}×${info.height}`);

function defaultsFor(t) {
  return Object.fromEntries(t.fields.map((f) => [f.id, f.default]));
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    if (!draft) return;
    if (catalog.templates.some((t) => t.id === draft.templateId)) templateId.value = draft.templateId;
    if (catalog.aspects.some((a) => a.id === draft.aspect)) aspect.value = draft.aspect;
    if (draft.mode === 'html' || draft.mode === 'template') mode.value = draft.mode;
    if (typeof draft.customHtml === 'string') customHtml.value = draft.customHtml;
    for (const t of catalog.templates) {
      if (draft.values?.[t.id]) Object.assign(valuesByTemplate[t.id], draft.values[t.id]);
    }
  } catch {
    // A broken or blocked draft just means starting from defaults.
  }
}

let saveTimer;
watch(
  [mode, templateId, aspect, customHtml, () => JSON.stringify(valuesByTemplate)],
  () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ mode: mode.value, templateId: templateId.value, aspect: aspect.value, customHtml: customHtml.value, values: valuesByTemplate }),
        );
      } catch {
        // Storage can be unavailable (private window); the draft is a convenience only.
      }
    }, 400);
  },
);

let composeSeq = 0;
let composeTimer;
function scheduleCompose(delay = 160) {
  clearTimeout(composeTimer);
  if (mode.value === 'html') {
    composeTimer = setTimeout(() => {
      composeError.value = '';
      html.value = customHtml.value;
    }, 450);
    return;
  }
  composeTimer = setTimeout(async () => {
    const seq = ++composeSeq;
    composing.value = true;
    try {
      const res = await api('/compose', { method: 'POST', body: { templateId: templateId.value, values: values.value, aspect: aspect.value } });
      if (seq !== composeSeq) return;
      composeError.value = '';
      html.value = res.html;
    } catch (err) {
      if (seq === composeSeq) composeError.value = err.message;
    } finally {
      if (seq === composeSeq) composing.value = false;
    }
  }, delay);
}

watch([mode, templateId, aspect, () => JSON.stringify(values.value)], () => scheduleCompose());
watch(customHtml, () => mode.value === 'html' && scheduleCompose());

function selectTemplate(id) {
  const changed = id !== templateId.value || mode.value !== 'template';
  templateId.value = id;
  mode.value = 'template';
  if (changed) seek(POSTER_TIME);
}

function openCustom() {
  if (!customHtml.value.trim() && html.value) customHtml.value = html.value;
  mode.value = 'html';
}

async function loadTemplateIntoEditor() {
  if (customHtml.value.trim() && !window.confirm('Replace the HTML in the editor with the current template?')) return;
  try {
    const res = await api('/compose', { method: 'POST', body: { templateId: templateId.value, values: values.value, aspect: aspect.value } });
    customHtml.value = res.html;
  } catch (err) {
    composeError.value = err.message;
  }
}

function setField(id, value) {
  valuesByTemplate[templateId.value][id] = value;
}

function resetFields() {
  if (template.value) Object.assign(valuesByTemplate[templateId.value], defaultsFor(template.value));
}

function onReady(next) {
  Object.assign(info, next);
  if (time.value > info.duration) time.value = Math.min(POSTER_TIME, info.duration);
}

let raf = 0;
let last = 0;
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  let t = time.value + dt;
  if (t >= info.duration) t = 0;
  time.value = t;
  raf = requestAnimationFrame(frame);
}
function play() {
  if (playing.value) return;
  if (time.value >= info.duration - 1 / 30) time.value = 0;
  playing.value = true;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}
function pause() {
  playing.value = false;
  cancelAnimationFrame(raf);
}
const toggle = () => (playing.value ? pause() : play());
function seek(t) {
  pause();
  time.value = Math.min(info.duration, Math.max(0, t));
}

function onKeydown(e) {
  if (e.code !== 'Space' || e.repeat) return;
  const tag = e.target.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(tag) || e.target.isContentEditable) return;
  e.preventDefault();
  toggle();
}

async function submitRender(settings) {
  renderError.value = '';
  submitting.value = true;
  try {
    const body =
      mode.value === 'html'
        ? { html: customHtml.value, ...settings }
        : { templateId: templateId.value, values: values.value, aspect: aspect.value, ...settings };
    const job = await api('/renders', { method: 'POST', body });
    upsert(job);
  } catch (err) {
    renderError.value = err.message;
  } finally {
    submitting.value = false;
  }
}

function upsert(job) {
  const i = renders.value.findIndex((r) => r.id === job.id);
  if (i === -1) renders.value = [job, ...renders.value];
  else renders.value.splice(i, 1, job);
}

async function cancelRender(id) {
  try {
    await api(`/renders/${id}/cancel`, { method: 'POST' });
  } catch (err) {
    renderError.value = err.message;
  }
}

async function removeRender(id) {
  try {
    await api(`/renders/${id}`, { method: 'DELETE' });
    renders.value = renders.value.filter((r) => r.id !== id);
  } catch (err) {
    renderError.value = err.message;
  }
}

let stream;
function connectStream() {
  stream = new EventSource('/api/renders/stream');
  stream.addEventListener('snapshot', (e) => (renders.value = JSON.parse(e.data)));
  stream.addEventListener('job', (e) => upsert(JSON.parse(e.data)));
  stream.addEventListener('removed', (e) => {
    const { id } = JSON.parse(e.data);
    renders.value = renders.value.filter((r) => r.id !== id);
  });
}

const THEMES = ['system', 'light', 'dark'];
const themeIcon = { system: 'monitor', light: 'sun', dark: 'moon' };
function cycleTheme() {
  theme.value = THEMES[(THEMES.indexOf(theme.value) + 1) % THEMES.length];
  if (theme.value === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme.value;
  try {
    if (theme.value === 'system') localStorage.removeItem('hfs-theme');
    else localStorage.setItem('hfs-theme', theme.value);
  } catch {
    // Theme still applies for this visit.
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
  try {
    const data = await api('/templates');
    catalog.templates = data.templates;
    catalog.aspects = data.aspects;
    for (const t of data.templates) valuesByTemplate[t.id] = defaultsFor(t);
    restoreDraft();
    scheduleCompose(0);
  } catch (err) {
    loadError.value = err.message;
  }
  api('/health').then((h) => (health.value = h)).catch(() => {});
  connectStream();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  cancelAnimationFrame(raf);
  stream?.close();
});
</script>

<template>
  <a class="skip-link" href="#stage">Skip to preview</a>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">HF</span>
        <span class="brand-word">HyperFrames <span class="brand-studio">Studio</span></span>
      </div>
      <p v-if="health" class="health" :data-ok="Boolean(health.ffmpeg)">
        <span class="health-dot" aria-hidden="true" />
        <span v-if="health.ffmpeg">Render engine ready · hyperframes {{ health.hyperframes }}</span>
        <span v-else>FFmpeg not found. Install it and restart the server to render.</span>
      </p>
      <button type="button" class="icon-btn" :aria-label="`Theme: ${theme}. Change theme`" :title="`Theme: ${theme}`" @click="cycleTheme">
        <Icon :name="themeIcon[theme]" />
      </button>
    </header>

    <p v-if="loadError" class="banner" role="alert"><Icon name="alert" :size="16" /> {{ loadError }}</p>

    <div class="workspace">
      <TemplateRail
        class="ws-rail"
        :templates="catalog.templates"
        :active-id="templateId"
        :mode="mode"
        @select="selectTemplate"
        @custom="openCustom"
      />

      <main id="stage" class="ws-stage" tabindex="-1">
        <h1 class="visually-hidden">Preview</h1>
        <PreviewStage :html="html" :time="time" :busy="composing" :error="composeError" @ready="onReady" />
        <Transport :time="time" :duration="info.duration" :playing="playing" :size="sizeLabel" @toggle="toggle" @seek="seek" />
        <DopeSheet :duration="info.duration" :time="time" :tracks="info.tracks" @seek="seek" @scrub-start="pause" />
      </main>

      <aside class="ws-side">
        <Inspector
          :mode="mode"
          :template="template"
          :values="values"
          :aspects="catalog.aspects"
          :aspect="aspect"
          :html="customHtml"
          :html-size="mode === 'html' ? `${sizeLabel}, ${info.duration}s` : ''"
          @field="setField"
          @reset="resetFields"
          @aspect="(a) => (aspect = a)"
          @html="(v) => (customHtml = v)"
          @from-template="loadTemplateIntoEditor"
        />
        <RenderPanel
          :disabled="!html || Boolean(loadError)"
          :submitting="submitting"
          :error="renderError"
          :queued="queuedCount"
          @submit="submitRender"
        />
        <RenderList :renders="renders" @cancel="cancelRender" @remove="removeRender" />
      </aside>
    </div>
  </div>
</template>
