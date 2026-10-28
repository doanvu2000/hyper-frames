<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  label: { type: String, required: true },
  title: { type: String, default: '' },
  role: { type: String, default: 'menu' },
  triggerClass: { type: [String, Array, Object], default: '' },
  panelClass: { type: [String, Array, Object], default: '' },
  align: { type: String, default: 'start' },
  placement: { type: String, default: 'down' },
  chevron: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['open', 'close']);

const open = ref(false);
const root = ref(null);
const trigger = ref(null);
const panel = ref(null);
const ITEMS = '[role="option"]:not([disabled]), [role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled])';

const items = () => [...(panel.value?.querySelectorAll(ITEMS) ?? [])];

async function show(focus = 'selected') {
  open.value = true;
  emit('open');
  await nextTick();
  const list = items();
  const target = focus === 'last' ? list.at(-1) : (panel.value?.querySelector('[aria-selected="true"], [aria-checked="true"]') ?? list[0]);
  (target ?? panel.value?.querySelector('input, textarea, button'))?.focus();
}

function close(refocus = false) {
  if (!open.value) return;
  open.value = false;
  emit('close');
  if (refocus) trigger.value?.focus();
}

const toggle = () => (open.value ? close() : show());

function onTriggerKey(e) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    show(e.key === 'ArrowUp' ? 'last' : 'selected');
  }
}

function onPanelKey(e) {
  const list = items();
  const i = list.indexOf(document.activeElement);
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && list.length && (i !== -1 || !e.target.matches('input, textarea'))) {
    e.preventDefault();
    list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length].focus();
  } else if ((e.key === 'Home' || e.key === 'End') && i !== -1) {
    e.preventDefault();
    list[e.key === 'Home' ? 0 : list.length - 1].focus();
  } else if (e.key === 'Escape') {
    e.stopPropagation();
    close(true);
  } else if (e.key === 'Tab' && props.role !== 'dialog') {
    close();
  }
}

function onDocPointer(e) {
  if (open.value && root.value && !root.value.contains(e.target)) close();
}
onMounted(() => document.addEventListener('pointerdown', onDocPointer));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointer));

defineExpose({ show, close });
</script>

<template>
  <div ref="root" class="dd" :data-align="align" :data-up="placement === 'up' ? '' : undefined">
    <button
      ref="trigger"
      type="button"
      :class="triggerClass"
      :aria-haspopup="role === 'listbox' ? 'listbox' : role === 'dialog' ? 'dialog' : 'menu'"
      :aria-expanded="open"
      :aria-label="label"
      :title="title || undefined"
      :disabled="disabled"
      @click="toggle"
      @keydown="onTriggerKey"
    >
      <slot name="trigger" :open="open" />
      <Icon v-if="chevron" name="chevron-down" :size="14" class="dd-chev" />
    </button>
    <div v-if="open" ref="panel" class="pop" :class="panelClass" :role="role" :aria-label="label" @keydown="onPanelKey">
      <slot :close="close" />
    </div>
  </div>
</template>
