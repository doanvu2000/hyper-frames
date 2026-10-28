import { ref, computed, watch } from 'vue';
import { api } from '../lib/api.js';

const CURRENT_KEY = 'hfs-doc-id';
const SAVE_DELAY = 800;

function remember(id) {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  } catch {}
}

export function rememberedDocId() {
  try {
    return localStorage.getItem(CURRENT_KEY) ?? '';
  } catch {
    return '';
  }
}

// One saved project open at a time. The page state is the source of truth; the server copy follows it.
export function useLibrary({ readState, applyState }) {
  const docs = ref([]);
  const id = ref('');
  const name = ref('');
  const versions = ref([]);
  const currentVersionId = ref('');
  const saveState = ref('saved');
  const error = ref('');
  let saveTimer = 0;
  let loading = false;
  let lastSaved = '';

  const current = computed(() => docs.value.find((d) => d.id === id.value) ?? null);

  async function refresh() {
    try {
      docs.value = (await api('/library')).docs;
    } catch (err) {
      error.value = err.message;
    }
  }

  function adopt(doc) {
    loading = true;
    id.value = doc.id;
    name.value = doc.name;
    versions.value = doc.versions ?? [];
    currentVersionId.value = '';
    applyState(doc.state);
    lastSaved = JSON.stringify(readState());
    saveState.value = 'saved';
    remember(doc.id);
    queueMicrotask(() => (loading = false));
  }

  async function open(docId) {
    flush();
    const doc = await api(`/library/${docId}`);
    adopt(doc);
    await markCurrentIfLatest(readState().html);
    return doc;
  }

  async function create(docName, state) {
    flush();
    const doc = await api('/library', { method: 'POST', body: { name: docName, state } });
    adopt(doc);
    refresh();
    return doc;
  }

  async function duplicate(docName) {
    await save();
    const doc = await api(`/library/${id.value}/duplicate`, { method: 'POST', body: { name: docName } });
    adopt(doc);
    refresh();
    return doc;
  }

  async function remove(docId) {
    await api(`/library/${docId}`, { method: 'DELETE' });
    docs.value = docs.value.filter((d) => d.id !== docId);
  }

  async function rename(next) {
    const clean = next.trim();
    if (!clean || clean === name.value) return;
    name.value = clean;
    await save(true);
  }

  async function save(force = false) {
    clearTimeout(saveTimer);
    saveTimer = 0;
    const docId = id.value;
    if (!docId) return;
    const state = readState();
    const json = JSON.stringify(state);
    if (!force && json === lastSaved) return;
    saveState.value = 'saving';
    try {
      const doc = await api(`/library/${docId}`, { method: 'PUT', body: { name: name.value, state } });
      const i = docs.value.findIndex((d) => d.id === doc.id);
      if (i !== -1) docs.value.splice(i, 1, { ...docs.value[i], name: doc.name, updatedAt: doc.updatedAt });
      if (id.value !== docId) return;
      lastSaved = json;
      saveState.value = 'saved';
    } catch (err) {
      if (id.value !== docId) return;
      saveState.value = 'error';
      error.value = err.message;
    }
  }

  function flush() {
    if (saveTimer) save();
  }

  // Called before the page state is wiped for another doc, so the wipe is never saved over the one being left.
  function detach() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    loading = true;
    id.value = '';
  }

  function flushOnUnload() {
    if (!saveTimer || !id.value) return;
    const body = JSON.stringify({ name: name.value, state: readState() });
    // Browsers cap keepalive bodies at 64 KB; a bigger one goes as a normal request and may not land.
    if (body.length > 60000) return save();
    fetch(`/api/library/${id.value}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  }

  watch(
    () => JSON.stringify(readState()),
    () => {
      if (loading || !id.value) return;
      saveState.value = 'pending';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, SAVE_DELAY);
    },
  );

  async function addVersion(html, source, note = '') {
    if (!id.value || !html?.trim()) return null;
    const res = await api(`/library/${id.value}/versions`, { method: 'POST', body: { html, source, note: note.slice(0, 120) } });
    if (!res.duplicate) versions.value = [...versions.value, res.version];
    currentVersionId.value = res.version.id;
    return res.version;
  }

  const loadVersion = (versionId) => api(`/library/${id.value}/versions/${versionId}`);

  async function markCurrentIfLatest(html) {
    const latest = versions.value[versions.value.length - 1];
    if (!latest || !html) return;
    try {
      const full = await loadVersion(latest.id);
      if (full.html === html) currentVersionId.value = latest.id;
    } catch {}
  }

  window.addEventListener('beforeunload', flushOnUnload);

  return {
    docs,
    id,
    name,
    current,
    versions,
    currentVersionId,
    saveState,
    error,
    refresh,
    open,
    create,
    duplicate,
    remove,
    rename,
    save,
    detach,
    addVersion,
    loadVersion,
  };
}
