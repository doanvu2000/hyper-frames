<script setup>
import { t } from '../lib/i18n.js';

const props = defineProps({
  width: { type: Number, required: true },
  min: { type: Number, required: true },
  max: { type: Number, required: true },
  // 'left' resizes the panel to the splitter's left; 'right' the one to its right, so dragging left widens it.
  edge: { type: String, default: 'left' },
  label: { type: String, required: true },
});
const emit = defineEmits(['resize', 'reset']);

const clamp = (w) => Math.round(Math.min(props.max, Math.max(props.min, w)));
const sign = () => (props.edge === 'left' ? 1 : -1);

function onPointerDown(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  const el = e.currentTarget;
  el.setPointerCapture(e.pointerId);
  const startX = e.clientX;
  const startW = props.width;
  // Iframes swallow pointer moves once the cursor crosses them, which would stall the drag.
  document.documentElement.classList.add('is-resizing');
  const move = (ev) => emit('resize', clamp(startW + (ev.clientX - startX) * sign()));
  const up = () => {
    document.documentElement.classList.remove('is-resizing');
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

function onKeydown(e) {
  const step = e.shiftKey ? 48 : 16;
  const keys = { ArrowLeft: -step * sign(), ArrowRight: step * sign(), Home: -Infinity, End: Infinity };
  if (!(e.key in keys)) return;
  e.preventDefault();
  emit('resize', clamp(props.width + keys[e.key]));
}
</script>

<template>
  <div
    class="splitter"
    role="separator"
    aria-orientation="vertical"
    tabindex="0"
    :aria-label="label"
    :aria-valuenow="width"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :title="t('splitter.title', { label })"
    @pointerdown="onPointerDown"
    @keydown="onKeydown"
    @dblclick="emit('reset')"
  />
</template>
