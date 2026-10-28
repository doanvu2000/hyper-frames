<script setup>
import { ref, computed, watch } from 'vue';
import Icon from './Icon.vue';
import CodeEditor from './CodeEditor.vue';
import { api } from '../lib/api.js';
import { quickLint, lineForSelector } from '../lib/lintComposition.js';
import { t } from '../lib/i18n.js';

const props = defineProps({
  html: { type: String, default: '' },
  projectId: { type: String, default: '' },
  scriptErrors: { type: Array, default: () => [] },
});
const emit = defineEmits(['html', 'from-template']);

const editor = ref(null);
const checking = ref(false);
const checkError = ref('');
const serverIssues = ref([]);
const checkedHtml = ref('');

const quick = computed(() => quickLint(props.html));
const serverDiagnostics = computed(() =>
  checkedHtml.value === props.html
    ? serverIssues.value.map((i) => ({
        line: lineForSelector(props.html, i.selector),
        severity: i.severity === 'error' ? 'error' : 'warning',
        message: i.fix ? `${i.message} — ${i.fix}` : i.message,
      }))
    : [],
);
const diagnostics = computed(() => [...quick.value, ...serverDiagnostics.value]);
const errorCount = computed(() => diagnostics.value.filter((d) => d.severity === 'error').length + props.scriptErrors.length);
const warnCount = computed(() => diagnostics.value.filter((d) => d.severity !== 'error').length);
const stale = computed(() => checkedHtml.value && checkedHtml.value !== props.html);

watch(
  () => props.html,
  () => (checkError.value = ''),
);

async function runCheck() {
  checking.value = true;
  checkError.value = '';
  const html = props.html;
  try {
    const res = await api('/check', { method: 'POST', body: { html, projectId: props.projectId || undefined } });
    serverIssues.value = res.issues;
    checkedHtml.value = html;
  } catch (err) {
    checkError.value = err.message;
  } finally {
    checking.value = false;
  }
}
</script>

<template>
  <div class="code-panel">
    <div class="code-bar">
      <button type="button" class="btn btn--line btn--sm" :disabled="checking || !html.trim()" @click="runCheck">
        <Icon :name="checking ? 'loader' : 'check'" :size="14" :class="{ spin: checking }" />
        {{ checking ? t('code.checking') : t('code.check') }}
      </button>
      <span class="code-status" role="status">
        <template v-if="errorCount || warnCount">
          <span v-if="errorCount" class="code-count code-count--err">{{ t('code.errors', { n: errorCount }) }}</span>
          <span v-if="warnCount" class="code-count">{{ t('code.warnings', { n: warnCount }) }}</span>
        </template>
        <span v-else-if="checkedHtml === html && html" class="code-count code-count--ok">{{ t('code.clean') }}</span>
        <span v-if="stale" class="code-stale">{{ t('code.stale') }}</span>
      </span>
      <span class="code-grow" />
      <button type="button" class="ghost-btn" @click="emit('from-template')"><Icon name="layers" :size="14" /> {{ t('inspector.fromTemplate') }}</button>
    </div>

    <CodeEditor ref="editor" :model-value="html" :diagnostics="diagnostics" :label="t('inspector.editor')" @update:model-value="(v) => emit('html', v)" />

    <ul v-if="diagnostics.length || scriptErrors.length || checkError" class="code-issues">
      <li v-if="checkError" class="code-issue" data-severity="error"><Icon name="alert" :size="14" /> {{ checkError }}</li>
      <li v-for="(e, i) in scriptErrors" :key="`s${i}`" class="code-issue" data-severity="error">
        <Icon name="alert" :size="14" /><span>{{ t('code.runtime', { message: e }) }}</span>
      </li>
      <li v-for="(d, i) in diagnostics" :key="i" class="code-issue" :data-severity="d.severity">
        <button type="button" class="code-issue-btn" @click="editor?.gotoLine(d.line)">
          <span class="code-line">{{ t('code.line', { n: d.line }) }}</span>
          <span>{{ d.message }}</span>
        </button>
      </li>
    </ul>
    <p class="field-hint code-hint">{{ t('code.keys') }}</p>
  </div>
</template>
