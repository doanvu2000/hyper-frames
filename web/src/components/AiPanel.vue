<script setup>
import { ref, computed, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
import { api } from '../lib/api.js';
import { connectionState } from '../lib/connections.js';
import { t, tr } from '../lib/i18n.js';

const props = defineProps({
  ai: { type: Object, default: null },
  status: { type: Object, default: null },
  renders: { type: Array, default: () => [] },
  aspects: { type: Array, default: () => [] },
  currentHtml: { type: String, default: '' },
  projectId: { type: String, default: '' },
});
const emit = defineEmits(['generated', 'ai-updated']);

const examples = computed(() => [t('ai.example1'), t('ai.example2'), t('ai.example3')]);
const SOURCE_LABEL = { api: 'API key', 'claude-cli': 'Claude CLI', 'codex-cli': 'Codex CLI' };
const BUTTON_LABEL = { api: 'Claude API', 'claude-cli': 'Claude CLI', 'codex-cli': 'Codex CLI' };

const prompt = ref('');
const aspect = ref('16:9');
const duration = ref(6);
const revise = ref(false);
const streaming = ref(false);
const phase = ref('');
const written = ref('');
const error = ref('');
const keyInput = ref('');
const editingKey = ref(false);
const savingKey = ref(false);
const elapsed = ref(0);
let controller = null;
let ticker = 0;

const connections = computed(() => props.status?.connections ?? []);
const provider = computed(() => props.status?.provider ?? props.ai?.provider ?? 'api');
const source = computed(() => connections.value.find((c) => c.id === provider.value) ?? null);
const stateOf = (conn) => connectionState(conn, { generation: props.status?.generation, renders: props.renders });
const sourceState = computed(() => {
  const state = stateOf(source.value);
  return state.key === 'ready' ? { ...state, label: t('ai.ready') } : state;
});

const needsKey = computed(() => provider.value === 'api' && (!props.ai?.ready || editingKey.value));
const cliBlocked = computed(() => provider.value !== 'api' && source.value?.checked && !source.value.available);
const tail = computed(() => written.value.split('\n').slice(-5).join('\n'));
const lineCount = computed(() => (written.value ? written.value.split('\n').length : 0));
const label = computed(() => source.value?.label ?? t('ai.theModel'));
const progressText = computed(() => {
  if (phase.value === 'calling') return t('ai.calling', { label: label.value, s: elapsed.value });
  if (written.value) return t('ai.writing', { label: label.value, n: lineCount.value });
  return t('ai.running', { label: label.value, s: elapsed.value });
});
const modelHint = computed(() => {
  if (provider.value === 'api') return t('ai.hintApi', { model: props.ai?.model });
  if (provider.value === 'claude-cli') return t('ai.hintClaude');
  return t('ai.hintCodex');
});

async function pickSource(id) {
  if (id === provider.value || streaming.value) return;
  error.value = '';
  try {
    emit('ai-updated', await api('/settings/ai', { method: 'PUT', body: { provider: id } }));
  } catch (err) {
    error.value = err.message;
  }
}

async function saveKey() {
  error.value = '';
  savingKey.value = true;
  try {
    const ai = await api('/settings/ai', { method: 'PUT', body: { apiKey: keyInput.value } });
    keyInput.value = '';
    editingKey.value = false;
    emit('ai-updated', ai);
  } catch (err) {
    error.value = err.message;
  } finally {
    savingKey.value = false;
  }
}

async function generate() {
  error.value = '';
  written.value = '';
  phase.value = 'calling';
  streaming.value = true;
  elapsed.value = 0;
  const started = Date.now();
  ticker = setInterval(() => (elapsed.value = Math.round((Date.now() - started) / 1000)), 1000);
  controller = new AbortController();
  const used = provider.value;
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        provider: used,
        prompt: prompt.value,
        aspect: aspect.value,
        duration: duration.value,
        currentHtml: revise.value ? props.currentHtml : undefined,
        projectId: props.projectId || undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? t('ai.failed', { status: res.status }));
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line) continue;
        const event = JSON.parse(line);
        if (event.type === 'phase') phase.value = event.phase;
        else if (event.type === 'delta') written.value += event.text;
        else if (event.type === 'done') emit('generated', event.html, used);
        else if (event.type === 'error') throw new Error(event.error);
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') error.value = err.message;
  } finally {
    streaming.value = false;
    phase.value = '';
    clearInterval(ticker);
    controller = null;
  }
}

function stop() {
  controller?.abort();
}

onBeforeUnmount(() => clearInterval(ticker));
</script>

<template>
  <div class="group ai">
    <div class="ai-head">
      <h3 class="group-title"><Icon name="sparkles" :size="14" /> {{ t('ai.title') }}</h3>
      <button v-if="provider === 'api' && ai?.ready && !editingKey" type="button" class="ghost-btn" @click="editingKey = true">{{ t('ai.apiKey') }}</button>
    </div>

    <div class="field">
      <span id="ai-source-label" class="field-label">{{ t('ai.source') }}</span>
      <div class="segmented" role="radiogroup" aria-labelledby="ai-source-label">
        <button
          v-for="conn in connections"
          :key="conn.id"
          type="button"
          role="radio"
          class="segmented-item"
          :aria-checked="conn.id === provider"
          :disabled="streaming"
          :title="stateOf(conn).detail ?? stateOf(conn).label"
          @click="pickSource(conn.id)"
        >
          <span class="state-dot" :data-state="stateOf(conn).key" aria-hidden="true" />
          {{ SOURCE_LABEL[conn.id] ?? conn.label }}
        </button>
      </div>
      <p v-if="source" class="ai-source-state">
        <span class="state-pill" :data-state="sourceState.key">
          <span class="state-dot" :data-state="sourceState.key" aria-hidden="true" />{{ sourceState.label }}
        </span>
        <span class="field-hint">{{ source.id === 'api' ? sourceState.detail : source.detail }}</span>
      </p>
    </div>

    <form v-if="needsKey" class="ai-key" @submit.prevent="saveKey">
      <label class="field-label" for="ai-key">{{ t('ai.keyLabel') }}</label>
      <p class="field-hint">
        <span v-html="tr('ai.keyHintA')" />
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>{{ t('ai.keyHintB') }}
      </p>
      <div class="ai-key-row">
        <input id="ai-key" v-model="keyInput" type="password" class="input input--mono" placeholder="sk-ant-…" autocomplete="off" spellcheck="false" />
        <button type="submit" class="text-btn" :disabled="savingKey || (!keyInput && !ai?.ready)">{{ keyInput || !ai?.ready ? t('ai.save') : t('ai.remove') }}</button>
      </div>
      <p v-if="ai?.keySource === 'env'" class="field-hint">{{ t('ai.envKey') }}</p>
      <button v-if="editingKey" type="button" class="ghost-btn" @click="editingKey = false">{{ t('ai.cancel') }}</button>
    </form>

    <p v-else-if="cliBlocked" class="ai-blocked">
      <Icon name="terminal" :size="14" />
      <span v-if="!source.installed">{{ source.detail }}</span>
      <span v-else v-html="tr('ai.signIn', { cmd: source.login })" />
    </p>

    <template v-else>
      <div class="field">
        <label class="field-label" for="ai-prompt">{{ t('ai.describe') }}</label>
        <textarea
          id="ai-prompt"
          v-model="prompt"
          class="input input--area"
          rows="4"
          maxlength="4000"
          :placeholder="t('ai.placeholder')"
          :disabled="streaming"
          @keydown.ctrl.enter="prompt.trim() && !streaming && generate()"
          @keydown.meta.enter="prompt.trim() && !streaming && generate()"
        />
      </div>
      <div v-if="!prompt" class="ai-examples">
        <button v-for="ex in examples" :key="ex" type="button" class="ai-example" @click="prompt = ex">{{ ex }}</button>
      </div>

      <div class="ai-options">
        <div class="field">
          <label class="field-label" for="ai-aspect">{{ t('ai.frame') }}</label>
          <select id="ai-aspect" v-model="aspect" class="input" :disabled="revise || streaming">
            <option v-for="a in aspects" :key="a.id" :value="a.id">{{ t(`aspect.${a.id}`) }} · {{ a.width }}×{{ a.height }}</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="ai-length">{{ t('ai.length') }}</label>
          <input id="ai-length" v-model.number="duration" type="number" min="2" max="60" step="1" class="input input--mono" :disabled="revise || streaming" />
        </div>
      </div>
      <label v-if="currentHtml.trim()" class="check">
        <input v-model="revise" type="checkbox" :disabled="streaming" />
        <span>{{ t('ai.revise') }}</span>
      </label>

      <button v-if="!streaming" type="button" class="secondary-btn" :disabled="!prompt.trim() || Boolean(status?.generation)" @click="generate">
        <Icon name="sparkles" :size="16" /> {{ t(revise ? 'ai.reviseWith' : 'ai.generateWith', { source: BUTTON_LABEL[provider] }) }}
      </button>
      <button v-else type="button" class="secondary-btn" @click="stop">
        <Icon name="stop" :size="14" /> {{ t('ai.stop') }}
      </button>
      <p v-if="streaming" class="ai-progress" role="status">
        <span class="state-dot" :data-state="phase === 'calling' ? 'calling' : 'running'" aria-hidden="true" />{{ progressText }}
      </p>
      <pre v-if="streaming && written" class="ai-tail" aria-hidden="true">{{ tail }}</pre>
      <p class="field-hint">{{ modelHint }} {{ t('ai.hintTail') }}</p>
    </template>

    <p v-if="error" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ error }}</p>
  </div>
</template>
