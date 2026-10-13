<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import Icon from './Icon.vue';
import { api } from '../lib/api.js';
import { t, tr } from '../lib/i18n.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  status: { type: Object, default: null },
});
const emit = defineEmits(['close', 'status', 'start']);

const STEPS = ['guide.step1', 'guide.step2', 'guide.step3'];
const example = computed(() => t('guide.example'));

const dialog = ref(null);
const step = ref(0);
const busy = ref('');
const error = ref('');
const copied = ref('');

const clis = computed(() => (props.status?.connections ?? []).filter((c) => c.id !== 'api'));
const anyReady = computed(() => clis.value.some((c) => c.available));

function cliState(conn) {
  if (conn.checked === false) return { key: 'checking', label: t('guide.checking') };
  if (!conn.installed) return { key: 'off', label: t('guide.notInstalled') };
  if (!conn.available) return { key: 'warn', label: t('guide.notSignedIn') };
  return { key: 'ready', label: t('guide.ready') };
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
    error.value = t('guide.copyBlocked');
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
      <p class="guide-kicker">{{ t('guide.kicker', { n: step + 1, total: STEPS.length }) }}</p>
      <h2 id="guide-title" class="guide-title">{{ t(STEPS[step]) }}</h2>
      <button type="button" class="icon-btn guide-close" :aria-label="t('guide.close')" @click="emit('close')"><Icon name="x" /></button>
    </header>

    <ol class="guide-dots" aria-hidden="true">
      <li v-for="(s, i) in STEPS" :key="s" :data-done="i < step" :data-current="i === step" />
    </ol>

    <section v-if="step === 0" class="guide-body">
      <p v-html="tr('guide.intro')" />
      <ul class="guide-clis">
        <li v-for="conn in clis" :key="conn.id" class="guide-cli">
          <div class="guide-cli-head">
            <span class="guide-cli-name">{{ conn.label }}</span>
            <span class="state-pill" :data-state="cliState(conn).key">
              <span class="state-dot" :data-state="cliState(conn).key" aria-hidden="true" />{{ cliState(conn).label }}
            </span>
          </div>
          <template v-if="conn.checked !== false && !conn.available">
            <p class="field-hint">{{ conn.installed ? t('guide.signInHint') : t('guide.installHint') }}</p>
            <div v-for="cmd in conn.installed ? [conn.login] : [conn.install, conn.login]" :key="cmd" class="guide-cmd">
              <code>{{ cmd }}</code>
              <button type="button" class="ghost-btn" :aria-label="t('guide.copyCmd', { cmd })" @click="copy(cmd)">
                <Icon :name="copied === cmd ? 'check' : 'copy'" :size="14" /> {{ copied === cmd ? t('guide.copied') : t('guide.copy') }}
              </button>
            </div>
          </template>
          <p v-else-if="conn.available" class="field-hint">{{ conn.detail }}</p>
        </li>
      </ul>
      <p class="field-hint">{{ t('guide.oneIsEnough') }}</p>
      <button type="button" class="ghost-btn" :disabled="busy === 'refresh' || status?.checking" @click="refresh">
        <Icon name="refresh" :size="14" :class="{ spin: busy === 'refresh' || status?.checking }" /> {{ t('conn.checkAgain') }}
      </button>
    </section>

    <section v-else-if="step === 1" class="guide-body">
      <ol class="guide-steps">
        <li v-for="key in ['guide.do1', 'guide.do2', 'guide.do3', 'guide.do4']" :key="key" v-html="tr(key)" />
      </ol>
      <div class="guide-tip">
        <Icon name="upload" :size="16" />
        <p v-html="tr('guide.tip')" />
      </div>
    </section>

    <section v-else class="guide-body">
      <p v-html="tr('guide.mcpIntro')" />
      <ul class="guide-clis">
        <li v-for="conn in clis" :key="conn.id" class="guide-cli guide-cli--row">
          <span class="guide-cli-name">{{ conn.app }}</span>
          <span v-if="conn.mcp?.registered" class="conn-mcp-text"><Icon name="check" :size="14" /> {{ t('guide.added') }}</span>
          <button v-else-if="conn.available" type="button" class="text-btn" :disabled="busy === conn.id" @click="addMcp(conn)">
            <Icon :name="busy === conn.id ? 'loader' : 'plug'" :size="14" :class="{ spin: busy === conn.id }" /> {{ t('conn.addTo', { app: conn.app }) }}
          </button>
          <span v-else class="field-hint">{{ t('guide.setupFirst', { label: conn.label }) }}</span>
        </li>
      </ul>
      <p class="field-hint">{{ t('guide.askExample') }}</p>
      <div class="guide-cmd guide-cmd--quote">
        <code>{{ example }}</code>
        <button type="button" class="ghost-btn" :aria-label="t('guide.copyExample')" @click="copy(example)">
          <Icon :name="copied === example ? 'check' : 'copy'" :size="14" /> {{ copied === example ? t('guide.copied') : t('guide.copy') }}
        </button>
      </div>
      <p class="field-hint">{{ t('guide.restart') }}</p>
    </section>

    <p v-if="error" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ error }}</p>

    <footer class="guide-foot">
      <button v-if="step > 0" type="button" class="ghost-btn" @click="step--"><Icon name="chevron-left" :size="14" /> {{ t('guide.back') }}</button>
      <button v-else type="button" class="ghost-btn" @click="emit('close')">{{ t('guide.skip') }}</button>
      <span v-if="step === 0 && !anyReady && status" class="guide-foot-hint">{{ t('guide.later') }}</span>
      <button v-if="step < STEPS.length - 1" type="button" class="secondary-btn" autofocus @click="step++">
        {{ t('guide.next') }} <Icon name="chevron-right" :size="14" />
      </button>
      <button v-else type="button" class="secondary-btn" @click="finish"><Icon name="sparkles" :size="14" /> {{ t('guide.start') }}</button>
    </footer>
  </dialog>
</template>
