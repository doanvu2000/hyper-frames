<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import Icon from './Icon.vue';
import { api } from '../lib/api.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  status: { type: Object, default: null },
});
const emit = defineEmits(['close', 'status', 'start']);

const STEPS = ['Connect a CLI', 'Generate in the Studio', 'Or drive it from a terminal'];
const EXAMPLE = 'Use HyperFrames Studio to make a 6-second intro for my app, show it in the Studio, then render an MP4.';

const dialog = ref(null);
const step = ref(0);
const busy = ref('');
const error = ref('');
const copied = ref('');

const clis = computed(() => (props.status?.connections ?? []).filter((c) => c.id !== 'api'));
const anyReady = computed(() => clis.value.some((c) => c.available));

function cliState(conn) {
  if (conn.checked === false) return { key: 'checking', label: 'Checking…' };
  if (!conn.installed) return { key: 'off', label: 'Not installed' };
  if (!conn.available) return { key: 'warn', label: 'Not signed in' };
  return { key: 'ready', label: 'Ready' };
}

watch(
  () => props.open,
  async (open) => {
    await nextTick();
    if (open && !dialog.value?.open) {
      step.value = 0;
      error.value = '';
      dialog.value?.showModal();
    } else if (!open && dialog.value?.open) dialog.value.close();
  },
  { immediate: true },
);

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = text;
    setTimeout(() => copied.value === text && (copied.value = ''), 1500);
  } catch {
    error.value = 'Copy is blocked in this browser. Select the command and copy it by hand.';
  }
}

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

async function addMcp(conn) {
  error.value = '';
  busy.value = conn.id;
  try {
    emit('status', await api(`/connections/${conn.id}/mcp`, { method: 'PUT', body: { connected: true } }));
  } catch (err) {
    error.value = err.message;
  } finally {
    busy.value = '';
  }
}

function finish() {
  emit('start');
  emit('close');
}
</script>

<template>
  <dialog ref="dialog" class="guide" aria-labelledby="guide-title" @close="emit('close')">
    <header class="guide-head">
      <p class="guide-kicker">Getting started · {{ step + 1 }} of {{ STEPS.length }}</p>
      <h2 id="guide-title" class="guide-title">{{ STEPS[step] }}</h2>
      <button type="button" class="icon-btn guide-close" aria-label="Close guide" @click="emit('close')"><Icon name="x" /></button>
    </header>

    <ol class="guide-dots" aria-hidden="true">
      <li v-for="(s, i) in STEPS" :key="s" :data-done="i < step" :data-current="i === step" />
    </ol>

    <section v-if="step === 0" class="guide-body">
      <p>
        The Studio writes videos with the AI you already pay for. It runs <strong>Claude CLI</strong> or
        <strong>Codex CLI</strong> on this computer with your own sign-in, so no API key is needed.
      </p>
      <ul class="guide-clis">
        <li v-for="conn in clis" :key="conn.id" class="guide-cli">
          <div class="guide-cli-head">
            <span class="guide-cli-name">{{ conn.label }}</span>
            <span class="state-pill" :data-state="cliState(conn).key">
              <span class="state-dot" :data-state="cliState(conn).key" aria-hidden="true" />{{ cliState(conn).label }}
            </span>
          </div>
          <template v-if="conn.checked !== false && !conn.available">
            <p class="field-hint">{{ conn.installed ? 'Sign in from a terminal:' : 'Install it from a terminal, then sign in:' }}</p>
            <div v-for="cmd in conn.installed ? [conn.login] : [conn.install, conn.login]" :key="cmd" class="guide-cmd">
              <code>{{ cmd }}</code>
              <button type="button" class="ghost-btn" :aria-label="`Copy ${cmd}`" @click="copy(cmd)">
                <Icon :name="copied === cmd ? 'check' : 'copy'" :size="14" /> {{ copied === cmd ? 'Copied' : 'Copy' }}
              </button>
            </div>
          </template>
          <p v-else-if="conn.available" class="field-hint">{{ conn.detail }}</p>
        </li>
      </ul>
      <p class="field-hint">One of the two is enough. After installing or signing in, press Check again.</p>
      <button type="button" class="ghost-btn" :disabled="busy === 'refresh' || status?.checking" @click="refresh">
        <Icon name="refresh" :size="14" :class="{ spin: busy === 'refresh' || status?.checking }" /> Check again
      </button>
    </section>

    <section v-else-if="step === 1" class="guide-body">
      <ol class="guide-steps">
        <li>Open <strong>AI &amp; custom HTML</strong> at the top of the left panel.</li>
        <li>Under <strong>Model source</strong>, pick <strong>Claude CLI</strong> or <strong>Codex CLI</strong>.</li>
        <li>Describe the video, choose the frame and length, then press <strong>Generate</strong>. It takes 10–60 seconds.</li>
        <li>Check the preview, edit the HTML if you like, then press <strong>Render</strong> on the right.</li>
      </ol>
      <div class="guide-tip">
        <Icon name="upload" :size="16" />
        <p>
          Have your own art? <strong>Import a folder</strong> with images, sounds and an <code>index.html</code> first.
          The AI is told which files are there and uses them in the video.
        </p>
      </div>
    </section>

    <section v-else class="guide-body">
      <p>
        Add the Studio to Claude Code or Codex once. Then any new <code>claude</code> or <code>codex</code> session, in
        any folder, can build a video, show it here and render it.
      </p>
      <ul class="guide-clis">
        <li v-for="conn in clis" :key="conn.id" class="guide-cli guide-cli--row">
          <span class="guide-cli-name">{{ conn.app }}</span>
          <span v-if="conn.mcp?.registered" class="conn-mcp-text"><Icon name="check" :size="14" /> Added</span>
          <button v-else-if="conn.available" type="button" class="text-btn" :disabled="busy === conn.id" @click="addMcp(conn)">
            <Icon :name="busy === conn.id ? 'loader' : 'plug'" :size="14" :class="{ spin: busy === conn.id }" /> Add to {{ conn.app }}
          </button>
          <span v-else class="field-hint">Set up {{ conn.label }} in step 1 first</span>
        </li>
      </ul>
      <p class="field-hint">Then ask in the terminal, for example:</p>
      <div class="guide-cmd guide-cmd--quote">
        <code>{{ EXAMPLE }}</code>
        <button type="button" class="ghost-btn" aria-label="Copy example request" @click="copy(EXAMPLE)">
          <Icon :name="copied === EXAMPLE ? 'check' : 'copy'" :size="14" /> {{ copied === EXAMPLE ? 'Copied' : 'Copy' }}
        </button>
      </div>
      <p class="field-hint">Sessions that were already open need a restart to see the Studio. You can manage this later under AI connections at the top.</p>
    </section>

    <p v-if="error" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ error }}</p>

    <footer class="guide-foot">
      <button v-if="step > 0" type="button" class="ghost-btn" @click="step--"><Icon name="chevron-left" :size="14" /> Back</button>
      <button v-else type="button" class="ghost-btn" @click="emit('close')">Skip</button>
      <span class="guide-foot-hint" v-if="step === 0 && !anyReady && status">You can still continue and set it up later.</span>
      <button v-if="step < STEPS.length - 1" type="button" class="secondary-btn" autofocus @click="step++">
        Next <Icon name="chevron-right" :size="14" />
      </button>
      <button v-else type="button" class="secondary-btn" @click="finish"><Icon name="sparkles" :size="14" /> Start creating</button>
    </footer>
  </dialog>
</template>
