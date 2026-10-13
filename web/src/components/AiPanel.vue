<script setup>
import { ref, computed } from 'vue';
import Icon from './Icon.vue';
import { api } from '../lib/api.js';

const props = defineProps({
  ai: { type: Object, default: null },
  aspects: { type: Array, default: () => [] },
  currentHtml: { type: String, default: '' },
  projectId: { type: String, default: '' },
});
const emit = defineEmits(['generated', 'ai-updated']);

const EXAMPLES = [
  '5-second intro for a music app called Tempo: purple gradient, logo word bounces in, tagline "Every beat, offline".',
  'Countdown 3, 2, 1 then "Launch day" in big bold type on black, yellow accents.',
  'Three app features appear one by one with simple line icons, clean white background, blue accent.',
];
const aspectLabel = { '16:9': 'Landscape', '9:16': 'Portrait', '1:1': 'Square' };

const prompt = ref('');
const aspect = ref('16:9');
const duration = ref(6);
const revise = ref(false);
const streaming = ref(false);
const written = ref('');
const error = ref('');
const keyInput = ref('');
const editingKey = ref(false);
const savingKey = ref(false);
let controller = null;

const needsKey = computed(() => !props.ai?.ready || editingKey.value);
const tail = computed(() => written.value.split('\n').slice(-5).join('\n'));
const lineCount = computed(() => (written.value ? written.value.split('\n').length : 0));

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
  streaming.value = true;
  controller = new AbortController();
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        prompt: prompt.value,
        aspect: aspect.value,
        duration: duration.value,
        currentHtml: revise.value ? props.currentHtml : undefined,
        projectId: props.projectId || undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Generation failed with status ${res.status}.`);
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
        if (event.type === 'delta') written.value += event.text;
        else if (event.type === 'done') emit('generated', event.html);
        else if (event.type === 'error') throw new Error(event.error);
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') error.value = err.message;
  } finally {
    streaming.value = false;
    controller = null;
  }
}

function stop() {
  controller?.abort();
}

</script>

<template>
  <div class="group ai">
    <div class="ai-head">
      <h3 class="group-title"><Icon name="sparkles" :size="14" /> Generate with AI</h3>
      <button v-if="ai?.ready && !editingKey" type="button" class="ghost-btn" @click="editingKey = true">API key</button>
    </div>

    <form v-if="needsKey" class="ai-key" @submit.prevent="saveKey">
      <label class="field-label" for="ai-key">Anthropic API key</label>
      <p class="field-hint">
        Saved only on this computer in <code>server/data/config.json</code>. Get one at
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>.
      </p>
      <div class="ai-key-row">
        <input id="ai-key" v-model="keyInput" type="password" class="input input--mono" placeholder="sk-ant-…" autocomplete="off" spellcheck="false" />
        <button type="submit" class="text-btn" :disabled="savingKey || (!keyInput && !ai?.ready)">{{ keyInput || !ai?.ready ? 'Save' : 'Remove' }}</button>
      </div>
      <p v-if="ai?.keySource === 'env'" class="field-hint">A key from ANTHROPIC_API_KEY is in use and takes priority.</p>
      <button v-if="editingKey" type="button" class="ghost-btn" @click="editingKey = false">Cancel</button>
    </form>

    <template v-else>
      <div class="field">
        <label class="field-label" for="ai-prompt">Describe the video</label>
        <textarea
          id="ai-prompt"
          v-model="prompt"
          class="input input--area"
          rows="4"
          maxlength="4000"
          placeholder="What it says, the mood, colors, and how things should move."
          :disabled="streaming"
          @keydown.ctrl.enter="prompt.trim() && generate()"
          @keydown.meta.enter="prompt.trim() && generate()"
        />
      </div>
      <div v-if="!prompt" class="ai-examples">
        <button v-for="ex in EXAMPLES" :key="ex" type="button" class="ai-example" @click="prompt = ex">{{ ex }}</button>
      </div>

      <div class="ai-options">
        <div class="field">
          <label class="field-label" for="ai-aspect">Frame</label>
          <select id="ai-aspect" v-model="aspect" class="input" :disabled="revise || streaming">
            <option v-for="a in aspects" :key="a.id" :value="a.id">{{ aspectLabel[a.id] ?? a.id }} · {{ a.width }}×{{ a.height }}</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="ai-length">Length (s)</label>
          <input id="ai-length" v-model.number="duration" type="number" min="2" max="60" step="1" class="input input--mono" :disabled="revise || streaming" />
        </div>
      </div>
      <label v-if="currentHtml.trim()" class="check">
        <input v-model="revise" type="checkbox" :disabled="streaming" />
        <span>Revise the HTML below instead of starting over</span>
      </label>

      <button v-if="!streaming" type="button" class="secondary-btn" :disabled="!prompt.trim()" @click="generate">
        <Icon name="sparkles" :size="16" /> {{ revise ? 'Revise' : 'Generate' }}
      </button>
      <button v-else type="button" class="secondary-btn" @click="stop">
        <Icon name="stop" :size="14" /> Stop · writing line {{ lineCount }}
      </button>
      <pre v-if="streaming && written" class="ai-tail" aria-hidden="true">{{ tail }}</pre>
      <p class="field-hint">Uses {{ ai?.model }}. Usually takes 20–60 seconds. The result replaces the HTML below and stays editable.</p>
    </template>

    <p v-if="error" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ error }}</p>
  </div>
</template>
