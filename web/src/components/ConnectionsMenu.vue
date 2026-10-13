<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
import { api } from '../lib/api.js';
import { connectionState, mostUrgent } from '../lib/connections.js';

const props = defineProps({
  status: { type: Object, default: null },
  renders: { type: Array, default: () => [] },
});
const emit = defineEmits(['status']);

const open = ref(false);
const root = ref(null);
const busy = ref('');
const error = ref('');

const rows = computed(() =>
  (props.status?.connections ?? []).map((conn) => ({
    conn,
    state: connectionState(conn, { generation: props.status.generation, renders: props.renders }),
  })),
);
const ACTIVE = new Set(['rendering', 'running', 'calling', 'connected']);
const lead = computed(() => mostUrgent(rows.value));
const readyCount = computed(() => rows.value.filter((r) => r.state.key !== 'off' && r.state.key !== 'checking').length);
const triggerText = computed(() => {
  if (!lead.value) return 'AI connections';
  if (ACTIVE.has(lead.value.state.key)) return `${lead.value.conn.label} · ${lead.value.state.label}`;
  return readyCount.value ? `AI · ${readyCount.value} ready` : 'AI · not connected';
});

async function refresh() {
  error.value = '';
  busy.value = 'refresh';
  try {
    emit('status', await api('/status/refresh', { method: 'POST' }));
  } catch (err) {
    error.value = err.message;
  } finally {
    busy.value = '';
  }
}

async function setMcp(conn, connected) {
  error.value = '';
  busy.value = conn.id;
  try {
    emit('status', await api(`/connections/${conn.id}/mcp`, { method: 'PUT', body: { connected } }));
  } catch (err) {
    error.value = err.message;
  } finally {
    busy.value = '';
  }
}

function onDocPointer(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false;
}
function onKey(e) {
  if (e.key === 'Escape' && open.value) {
    open.value = false;
    root.value?.querySelector('.conn-trigger')?.focus();
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer);
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <div ref="root" class="conn-menu">
    <button
      type="button"
      class="conn-trigger"
      :aria-expanded="open"
      aria-controls="conn-panel"
      :title="lead?.state.detail ?? 'AI connections'"
      @click="open = !open"
    >
      <span class="state-dot" :data-state="lead?.state.key ?? 'checking'" aria-hidden="true" />
      <span class="conn-trigger-text">{{ triggerText }}</span>
      <Icon name="chevron-down" :size="14" />
    </button>

    <div v-if="open" id="conn-panel" class="conn-panel" role="dialog" aria-label="AI connections">
      <div class="conn-panel-head">
        <h2 class="panel-title">AI connections</h2>
        <button type="button" class="ghost-btn" :disabled="busy === 'refresh' || status?.checking" @click="refresh">
          <Icon name="refresh" :size="14" :class="{ spin: busy === 'refresh' || status?.checking }" /> Check again
        </button>
      </div>

      <ul class="conn-list">
        <li v-for="{ conn, state } in rows" :key="conn.id" class="conn">
          <div class="conn-head">
            <span class="conn-name">{{ conn.label }}</span>
            <span v-if="conn.version" class="conn-version">v{{ conn.version }}</span>
            <span class="state-pill" :data-state="state.key">
              <span class="state-dot" :data-state="state.key" aria-hidden="true" />{{ state.label }}
            </span>
          </div>
          <p v-if="state.detail" class="conn-detail">{{ state.detail }}</p>
          <p v-if="conn.mcp && conn.available && conn.detail !== state.detail" class="conn-sub">{{ conn.detail }}</p>

          <div v-if="conn.mcp && conn.available" class="conn-mcp">
            <span v-if="conn.mcp.registered" class="conn-mcp-text"><Icon name="plug" :size="14" /> Added to {{ conn.app }}</span>
            <button
              v-if="conn.mcp.registered"
              type="button"
              class="text-btn"
              :disabled="busy === conn.id"
              @click="setMcp(conn, false)"
            >
              Remove
            </button>
            <button v-else type="button" class="text-btn conn-add" :disabled="busy === conn.id" @click="setMcp(conn, true)">
              <Icon :name="busy === conn.id ? 'loader' : 'plug'" :size="14" :class="{ spin: busy === conn.id }" /> Add to {{ conn.app }}
            </button>
          </div>
          <p v-else-if="conn.mcp && conn.installed && conn.checked" class="conn-sub">Sign in from a terminal: <code>{{ conn.login }}</code></p>
        </li>
      </ul>

      <p v-if="error" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ error }}</p>

      <div class="conn-howto">
        <p class="group-title">Make videos from a terminal</p>
        <p class="field-hint">
          After adding, open a new <code>claude</code> or <code>codex</code> session in any folder and ask, for example:
          “Use HyperFrames Studio to make a 6-second intro for my app, show it in the Studio, then render an MP4.”
          Sessions that were already open need a restart to see the Studio.
        </p>
      </div>
    </div>
  </div>
</template>
