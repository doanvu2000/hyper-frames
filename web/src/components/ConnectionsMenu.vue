<script setup>
import { ref, computed } from 'vue';
import Popover from './Popover.vue';
import Icon from './Icon.vue';
import { api } from '../lib/api.js';
import { connectionState, mostUrgent } from '../lib/connections.js';
import { t, tr } from '../lib/i18n.js';

const props = defineProps({
  status: { type: Object, default: null },
  renders: { type: Array, default: () => [] },
});
const emit = defineEmits(['status']);

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
  if (!lead.value) return t('conn.menu');
  if (ACTIVE.has(lead.value.state.key)) return `${lead.value.conn.label} · ${lead.value.state.label}`;
  return readyCount.value ? t('conn.someReady', { n: readyCount.value }) : t('conn.noneReady');
});
const inUse = (conn) => props.status?.provider === conn.id;

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
</script>

<template>
  <Popover :label="t('conn.menu')" :title="lead?.state.detail ?? t('conn.menu')" role="dialog" align="end" trigger-class="chip" panel-class="pop--conn">
    <template #trigger>
      <span class="state-dot" :data-state="lead?.state.key ?? 'checking'" aria-hidden="true" />
      <span class="chip-text">{{ triggerText }}</span>
    </template>

    <div class="pop-lbl">{{ t('conn.sources') }}</div>
    <div v-for="{ conn, state } in rows" :key="conn.id" class="conn-row">
      <span class="state-dot" :data-state="state.key" aria-hidden="true" />
      <span class="pop-text">
        {{ conn.label }}<span v-if="conn.version" class="conn-version"> v{{ conn.version }}</span>
        <small>{{ state.detail ?? state.label }}</small>
        <small v-if="conn.mcp && !conn.available && conn.installed && conn.checked">{{ t('conn.signIn') }} <code>{{ conn.login }}</code></small>
      </span>
      <span class="conn-side">
        <span v-if="inUse(conn)" class="conn-inuse">{{ t('conn.inUse') }}</span>
        <span v-else class="conn-state">{{ state.label }}</span>
      </span>
    </div>

    <div class="pop-sep" />
    <div class="pop-lbl">{{ t('conn.howtoTitle') }}</div>
    <template v-for="{ conn } in rows" :key="`mcp-${conn.id}`">
      <div v-if="conn.mcp && conn.available" class="conn-row conn-row--mcp">
        <Icon name="plug" :size="15" />
        <span class="pop-text">{{ conn.mcp.registered ? t('conn.addedTo', { app: conn.app }) : t('conn.addTo', { app: conn.app }) }}</span>
        <button
          v-if="conn.mcp.registered"
          type="button"
          class="text-btn"
          :disabled="busy === conn.id"
          @click="setMcp(conn, false)"
        >
          {{ t('conn.remove') }}
        </button>
        <button v-else type="button" class="text-btn text-btn--strong" :disabled="busy === conn.id" @click="setMcp(conn, true)">
          <Icon v-if="busy === conn.id" name="loader" :size="14" class="spin" /> {{ t('conn.add') }}
        </button>
      </div>
    </template>
    <p class="pop-foot" v-html="tr('conn.howto', { example: t('guide.example') })" />

    <p v-if="error" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ error }}</p>
    <div class="pop-sep" />
    <button type="button" class="pop-item" :disabled="busy === 'refresh' || status?.checking" @click="refresh">
      <Icon name="refresh" :size="15" :class="{ spin: busy === 'refresh' || status?.checking }" />
      <span class="pop-text">{{ t('conn.checkAgain') }}</span>
    </button>
  </Popover>
</template>
