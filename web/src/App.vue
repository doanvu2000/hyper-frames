<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { api, fileUrl } from './lib/api.js';
import Icon from './components/Icon.vue';
import StartSwitch from './components/StartSwitch.vue';
import PreviewStage from './components/PreviewStage.vue';
import Transport from './components/Transport.vue';
import DopeSheet from './components/DopeSheet.vue';
import Inspector from './components/Inspector.vue';
import RenderPanel from './components/RenderPanel.vue';
import RenderList from './components/RenderList.vue';
import ConnectionsMenu from './components/ConnectionsMenu.vue';
import PanelSplitter from './components/PanelSplitter.vue';
import FirstRunGuide from './components/FirstRunGuide.vue';
import { PreviewAudio } from './lib/previewAudio.js';
import { t, locale, setLocale } from './lib/i18n.js';

// v2: template defaults changed (Geist font); older drafts would pin the old typeface.
const DRAFT_KEY = 'hfs-draft-v2';
const POSTER_TIME = 2;
const year = new Date().getFullYear();

const catalog = reactive({ templates: [], aspects: [] });
const health = ref(null);
const status = ref(null);
const loadError = ref('');

const mode = ref('html');
const templateId = ref('title-card');
const aspect = ref('16:9');
const valuesByTemplate = reactive({});
const customHtml = ref('');
const projectId = ref('');
const assets = ref(null);

const html = ref('');
const composing = ref(false);
const composeError = ref('');
const info = reactive({ duration: 1, width: 1920, height: 1080, tracks: [], audio: [] });

const time = ref(POSTER_TIME);
const playing = ref(false);
const sound = new PreviewAudio();
const muted = ref(readMuted());
sound.setMuted(muted.value);
const volume = ref(readVolume());
sound.setVolume(volume.value);

const renders = ref([]);
const submitting = ref(false);
const renderError = ref('');

const theme = ref(document.documentElement.dataset.theme ?? 'system');
const thumbs = reactive({});
const sideTab = ref('edit');
const toasts = ref([]);

const LAYOUT_KEY = 'hfs-layout-v2';
const PANEL = { side: { min: 320, max: 640, initial: 400 } };
const layout = reactive(readLayout());
const GUIDE_KEY = 'hfs-guide-v1';
const guideOpen = ref(!readFlag(GUIDE_KEY));
let toastSeq = 0;

const template = computed(() => catalog.templates.find((t) => t.id === templateId.value) ?? null);
const values = computed(() => valuesByTemplate[templateId.value] ?? {});
const runningJob = computed(() => renders.value.find((r) => r.status === 'running'));
const sizeLabel = computed(() => `${info.width}×${info.height}`);
const previewBase = computed(() => (mode.value === 'html' && projectId.value ? `/api/projects/${projectId.value}/files/` : ''));

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
    if (draft.projectId) {
      projectId.value = draft.projectId;
      assets.value = draft.assets ?? null;
      // Imports can be deleted on disk between visits; drop the link instead of rendering with missing files.
      api(`/projects/${draft.projectId}`).catch(() => {
        projectId.value = '';
        assets.value = null;
      });
    }
    for (const t of catalog.templates) {
      if (draft.values?.[t.id]) Object.assign(valuesByTemplate[t.id], draft.values[t.id]);
    }
  } catch {
    // A broken or blocked draft just means starting from defaults.
  }
}

let saveTimer;
watch(
  [mode, templateId, aspect, customHtml, projectId, () => JSON.stringify(valuesByTemplate)],
  () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            mode: mode.value,
            templateId: templateId.value,
            aspect: aspect.value,
            customHtml: customHtml.value,
            projectId: projectId.value,
            assets: assets.value,
            values: valuesByTemplate,
          }),
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

// A first visit opens on AI & custom HTML; start the editor from a template so the preview is not empty.
async function seedCustomHtml() {
  try {
    const res = await api('/compose', { method: 'POST', body: { templateId: templateId.value, values: values.value, aspect: aspect.value } });
    customHtml.value = res.html;
  } catch {}
}

async function loadTemplateIntoEditor() {
  if (customHtml.value.trim() && !window.confirm(t('app.replaceWithTemplate'))) return;
  try {
    const res = await api('/compose', { method: 'POST', body: { templateId: templateId.value, values: values.value, aspect: aspect.value } });
    customHtml.value = res.html;
  } catch (err) {
    composeError.value = err.message;
  }
}

function dropProject(id) {
  if (id) api(`/projects/${id}`, { method: 'DELETE' }).catch(() => {});
}

function onImported(result) {
  if (customHtml.value.trim() && customHtml.value !== result.html && !window.confirm(t('app.replaceWithImport'))) {
    dropProject(result.projectId);
    return;
  }
  if (projectId.value !== result.projectId) dropProject(projectId.value);
  projectId.value = result.projectId ?? '';
  assets.value = result.projectId ? { label: result.label, count: result.count, size: result.size } : null;
  customHtml.value = result.html;
  seek(POSTER_TIME);
  toast(t('app.imported', { label: result.label }));
}

function clearAssets() {
  dropProject(projectId.value);
  projectId.value = '';
  assets.value = null;
}

function onGeneratedHtml(next) {
  customHtml.value = next;
  seek(POSTER_TIME);
}

const sourceLabel = (id) => status.value?.connections.find((c) => c.id === id)?.label ?? t('app.aiTool');

// Sent by a CLI through MCP. No confirm dialog: nobody may be at the screen, so offer Undo instead.
function onPushed(push) {
  const before = { html: customHtml.value, projectId: projectId.value, assets: assets.value, mode: mode.value };
  mode.value = 'html';
  customHtml.value = push.html;
  projectId.value = push.projectId ?? '';
  assets.value = push.projectId ? { label: push.name ?? t('app.filesFrom', { source: sourceLabel(push.client) }), count: push.assets?.count ?? 0, size: push.assets?.size ?? 0 } : null;
  sideTab.value = 'edit';
  seek(POSTER_TIME);
  toast(push.name ? t('app.pushedNamed', { source: sourceLabel(push.client), name: push.name }) : t('app.pushed', { source: sourceLabel(push.client) }), {
    label: t('app.undo'),
    run: () => {
      if (projectId.value && projectId.value !== before.projectId) dropProject(projectId.value);
      mode.value = before.mode;
      customHtml.value = before.html;
      projectId.value = before.projectId;
      assets.value = before.assets;
    },
  });
}

function onAiUpdated(ai) {
  if (health.value) health.value.ai = ai;
  if (status.value) status.value = { ...status.value, provider: ai.provider };
}

function setField(id, value) {
  valuesByTemplate[templateId.value][id] = value;
}

function resetFields() {
  if (template.value) Object.assign(valuesByTemplate[templateId.value], defaultsFor(template.value));
}

// Clips are visible in [start, start + duration), so t === duration is always an empty frame.
const lastFrame = () => Math.max(0, info.duration - 1 / 30);

function onReady(next) {
  Object.assign(info, next);
  if (time.value > lastFrame()) time.value = Math.min(POSTER_TIME, lastFrame());
  sound.setClips(next.audio);
  if (playing.value) sound.play(time.value);
}

function readLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}');
    const pick = (k) => (Number.isFinite(saved[k]) ? Math.min(PANEL[k].max, Math.max(PANEL[k].min, saved[k])) : PANEL[k].initial);
    return { side: pick('side') };
  } catch {
    return { side: PANEL.side.initial };
  }
}
function resizePanel(key, width) {
  layout[key] = width;
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {}
}

function readFlag(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function closeGuide() {
  guideOpen.value = false;
  try {
    localStorage.setItem(GUIDE_KEY, '1');
  } catch {}
}

function readMuted() {
  try {
    return localStorage.getItem('hfs-muted') === '1';
  } catch {
    return false;
  }
}
function readVolume() {
  try {
    const v = parseFloat(localStorage.getItem('hfs-volume'));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8;
  } catch {
    return 0.8;
  }
}
function setVolume(v) {
  volume.value = v;
  sound.setVolume(v);
  if (muted.value && v > 0) toggleMute();
  try {
    localStorage.setItem('hfs-volume', String(v));
  } catch {}
}
function toggleMute() {
  muted.value = !muted.value;
  sound.setMuted(muted.value);
const volume = ref(readVolume());
sound.setVolume(volume.value);
  try {
    localStorage.setItem('hfs-muted', muted.value ? '1' : '0');
  } catch {}
}

let raf = 0;
let last = 0;
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  let t = time.value + dt;
  if (t >= info.duration) {
    t = 0;
    sound.play(0);
  }
  time.value = t;
  raf = requestAnimationFrame(frame);
}
function play() {
  if (playing.value) return;
  if (time.value >= info.duration - 1 / 30) time.value = 0;
  playing.value = true;
  last = performance.now();
  raf = requestAnimationFrame(frame);
  sound.play(time.value);
}
function pause() {
  playing.value = false;
  cancelAnimationFrame(raf);
  sound.stop();
}
const toggle = () => (playing.value ? pause() : play());
function seek(t) {
  pause();
  time.value = Math.min(lastFrame(), Math.max(0, t));
}

const timelineOpen = ref(readFlag('hfs-timeline-hidden') === false);
const isFullscreen = ref(false);
const stageEl = ref(null);

function toggleTimeline() {
  timelineOpen.value = !timelineOpen.value;
  try {
    localStorage.setItem('hfs-timeline-hidden', timelineOpen.value ? '0' : '1');
  } catch {}
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else stageEl.value?.requestFullscreen().catch(() => {});
}
const onFullscreenChange = () => (isFullscreen.value = document.fullscreenElement === stageEl.value);

// Space plays anywhere outside a text field; the rest are single-letter shortcuts like most video tools.
function onKeydown(e) {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const el = e.target;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) return;
  if (e.code === 'Space') {
    if (['BUTTON', 'A'].includes(el.tagName)) return;
    e.preventDefault();
    toggle();
  } else if (e.key === 'm' || e.key === 'M') {
    if (info.audio.length) toggleMute();
  } else if (e.key === 'f' || e.key === 'F') {
    toggleFullscreen();
  } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !el.closest('[role="slider"], [role="separator"]')) {
    e.preventDefault();
    const step = e.shiftKey ? 1 : 1 / 30;
    seek(time.value + (e.key === 'ArrowLeft' ? -step : step));
  }
}

async function submitRender(settings) {
  renderError.value = '';
  submitting.value = true;
  try {
    const body =
      mode.value === 'html'
        ? { html: customHtml.value, projectId: projectId.value || undefined, ...settings }
        : { templateId: templateId.value, values: values.value, aspect: aspect.value, ...settings };
    const job = await api('/renders', { method: 'POST', body });
    upsert(job);
    toast(t('app.rendering', { name: job.name }), { label: t('app.view'), run: () => (sideTab.value = 'renders') });
  } catch (err) {
    renderError.value = err.message;
  } finally {
    submitting.value = false;
  }
}

function upsert(job) {
  const i = renders.value.findIndex((r) => r.id === job.id);
  const before = i === -1 ? null : renders.value[i].status;
  if (i === -1) renders.value = [job, ...renders.value];
  else renders.value.splice(i, 1, job);
  if (before === job.status || (before !== 'running' && before !== 'queued')) return;
  if (job.status === 'done') toast(t('app.renderReady', { name: job.name }), { label: t('app.download'), href: fileUrl(job) });
  else if (job.status === 'failed') toast(t('app.renderFailed', { name: job.name }), { label: t('app.details'), run: () => (sideTab.value = 'renders') }, 'error');
}

function toast(text, action, tone = 'info') {
  const id = ++toastSeq;
  toasts.value = [...toasts.value.slice(-2), { id, text, action, tone }];
  setTimeout(() => dismissToast(id), 6000);
}
function dismissToast(id) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

async function loadThumbs() {
  await Promise.all(
    catalog.templates.map(async (t) => {
      try {
        const res = await api('/compose', { method: 'POST', body: { templateId: t.id, values: valuesByTemplate[t.id], aspect: '16:9' } });
        thumbs[t.id] = res.html;
      } catch {
        // A missing thumbnail leaves the card text-only.
      }
    }),
  );
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
  stream.addEventListener('status', (e) => (status.value = JSON.parse(e.data)));
  stream.addEventListener('push', (e) => onPushed(JSON.parse(e.data)));
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
  document.addEventListener('fullscreenchange', onFullscreenChange);
  try {
    const data = await api('/templates');
    catalog.templates = data.templates;
    catalog.aspects = data.aspects;
    for (const t of data.templates) valuesByTemplate[t.id] = defaultsFor(t);
    restoreDraft();
    if (mode.value === 'html' && !customHtml.value.trim()) await seedCustomHtml();
    scheduleCompose(0);
    loadThumbs();
  } catch (err) {
    loadError.value = err.message;
  }
  api('/health').then((h) => (health.value = h)).catch(() => {});
  connectStream();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  cancelAnimationFrame(raf);
  sound.stop();
  stream?.close();
});
</script>

<template>
  <a class="skip-link" href="#stage">{{ t('app.skip') }}</a>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <img class="brand-mark" src="/logo.svg" alt="" width="28" height="28" />
        <span class="brand-word">HyperFrames <span class="brand-studio">Studio</span></span>
      </div>
      <StartSwitch
        class="topbar-start"
        :templates="catalog.templates"
        :thumbs="thumbs"
        :active-id="templateId"
        :mode="mode"
        @select="selectTemplate"
        @custom="openCustom"
      />
      <ConnectionsMenu :status="status" :renders="renders" @status="(s) => (status = s)" />
      <p v-if="health" class="health" :data-ok="Boolean(health.ffmpeg)">
        <span class="health-dot" aria-hidden="true" />
        <span v-if="health.ffmpeg">{{ t('app.readyToRender') }}</span>
        <span v-else>{{ t('app.noFfmpeg') }}</span>
      </p>
      <button
        type="button"
        class="icon-btn lang-btn"
        :aria-label="t('app.language')"
        :title="t('app.language')"
        @click="setLocale(locale === 'vi' ? 'en' : 'vi')"
      >
        {{ locale.toUpperCase() }}
      </button>
      <button type="button" class="icon-btn" :aria-label="t('app.openGuide')" :title="t('app.guide')" @click="guideOpen = true">
        <Icon name="help" />
      </button>
      <button
        type="button"
        class="icon-btn"
        :aria-label="t('app.theme', { theme: t(`theme.${theme}`) })"
        :title="t('app.themeTitle', { theme: t(`theme.${theme}`) })"
        @click="cycleTheme"
      >
        <Icon :name="themeIcon[theme]" />
      </button>
    </header>

    <p v-if="loadError" class="banner" role="alert"><Icon name="alert" :size="16" /> {{ loadError }}</p>

    <div class="workspace" :style="{ '--side-w': `${layout.side}px` }">
      <main id="stage" ref="stageEl" class="ws-stage" tabindex="-1">
        <h1 class="visually-hidden">{{ t('app.preview') }}</h1>
        <PreviewStage
          :html="html"
          :base="previewBase"
          :time="time"
          :playing="playing"
          :busy="composing"
          :error="composeError"
          @ready="onReady"
          @toggle="toggle"
        />
        <Transport
          :time="time"
          :duration="info.duration"
          :playing="playing"
          :size="sizeLabel"
          :has-audio="info.audio.length > 0"
          :muted="muted"
          :volume="volume"
          @toggle="toggle"
          @seek="seek"
          :timeline="timelineOpen"
          :fullscreen="isFullscreen"
          @scrub-start="pause"
          @timeline="toggleTimeline"
          @fullscreen="toggleFullscreen"
          @mute="toggleMute"
          @volume="setVolume"
        />
        <DopeSheet v-show="timelineOpen" :duration="info.duration" :time="time" :tracks="info.tracks" @seek="seek" @scrub-start="pause" />
      </main>

      <PanelSplitter
        class="ws-split ws-split--side"
        :label="t('app.resizeSide')"
        edge="right"
        :width="layout.side"
        :min="PANEL.side.min"
        :max="PANEL.side.max"
        @resize="(w) => resizePanel('side', w)"
        @reset="resizePanel('side', PANEL.side.initial)"
      />

      <aside class="ws-side">
        <div class="tabs" role="tablist" :aria-label="t('app.sidePanel')">
          <button
            id="tab-edit"
            type="button"
            role="tab"
            class="tab"
            :aria-selected="sideTab === 'edit'"
            aria-controls="panel-edit"
            @click="sideTab = 'edit'"
          >
            {{ t('app.tabEdit') }}
          </button>
          <button
            id="tab-renders"
            type="button"
            role="tab"
            class="tab"
            :aria-selected="sideTab === 'renders'"
            aria-controls="panel-renders"
            @click="sideTab = 'renders'"
          >
            {{ t('app.tabRenders') }}
            <span v-if="runningJob" class="tab-badge tab-badge--live">{{ Math.round(runningJob.progress) }}%</span>
            <span v-else-if="renders.length" class="tab-badge">{{ renders.length }}</span>
          </button>
        </div>

        <div class="side-body">
          <div v-show="sideTab === 'edit'" id="panel-edit" role="tabpanel" aria-labelledby="tab-edit">
            <Inspector
              :mode="mode"
              :template="template"
              :values="values"
              :aspects="catalog.aspects"
              :aspect="aspect"
              :html="customHtml"
              :html-size="mode === 'html' ? `${sizeLabel}, ${info.duration}s` : ''"
              :ai="health?.ai"
              :status="status"
              :renders="renders"
              :project-id="projectId"
              :assets="assets"
              @field="setField"
              @reset="resetFields"
              @aspect="(a) => (aspect = a)"
              @html="(v) => (customHtml = v)"
              @generated="onGeneratedHtml"
              @from-template="loadTemplateIntoEditor"
              @ai-updated="onAiUpdated"
              @imported="onImported"
              @clear-assets="clearAssets"
            />
          </div>
          <div v-show="sideTab === 'renders'" id="panel-renders" role="tabpanel" aria-labelledby="tab-renders">
            <RenderList :renders="renders" :sources="status?.connections ?? []" @cancel="cancelRender" @remove="removeRender" />
          </div>
        </div>

        <RenderPanel
          :width="info.width"
          :height="info.height"
          :duration="info.duration"
          :disabled="!html || Boolean(loadError)" :submitting="submitting" :error="renderError" @submit="submitRender" />
      </aside>
    </div>

    <footer class="app-footer">© {{ year }} · by Jin Vũ</footer>
  </div>

  <FirstRunGuide
    :open="guideOpen"
    :status="status"
    @close="closeGuide"
    @status="(s) => (status = s)"
    @start="openCustom(), (sideTab = 'edit')"
  />

  <div class="toasts" aria-live="polite">
    <div v-for="note in toasts" :key="note.id" class="toast" :data-tone="note.tone">
      <Icon :name="note.tone === 'error' ? 'alert' : 'check'" :size="16" />
      <span class="toast-text">{{ note.text }}</span>
      <a v-if="note.action?.href" class="toast-action" :href="note.action.href" download @click="dismissToast(note.id)">{{ note.action.label }}</a>
      <button v-else-if="note.action" type="button" class="toast-action" @click="note.action.run(), dismissToast(note.id)">{{ note.action.label }}</button>
      <button type="button" class="toast-close" :aria-label="t('app.dismiss')" @click="dismissToast(note.id)"><Icon name="x" :size="14" /></button>
    </div>
  </div>
</template>
