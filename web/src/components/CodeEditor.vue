<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { html } from '@codemirror/lang-html';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const props = defineProps({
  modelValue: { type: String, default: '' },
  diagnostics: { type: Array, default: () => [] },
  label: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const host = ref(null);
let view = null;

// The editor sits in the dark "well" like the monitor and timeline, so its palette is fixed rather than themed.
const theme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'var(--well)', color: 'var(--well-ink)', fontSize: '12.5px' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
    '.cm-content': { caretColor: 'var(--amber)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--amber)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgb(245 184 61 / 0.22)' },
    '.cm-gutters': { backgroundColor: 'var(--well)', color: '#5b5e66', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgb(255 255 255 / 0.03)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--well-ink)' },
    '.cm-foldPlaceholder': { backgroundColor: 'var(--well-3)', border: 'none', color: 'var(--well-muted)' },
    '.cm-tooltip': { backgroundColor: 'var(--well-2)', border: '1px solid var(--well-line)', color: 'var(--well-ink)' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'rgb(245 184 61 / 0.2)', color: 'var(--well-ink)' },
    '.cm-panels': { backgroundColor: 'var(--well-2)', color: 'var(--well-ink)' },
    '.cm-panels input, .cm-panels button': { fontFamily: 'var(--font-ui)', fontSize: '12px' },
    '.cm-searchMatch': { backgroundColor: 'rgb(245 184 61 / 0.25)' },
    '.cm-searchMatch-selected': { backgroundColor: 'rgb(245 184 61 / 0.5)' },
    '.cm-matchingBracket': { backgroundColor: 'rgb(255 255 255 / 0.1)', outline: 'none' },
    '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy #ff6b5e' },
    '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy #f5b83d' },
    '.cm-diagnostic': { fontFamily: 'var(--font-ui)' },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: [tags.tagName, tags.angleBracket], color: '#ff9e64' },
  { tag: tags.attributeName, color: '#7dcfff' },
  { tag: [tags.attributeValue, tags.string], color: '#9ece6a' },
  { tag: [tags.keyword, tags.bool, tags.null], color: '#bb9af7' },
  { tag: [tags.number, tags.unit], color: '#f5b83d' },
  { tag: [tags.propertyName], color: '#7aa2f7' },
  { tag: tags.comment, color: '#5b5e66', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#e0af68' },
]);

function toDiagnostics(state, list) {
  const out = [];
  for (const d of list) {
    const lineNo = Math.min(Math.max(1, d.line ?? 1), state.doc.lines);
    const line = state.doc.line(lineNo);
    const text = line.text;
    const indent = text.length - text.trimStart().length;
    out.push({ from: line.from + indent, to: line.to, severity: d.severity === 'error' ? 'error' : d.severity === 'info' ? 'info' : 'warning', message: d.message });
  }
  return out;
}

function pushDiagnostics() {
  if (view) view.dispatch(setDiagnostics(view.state, toDiagnostics(view.state, props.diagnostics)));
}

onMounted(() => {
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        html(),
        lintGutter(),
        theme,
        syntaxHighlighting(highlight),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': props.label, spellcheck: 'false' }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) emit('update:modelValue', u.state.doc.toString());
        }),
      ],
    }),
  });
  pushDiagnostics();
});

// Undo, restores and pushes replace the text from outside; keep the cursor where it was when it still fits.
watch(
  () => props.modelValue,
  (next) => {
    if (!view || next === view.state.doc.toString()) return;
    const head = Math.min(view.state.selection.main.head, next.length);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next }, selection: { anchor: head } });
    pushDiagnostics();
  },
);
watch(() => props.diagnostics, pushDiagnostics);

function gotoLine(n) {
  if (!view) return;
  const line = view.state.doc.line(Math.min(Math.max(1, n), view.state.doc.lines));
  view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
  view.focus();
}

onBeforeUnmount(() => view?.destroy());
defineExpose({ gotoLine });
</script>

<template>
  <div ref="host" class="code-editor" />
</template>
