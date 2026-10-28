<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { api, fileUrl } from './lib/api.js';
import Icon from './components/Icon.vue';
import TopBar from './components/TopBar.vue';
import Rail from './components/Rail.vue';
import MonitorBar from './components/MonitorBar.vue';
import PreviewStage from './components/PreviewStage.vue';
import Transport from './components/Transport.vue';
import DopeSheet from './components/DopeSheet.vue';
import AiPanel from './components/AiPanel.vue';
import VersionList from './components/VersionList.vue';
import CodePanel from './components/CodePanel.vue';
import TemplatePanel from './components/TemplatePanel.vue';
import AssetPanel from './components/AssetPanel.vue';
import RenderList from './components/RenderList.vue';
import ExportSheet from './components/ExportSheet.vue';
import CommandPalette from './components/CommandPalette.vue';
import PanelSplitter from './components/PanelSplitter.vue';
import FirstRunGuide from './components/FirstRunGuide.vue';
import { PreviewAudio } from './lib/previewAudio.js';
import { useHistory } from './composables/useHistory.js';
import { useLibrary, rememberedDocId } from './composables/useLibrary.js';
import { usePlayback, SPEEDS } from './composables/usePlayback.js';
import { timecode, PREVIEW_FPS } from './lib/timecode.js';
import { t } from './lib/i18n.js';

const LEGACY_DRAFT_KEY = 'hfs-draft-v2';
const POSTER_TIME = 2;
const OVERLAYS = ['', 'title', 'tiktok', 'reels', 'shorts'];
const PANELS = ['ai', 'code', 'templates', 'assets', 'renders', 'history'];

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
const markers = ref([]);
const inPoint = ref(null);
const outPoint = ref(null);

const html = ref('');
const composing = ref(false);
const composeError = ref('');
const info = reactive({ duration: 1, width: 1920, height: 1080, tracks: [], audio: [], errors: [] });

const sound = new PreviewAudio();
const muted = ref(readFlag('hfs-muted'));
const volume = ref(readVolume());
sound.setMuted(muted.value);
sound.setVolume(volume.value);
const playback = usePlayback({ duration: computed(() => info.duration), inPoint, outPoint, sound, posterTime: POSTER_TIME });
const { time, playing } = playback;

const renders = ref([]);
const submitting = ref(false);
const renderError = ref('');
const notifyIds = new Set();

const theme = ref(document.documentElement.dataset.theme ?? 'system');
const thumbs = reactive({});
const panel = ref(readPanel());
const overlay = ref('');
const zoom = ref('fit');
const toasts = ref([]);
const exportOpen = ref(false);
const paletteOpen = ref(false);
const snapping = ref(false);
const preview = ref(null);
const narrow = ref(false);

const LAYOUT_KEY = 'hfs-layout-v3';
const PANEL_W = { min: 320, max: 640, initial: 360 };
const sideWidth = ref(readSideWidth());
const GUIDE_KEY = 'hfs-guide-v1';
const guideOpen = ref(!readFlag(GUIDE_KEY));
let toastSeq = 0;

const template = computed(() => catalog.templates.find((tpl) => tpl.id === templateId.value) ?? null);
const values = computed(() => valuesByTemplate[templateId.value] ?? {});
const sizeLabel = computed(() => `${info.width}×${info.height}`);
const previewBase = computed(() => (mode.value === 'html' && projectId.value ? `/api/projects/${projectId.value}/files/` : ''));
const stageHtml = computed(() => preview.value?.html ?? html.value);
const activeRenders = computed(() => renders.value.filter((r) => r.status === 'running' || r.status === 'queued'));

function defaultsFor(tpl) {
  return Object.fromEntries(tpl.fields.map((f) => [f.id, f.default]));
}

function readState() {
  return {
    mode: mode.value,
    templateId: templateId.value,
    aspect: aspect.value,
    values: JSON.parse(JSON.stringify(valuesByTemplate)),
    html: customHtml.value,
    projectId: projectId.value,
    assets: assets.value,
    markers: [...markers.value],
    inPoint: inPoint.value,
    outPoint: outPoint.value,
  };
}

function applyState(s) {
  if (!s) return;
  if (s.mode === 'html' || s.mode === 'template') mode.value = s.mode;
  if (catalog.templates.some((tpl) => tpl.id === s.templateId)) templateId.value = s.templateId;
  if (catalog.aspects.some((a) => a.id === s.aspect)) aspect.value = s.aspect;
  for (const tpl of catalog.templates) {
    valuesByTemplate[tpl.id] = { ...defaultsFor(tpl), ...(s.values?.[tpl.id] ?? {}) };
  }
  customHtml.value = typeof s.html === 'string' ? s.html : '';
  projectId.value = s.projectId ?? '';
  assets.value = s.assets ?? null;
  markers.value = Array.isArray(s.markers) ? [...s.markers] : [];
  inPoint.value = Number.isFinite(s.inPoint) ? s.inPoint : null;
  outPoint.value = Number.isFinite(s.outPoint) ? s.outPoint : null;
}

const history = useHistory(readState, applyState);
const library = useLibrary({ readState, applyState });

// Any edit that did not come from a saved version detaches the "current version" marker.
let applyingVersion = false;
watch(customHtml, () => {
  if (!applyingVersion) library.currentVersionId.value = '';
});

let composeSeq = 0;
let composeTimer;
function scheduleCompose(delay = 160) {
  clearTimeout(composeTimer);
  if (mode.value === 'html') {
    composeSeq++;
    composing.value = false;
    composeTimer = setTimeout(() => {
      composeError.value = '';
      html.value = customHtml.value;
    }, delay === 0 ? 0 : 450);
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

const composeTemplateHtml = async (id = templateId.value) =>
  (await api('/compose', { method: 'POST', body: { templateId: id, values: valuesByTemplate[id], aspect: aspect.value } })).html;

function selectTemplate(id) {
  const changed = id !== templateId.value || mode.value !== 'template';
  templateId.value = id;
  mode.value = 'template';
  preview.value = null;
  if (changed) seekPoster();
}

async function templateToHtml() {
  try {
    await setHtmlFromVersion(await composeTemplateHtml(), 'template', template.value?.name ?? '');
    panel.value = 'code';
  } catch (err) {
    composeError.value = err.message;
  }
}

function openCustom() {
  if (!customHtml.value.trim() && html.value) customHtml.value = html.value;
  mode.value = 'html';
}

async function loadTemplateIntoEditor() {
  if (customHtml.value.trim() && !window.confirm(t('app.replaceWithTemplate'))) return;
  await templateToHtml();
}

// Before anything replaces the editor's markup, keep unsaved hand edits as their own version.
async function keepManualEdits() {
  if (mode.value !== 'html' || !customHtml.value.trim() || library.currentVersionId.value) return;
  await library.addVersion(customHtml.value, 'manual', t('ver.beforeChange')).catch(() => {});
}

async function setHtmlFromVersion(next, source, note) {
  await keepManualEdits();
  applyingVersion = true;
  mode.value = 'html';
  customHtml.value = next;
  preview.value = null;
  seekPoster();
  await Promise.resolve();
  applyingVersion = false;
  await library.addVersion(next, source, note).catch((err) => toast(err.message, null, 'error'));
}

function dropImport(id) {
  if (id) api(`/projects/${id}`, { method: 'DELETE' }).catch(() => {});
}

async function onImported(result) {
  if (customHtml.value.trim() && customHtml.value !== result.html && !window.confirm(t('app.replaceWithImport'))) {
    dropImport(result.projectId);
    return;
  }
  projectId.value = result.projectId ?? '';
  assets.value = result.projectId ? { label: result.label, count: result.count, size: result.size } : null;
  await setHtmlFromVersion(result.html, 'import', result.label);
  toast(t('app.imported', { label: result.label }));
}

function clearAssets() {
  projectId.value = '';
  assets.value = null;
}

function onGenerated(next, source, prompt) {
  setHtmlFromVersion(next, source, prompt);
}

const sourceLabel = (id) => status.value?.connections.find((c) => c.id === id)?.label ?? t('app.aiTool');

// Sent by a CLI through MCP. No confirm dialog: nobody may be at the screen, so it lands as a version with Undo.
async function onPushed(push) {
  const before = readState();
  if (push.projectId) {
    projectId.value = push.projectId;
    assets.value = { label: push.name ?? t('app.filesFrom', { source: sourceLabel(push.client) }), count: push.assets?.count ?? 0, size: push.assets?.size ?? 0 };
  }
  await setHtmlFromVersion(push.html, 'mcp', push.name ?? '');
  panel.value = 'ai';
  toast(push.name ? t('app.pushedNamed', { source: sourceLabel(push.client), name: push.name }) : t('app.pushed', { source: sourceLabel(push.client) }), {
    label: t('app.undo'),
    run: () => applyState(before),
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

// The poster seek must wait for the new composition's duration, or it clamps against the old one.
let posterPending = false;
function seekPoster() {
  posterPending = true;
  playback.seek(POSTER_TIME);
}

function onReady(next) {
  Object.assign(info, next);
  if (posterPending) {
    posterPending = false;
    playback.seek(POSTER_TIME);
  } else playback.clampToDuration();
  sound.setClips(next.audio);
  if (playing.value) playback.play();
}

async function previewVersion(id) {
  if (preview.value?.id === id) {
    preview.value = null;
    return;
  }
  try {
    const v = await library.loadVersion(id);
    preview.value = { id, html: v.html, note: v.note || t(`ver.default.${v.source}`), side: 'b' };
  } catch (err) {
    toast(err.message, null, 'error');
  }
}

function flipPreview() {
  if (!preview.value) return;
  preview.value = { ...preview.value, side: preview.value.side === 'b' ? 'a' : 'b' };
}

async function restoreVersion(id) {
  try {
    const v = await library.loadVersion(id);
    await setHtmlFromVersion(v.html, 'restore', v.note || t(`ver.default.${v.source}`));
    toast(t('ver.restored'));
  } catch (err) {
    toast(err.message, null, 'error');
  }
}

async function saveVersion() {
  if (mode.value !== 'html' || !customHtml.value.trim()) {
    await library.save(true);
    toast(t('lib.savedToast'));
    return;
  }
  const v = await library.addVersion(customHtml.value, 'manual', t('ver.savedNote')).catch((err) => toast(err.message, null, 'error'));
  if (v) toast(t('ver.savedToast'));
}

async function openProject(id) {
  try {
    await library.open(id);
    preview.value = null;
    history.reset();
    seekPoster();
  } catch (err) {
    toast(err.message, null, 'error');
    library.refresh();
  }
}

async function freshState() {
  const tpl = catalog.templates.find((x) => x.id === 'title-card') ?? catalog.templates[0];
  for (const x of catalog.templates) valuesByTemplate[x.id] = defaultsFor(x);
  templateId.value = tpl?.id ?? templateId.value;
  mode.value = 'html';
  projectId.value = '';
  assets.value = null;
  markers.value = [];
  inPoint.value = null;
  outPoint.value = null;
  customHtml.value = tpl ? await composeTemplateHtml(tpl.id).catch(() => '') : '';
}

async function createProject() {
  try {
    await library.save();
    library.detach();
    await freshState();
    await library.create(t('lib.untitled'), readState());
    if (customHtml.value) await library.addVersion(customHtml.value, 'template', template.value?.name ?? '');
    preview.value = null;
    history.reset();
    seekPoster();
    panel.value = 'ai';
  } catch (err) {
    toast(err.message, null, 'error');
  }
}

async function onProject(action, arg) {
  if (action === 'open') return openProject(arg);
  if (action === 'create') return createProject();
  if (action === 'rename') return library.rename(arg);
  if (action === 'duplicate') {
    try {
      await library.duplicate(t('lib.copyName', { name: library.name.value }));
      history.reset();
      toast(t('lib.duplicated'));
    } catch (err) {
      toast(err.message, null, 'error');
    }
    return;
  }
  if (action === 'remove') {
    const doc = library.docs.value.find((d) => d.id === arg);
    if (!window.confirm(t('lib.confirmDelete', { name: doc?.name ?? library.name.value }))) return;
    try {
      await library.remove(arg);
      if (arg === library.id.value) {
        const next = library.docs.value[0];
        if (next) await openProject(next.id);
        else await createProject();
      }
    } catch (err) {
      toast(err.message, null, 'error');
    }
  }
}

function readLegacyDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(LEGACY_DRAFT_KEY) ?? 'null');
    if (!draft) return null;
    return { mode: draft.mode, templateId: draft.templateId, aspect: draft.aspect, values: draft.values, html: draft.customHtml, projectId: draft.projectId, assets: draft.assets };
  } catch {
    return null;
  }
}

async function bootLibrary() {
  await library.refresh();
  const remembered = rememberedDocId();
  const docs = library.docs.value;
  const ordered = [docs.find((d) => d.id === remembered), ...docs].filter(Boolean);
  let failure = null;
  for (const doc of new Set(ordered)) {
    try {
      await library.open(doc.id);
      return;
    } catch (err) {
      failure = err;
    }
  }
  if (failure) {
    toast(failure.message, null, 'error');
    return;
  }
  const legacy = readLegacyDraft();
  if (legacy) applyState(legacy);
  else await freshState();
  if (mode.value === 'html' && !customHtml.value.trim()) customHtml.value = await composeTemplateHtml().catch(() => '');
  await library.create(t('lib.untitled'), readState());
  if (customHtml.value) await library.addVersion(customHtml.value, legacy ? 'manual' : 'template', legacy ? t('ver.migrated') : (template.value?.name ?? ''));
  try {
    localStorage.removeItem(LEGACY_DRAFT_KEY);
  } catch {}
}

function setIn() {
  inPoint.value = Math.round(time.value * PREVIEW_FPS) / PREVIEW_FPS;
  if (outPoint.value !== null && outPoint.value <= inPoint.value) outPoint.value = null;
}
function setOut() {
  outPoint.value = Math.round(time.value * PREVIEW_FPS) / PREVIEW_FPS;
  if (inPoint.value !== null && inPoint.value >= outPoint.value) inPoint.value = null;
}
function clearRange() {
  inPoint.value = null;
  outPoint.value = null;
  playback.loop.value = false;
}
function toggleLoop() {
  playback.loop.value = !playback.loop.value;
  if (playback.loop.value && !playback.hasRange.value) toast(t('transport.loopWhole'));
}
function addMarker() {
  const at = Math.round(time.value * PREVIEW_FPS) / PREVIEW_FPS;
  if (markers.value.includes(at)) return;
  markers.value = [...markers.value, at].sort((a, b) => a - b);
}
function removeMarker(m) {
  markers.value = markers.value.filter((x) => x !== m);
}
function jumpMarker(dir) {
  const eps = 1 / PREVIEW_FPS / 2;
  const next = dir > 0 ? markers.value.find((m) => m > time.value + eps) : [...markers.value].reverse().find((m) => m < time.value - eps);
  if (next !== undefined) playback.seek(next);
}
function cycleOverlay() {
  overlay.value = OVERLAYS[(OVERLAYS.indexOf(overlay.value) + 1) % OVERLAYS.length];
  toast(overlay.value ? t('overlay.now', { name: overlay.value === 'title' ? t('overlay.title') : overlay.value }) : t('overlay.off'));
}

function readSideWidth() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}').side;
    return Number.isFinite(saved) ? Math.min(PANEL_W.max, Math.max(PANEL_W.min, saved)) : PANEL_W.initial;
  } catch {
    return PANEL_W.initial;
  }
}
function resizeSide(width) {
  sideWidth.value = width;
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ side: width }));
  } catch {}
}
function readPanel() {
  try {
    const saved = localStorage.getItem('hfs-panel');
    return PANELS.includes(saved) ? saved : 'ai';
  } catch {
    return 'ai';
  }
}
watch(panel, (p) => {
  try {
    localStorage.setItem('hfs-panel', p);
  } catch {}
});
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
  try {
    localStorage.setItem('hfs-muted', muted.value ? '1' : '0');
  } catch {}
}

const timelineOpen = ref(!readFlag('hfs-timeline-hidden'));
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
// Overlays live outside the fullscreen stage, so they would open unseen and swallow shortcuts.
watch([paletteOpen, exportOpen], ([palette, sheet]) => {
  if ((palette || sheet) && document.fullscreenElement) document.exitFullscreen().catch(() => {});
});
const onFullscreenChange = () => (isFullscreen.value = document.fullscreenElement === stageEl.value);

function sourceBody() {
  return mode.value === 'html'
    ? { html: customHtml.value, projectId: projectId.value || undefined }
    : { templateId: templateId.value, values: values.value, aspect: aspect.value };
}

async function snapshot() {
  if (snapping.value) return;
  snapping.value = true;
  try {
    const res = await fetch('/api/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...sourceBody(), time: time.value }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? t('snap.failed'));
    const name = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'frame.png';
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast(t('snap.saved', { name }));
  } catch (err) {
    toast(err.message, null, 'error');
  } finally {
    snapping.value = false;
  }
}

async function submitExport(opts) {
  renderError.value = '';
  submitting.value = true;
  if (opts.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  try {
    const base = library.name.value || t('lib.untitled');
    let n = 0;
    for (const a of opts.aspects) {
      for (const format of opts.formats) {
        const body = { ...sourceBody(), fps: opts.fps, quality: opts.quality, format, range: opts.range ?? undefined };
        if (a) body.aspect = a;
        body.name = [base, opts.aspects.length > 1 ? a : '', opts.range ? `${timecode(opts.range.start)}–${timecode(opts.range.end)}` : ''].filter(Boolean).join(' · ');
        const job = await api('/renders', { method: 'POST', body });
        if (opts.notify) notifyIds.add(job.id);
        upsert(job);
        n += 1;
      }
    }
    exportOpen.value = false;
    toast(n === 1 ? t('app.rendering', { name: base }) : t('export.queued', { n }), { label: t('app.view'), run: () => (panel.value = 'renders') });
  } catch (err) {
    renderError.value = err.message;
  } finally {
    submitting.value = false;
  }
}

function notify(job) {
  if (!notifyIds.has(job.id)) return;
  notifyIds.delete(job.id);
  if (!('Notification' in window) || Notification.permission !== 'granted' || document.hasFocus()) return;
  const n = new Notification(job.status === 'done' ? t('app.renderReady', { name: job.name }) : t('app.renderFailed', { name: job.name }), {
    body: job.status === 'done' ? `${job.width}×${job.height} · ${job.format.toUpperCase()}` : job.error ?? '',
    icon: '/logo.svg',
    tag: job.id,
  });
  n.onclick = () => {
    window.focus();
    panel.value = 'renders';
  };
}

function upsert(job) {
  const i = renders.value.findIndex((r) => r.id === job.id);
  const before = i === -1 ? null : renders.value[i].status;
  if (i === -1) renders.value = [job, ...renders.value];
  else renders.value.splice(i, 1, job);
  if (before === job.status || (before !== 'running' && before !== 'queued')) return;
  if (job.status === 'done' || job.status === 'failed') notify(job);
  if (job.status === 'done') toast(t('app.renderReady', { name: job.name }), { label: t('app.download'), href: fileUrl(job) });
  else if (job.status === 'failed') toast(t('app.renderFailed', { name: job.name }), { label: t('app.details'), run: () => (panel.value = 'renders') }, 'error');
}

function toast(text, action, tone = 'info') {
  const id = ++toastSeq;
  toasts.value = [...toasts.value.slice(-2), { id, text, action, tone }];
  setTimeout(() => dismissToast(id), 5000);
}
function dismissToast(id) {
  toasts.value = toasts.value.filter((x) => x.id !== id);
}

async function loadThumbs() {
  await Promise.all(
    catalog.templates.map(async (tpl) => {
      try {
        const res = await api('/compose', { method: 'POST', body: { templateId: tpl.id, values: defaultsFor(tpl), aspect: '16:9' } });
        thumbs[tpl.id] = res.html;
      } catch {}
    }),
  );
}

async function cancelRender(id) {
  try {
    await api(`/renders/${id}/cancel`, { method: 'POST' });
  } catch (err) {
    toast(err.message, null, 'error');
  }
}
async function removeRender(id) {
  try {
    await api(`/renders/${id}`, { method: 'DELETE' });
    renders.value = renders.value.filter((r) => r.id !== id);
  } catch (err) {
    toast(err.message, null, 'error');
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
function cycleTheme() {
  theme.value = THEMES[(THEMES.indexOf(theme.value) + 1) % THEMES.length];
  if (theme.value === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme.value;
  try {
    if (theme.value === 'system') localStorage.removeItem('hfs-theme');
    else localStorage.setItem('hfs-theme', theme.value);
  } catch {}
}

const canExport = computed(() => Boolean(html.value) && !loadError.value);
const commands = computed(() => {
  const g = { file: t('cmd.file'), play: t('cmd.play'), view: t('cmd.view'), go: t('cmd.go'), proj: t('cmd.projects') };
  const list = [
    { id: 'export', group: g.file, icon: 'export', label: t('cmd.export'), keys: 'Ctrl+E', run: () => (exportOpen.value = true), disabled: !canExport.value },
    { id: 'save', group: g.file, icon: 'history', label: t('cmd.saveVersion'), keys: 'Ctrl+S', run: saveVersion },
    { id: 'undo', group: g.file, icon: 'undo', label: t('top.undo'), keys: 'Ctrl+Z', run: history.undo, disabled: !history.canUndo.value },
    { id: 'redo', group: g.file, icon: 'redo', label: t('top.redo'), keys: 'Ctrl+Shift+Z', run: history.redo, disabled: !history.canRedo.value },
    { id: 'snap', group: g.file, icon: 'camera', label: t('snap.title'), keys: 'Shift+P', run: snapshot },
    { id: 'new', group: g.proj, icon: 'plus', label: t('lib.new'), run: createProject },
    { id: 'dup', group: g.proj, icon: 'copy', label: t('lib.duplicate'), run: () => onProject('duplicate') },
    { id: 'toggle', group: g.play, icon: 'play', label: t('cmd.playPause'), keys: 'Space', run: playback.toggle },
    { id: 'fwd', group: g.play, icon: 'chevron-right', label: t('cmd.shuttle'), keys: 'J K L', run: () => playback.shuttle(1) },
    { id: 'in', group: g.play, icon: 'flag', label: t('transport.setIn'), keys: 'I', run: setIn },
    { id: 'out', group: g.play, icon: 'flag', label: t('transport.setOut'), keys: 'O', run: setOut },
    { id: 'clear', group: g.play, icon: 'x', label: t('cmd.clearRange'), keys: 'X', run: clearRange },
    { id: 'loop', group: g.play, icon: 'repeat', label: t('transport.loop'), keys: 'Shift+L', run: toggleLoop },
    { id: 'marker', group: g.play, icon: 'flag', label: t('transport.marker'), keys: 'M', run: addMarker },
    { id: 'markers', group: g.play, icon: 'flag', label: t('cmd.markerJump'), keys: '[ ]', run: () => jumpMarker(1) },
    ...SPEEDS.map((s) => ({ id: `speed-${s}`, group: g.play, icon: 'play', label: t('cmd.speed', { s }), run: () => playback.setSpeed(s) })),
    ...OVERLAYS.map((o) => ({
      id: `ov-${o || 'none'}`,
      group: g.view,
      icon: 'scan',
      label: o ? t('cmd.overlay', { name: o === 'title' ? t('overlay.title') : o.charAt(0).toUpperCase() + o.slice(1) }) : t('overlay.none'),
      keys: o === 'tiktok' ? 'Shift+S' : '',
      run: () => (overlay.value = o),
    })),
    { id: 'zoom-fit', group: g.view, icon: 'maximize', label: t('zoom.fit'), keys: 'Shift+F', run: () => (zoom.value = 'fit') },
    { id: 'zoom-100', group: g.view, icon: 'maximize', label: '100%', keys: 'Shift+1', run: () => (zoom.value = 1) },
    { id: 'timeline', group: g.view, icon: 'timeline', label: t('transport.timeline'), run: toggleTimeline },
    { id: 'full', group: g.view, icon: 'maximize', label: t('transport.fullscreen'), keys: 'F', run: toggleFullscreen },
    { id: 'theme', group: g.view, icon: 'moon', label: t('cmd.theme'), run: cycleTheme },
    ...PANELS.map((p, i) => ({ id: `panel-${p}`, group: g.go, icon: 'chevron-right', label: t('cmd.open', { name: t(`rail.${p}`) }), keys: `Alt+${i + 1}`, run: () => (panel.value = p) })),
    { id: 'guide', group: g.go, icon: 'help', label: t('app.guide'), run: () => (guideOpen.value = true) },
    ...library.docs.value
      .filter((d) => d.id !== library.id.value)
      .slice(0, 8)
      .map((d) => ({ id: `doc-${d.id}`, group: g.proj, icon: 'film', label: t('cmd.openProject', { name: d.name }), run: () => openProject(d.id) })),
  ];
  return list;
});

function isTyping(el) {
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable || Boolean(el.closest?.('.cm-editor'));
}

function onKeydown(e) {
  const el = e.target;
  const mod = e.ctrlKey || e.metaKey;
  const key = (e.key ?? '').toLowerCase();
  if (mod && !e.altKey && key === 'k') {
    e.preventDefault();
    paletteOpen.value = !paletteOpen.value;
    return;
  }
  if (mod && !e.altKey && key === 'e') {
    e.preventDefault();
    if (canExport.value) exportOpen.value = true;
    return;
  }
  if (mod && !e.altKey && key === 's') {
    e.preventDefault();
    saveVersion();
    return;
  }
  if (paletteOpen.value || exportOpen.value || isTyping(el)) return;
  if (mod && (key === 'z' || key === 'y')) {
    e.preventDefault();
    if (key === 'y' || e.shiftKey) history.redo();
    else history.undo();
    return;
  }
  if (e.altKey && !mod && /^Digit[1-6]$/.test(e.code)) {
    e.preventDefault();
    panel.value = PANELS[Number(e.code.slice(5)) - 1];
    return;
  }
  if (mod || e.altKey) return;
  if (el.closest?.('[role="slider"], [role="separator"], .pop')) {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) return;
  }
  const arrows = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
  if (e.repeat && !arrows) return;

  if (e.code === 'Space') {
    if (['BUTTON', 'A'].includes(el.tagName)) return;
    e.preventDefault();
    playback.toggle();
  } else if (arrows) {
    e.preventDefault();
    if (e.shiftKey) playback.seek(time.value + (e.key === 'ArrowLeft' ? -1 : 1));
    else playback.step(e.key === 'ArrowLeft' ? -1 : 1);
  } else if (e.key === 'Home') playback.seek(inPoint.value ?? 0);
  else if (e.key === 'End') playback.seek(outPoint.value ?? info.duration);
  else if (e.shiftKey && key === 'l') toggleLoop();
  else if (e.shiftKey && key === 's') cycleOverlay();
  else if (e.shiftKey && key === 'p') snapshot();
  else if (e.shiftKey && key === 'f') zoom.value = 'fit';
  else if (e.shiftKey && e.code === 'Digit1') zoom.value = 1;
  else if (e.shiftKey) {
    if (e.key === '?') paletteOpen.value = true;
  } else if (key === 'k') playback.pause();
  else if (key === 'l') playback.shuttle(1);
  else if (key === 'j') playback.shuttle(-1);
  else if (key === 'i') setIn();
  else if (key === 'o') setOut();
  else if (key === 'x') clearRange();
  else if (key === 'm') addMarker();
  else if (e.key === '[') jumpMarker(-1);
  else if (e.key === ']') jumpMarker(1);
  else if (key === 'f') toggleFullscreen();
  else if (e.key === '\\') flipPreview();
  else if (key === 'v' && info.audio.length) toggleMute();
}

const narrowQuery = window.matchMedia('(max-width: 820px)');
const onNarrow = () => (narrow.value = narrowQuery.matches);

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  narrowQuery.addEventListener('change', onNarrow);
  onNarrow();
  try {
    const data = await api('/templates');
    catalog.templates = data.templates;
    catalog.aspects = data.aspects;
    for (const tpl of data.templates) valuesByTemplate[tpl.id] = defaultsFor(tpl);
    await bootLibrary();
    history.reset();
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
  narrowQuery.removeEventListener('change', onNarrow);
  playback.stop();
  stream?.close();
});
</script>

<template>
  <a class="skip-link" href="#stage">{{ t('app.skip') }}</a>
  <div class="app">
    <TopBar
      :library="library"
      :status="status"
      :renders="renders"
      :can-undo="history.canUndo.value"
      :can-redo="history.canRedo.value"
      :theme="theme"
      :export-disabled="!canExport"
      @undo="history.undo"
      @redo="history.redo"
      @status="(s) => (status = s)"
      @renders="panel = 'renders'"
      @palette="paletteOpen = true"
      @guide="guideOpen = true"
      @theme="cycleTheme"
      @export="exportOpen = true"
      @project="onProject"
    />

    <p v-if="loadError" class="banner" role="alert"><Icon name="alert" :size="16" /> {{ loadError }}</p>
    <p v-else-if="health && !health.ffmpeg" class="banner" role="alert"><Icon name="alert" :size="16" /> {{ t('app.noFfmpeg') }}</p>

    <div class="ws" :style="{ '--side-w': `${sideWidth}px` }" :data-timeline="timelineOpen ? 'on' : 'off'">
      <Rail :active="panel" :badge="activeRenders.length || renders.length" :live="activeRenders.length > 0" @select="(p) => (panel = p)" />

      <main id="stage" ref="stageEl" class="center" tabindex="-1">
        <h1 class="visually-hidden">{{ t('app.preview') }}</h1>
        <div class="monitor">
          <MonitorBar
            :overlay="overlay"
            :zoom="zoom"
            :snapping="snapping"
            :disabled="!canExport"
            @overlay="(v) => (overlay = v)"
            @zoom="(v) => (zoom = v)"
            @snapshot="snapshot"
          />
          <PreviewStage
            :html="preview?.side === 'b' ? stageHtml : html"
            :base="previewBase"
            :time="time"
            :playing="playing"
            :busy="composing"
            :error="composeError"
            :zoom="zoom"
            :overlay="overlay"
            @ready="onReady"
            @toggle="playback.toggle"
          >
            <template #banner>
              <div v-if="preview" class="compare" role="status">
                <span class="compare-side" :data-side="preview.side">{{ preview.side === 'b' ? 'B' : 'A' }}</span>
                <span class="compare-text">{{ preview.side === 'b' ? t('ver.viewing', { name: preview.note }) : t('ver.viewingCurrent') }}</span>
                <button type="button" class="wchip" :title="t('ver.flipKey')" @click="flipPreview">{{ t('ver.flip') }}</button>
                <button type="button" class="wchip wchip--go" @click="restoreVersion(preview.id)">{{ t('ver.useThis') }}</button>
                <button type="button" class="wchip" :aria-label="t('ver.closeCompare')" @click="preview = null"><Icon name="x" :size="14" /></button>
              </div>
            </template>
          </PreviewStage>
        </div>
        <Transport
          :time="time"
          :duration="info.duration"
          :playing="playing"
          :rate="playback.rate.value"
          :speed="playback.speed.value"
          :loop="playback.loop.value"
          :in-point="inPoint"
          :out-point="outPoint"
          :size="sizeLabel"
          :has-audio="info.audio.length > 0"
          :muted="muted"
          :volume="volume"
          :timeline="timelineOpen && !narrow"
          :fullscreen="isFullscreen"
          @toggle="playback.toggle"
          @seek="playback.seek"
          @scrub-start="playback.pause"
          @step="playback.step"
          @set-in="setIn"
          @set-out="setOut"
          @loop="toggleLoop"
          @speed="playback.setSpeed"
          @marker="addMarker"
          @timeline="toggleTimeline"
          @fullscreen="toggleFullscreen"
          @mute="toggleMute"
          @volume="setVolume"
        />
        <DopeSheet
          v-if="timelineOpen && !narrow"
          :duration="info.duration"
          :time="time"
          :tracks="info.tracks"
          :audio="info.audio"
          :markers="markers"
          :in-point="inPoint"
          :out-point="outPoint"
          @seek="playback.seek"
          @scrub-start="playback.pause"
          @remove-marker="removeMarker"
        />
      </main>

      <PanelSplitter
        class="ws-split"
        :label="t('app.resizeSide')"
        edge="right"
        :width="sideWidth"
        :min="PANEL_W.min"
        :max="PANEL_W.max"
        @resize="resizeSide"
        @reset="resizeSide(PANEL_W.initial)"
      />

      <aside class="insp" :aria-label="t(`rail.${panel}`)">
        <header class="insp-head">
          <h2>{{ t(`panel.${panel}`) }}</h2>
        </header>

        <div v-if="panel === 'ai'" class="insp-body insp-body--ai">
          <AiPanel
            :ai="health?.ai"
            :status="status"
            :renders="renders"
            :aspects="catalog.aspects"
            :current-html="mode === 'html' ? customHtml : ''"
            :project-id="projectId"
            @generated="onGenerated"
            @ai-updated="onAiUpdated"
          />
          <div class="ver-wrap">
            <h3 class="group-title">{{ t('ver.title') }}</h3>
            <VersionList
              :versions="library.versions.value"
              :current-id="library.currentVersionId.value"
              :preview-id="preview?.id ?? ''"
              @preview="previewVersion"
              @restore="restoreVersion"
            />
            <button v-if="library.versions.value.length" type="button" class="link-btn" @click="panel = 'history'">
              {{ t('ver.all', { n: library.versions.value.length }) }}
            </button>
          </div>
        </div>

        <div v-else-if="panel === 'code'" class="insp-body insp-body--code">
          <CodePanel
            v-if="mode === 'html'"
            :html="customHtml"
            :project-id="projectId"
            :script-errors="info.errors ?? []"
            @html="(v) => (customHtml = v)"
            @from-template="loadTemplateIntoEditor"
          />
          <div v-else class="empty">
            <p>{{ t('code.templateMode', { name: template?.name ?? '' }) }}</p>
            <button type="button" class="btn btn--line" @click="templateToHtml"><Icon name="code" :size="15" /> {{ t('tpl.toHtml') }}</button>
            <button type="button" class="ghost-btn" @click="openCustom">{{ t('code.backToHtml') }}</button>
          </div>
        </div>

        <div v-else-if="panel === 'templates'" class="insp-body">
          <TemplatePanel
            :templates="catalog.templates"
            :thumbs="thumbs"
            :mode="mode"
            :template="template"
            :values="values"
            :aspects="catalog.aspects"
            :aspect="aspect"
            @select="selectTemplate"
            @field="setField"
            @reset="resetFields"
            @aspect="(a) => (aspect = a)"
            @to-html="templateToHtml"
          />
        </div>

        <div v-else-if="panel === 'assets'" class="insp-body">
          <AssetPanel
            :project-id="mode === 'html' ? projectId : ''"
            :assets="assets"
            @imported="onImported"
            @clear-assets="clearAssets"
            @copied="(p) => toast(t('assets.copied', { path: p }))"
          />
        </div>

        <div v-else-if="panel === 'renders'" class="insp-body">
          <RenderList :renders="renders" :sources="status?.connections ?? []" @cancel="cancelRender" @remove="removeRender" />
        </div>

        <div v-else class="insp-body insp-body--history">
          <p class="field-hint">{{ t('ver.historyHint') }}</p>
          <VersionList
            class="versions--full"
            :versions="library.versions.value"
            :current-id="library.currentVersionId.value"
            :preview-id="preview?.id ?? ''"
            @preview="previewVersion"
            @restore="restoreVersion"
          />
        </div>
      </aside>
    </div>
  </div>

  <ExportSheet
    :open="exportOpen"
    :mode="mode"
    :aspects="catalog.aspects"
    :aspect="aspect"
    :width="info.width"
    :height="info.height"
    :duration="info.duration"
    :in-point="inPoint"
    :out-point="outPoint"
    :submitting="submitting"
    :error="renderError"
    @close="exportOpen = false"
    @submit="submitExport"
  />
  <CommandPalette :open="paletteOpen" :commands="commands" @close="paletteOpen = false" />

  <FirstRunGuide :open="guideOpen" :status="status" @close="closeGuide" @status="(s) => (status = s)" @start="openCustom(), (panel = 'ai')" />

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
