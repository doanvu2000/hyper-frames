<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import Icon from './Icon.vue';
import { t } from '../lib/i18n.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  commands: { type: Array, default: () => [] },
});
const emit = defineEmits(['close']);

const query = ref('');
const active = ref(0);
const input = ref(null);
const list = ref(null);

// Folding diacritics lets "xuat" find "Xuất video"; most people type Vietnamese commands without tones.
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

const matches = computed(() => {
  const q = fold(query.value.trim());
  const usable = props.commands.filter((c) => !c.hidden);
  if (!q) return usable;
  const words = q.split(/\s+/);
  return usable.filter((c) => {
    const hay = fold(`${c.label} ${c.group ?? ''} ${c.keywords ?? ''}`);
    return words.every((w) => hay.includes(w));
  });
});
const rows = computed(() => matches.value.map((c, i) => ({ ...c, heading: c.group !== matches.value[i - 1]?.group ? c.group : '' })));

watch(query, () => (active.value = 0));
watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    query.value = '';
    active.value = 0;
    await nextTick();
    input.value?.focus();
  },
);

function run(cmd) {
  if (!cmd || cmd.disabled) return;
  emit('close');
  nextTick(() => cmd.run());
}

async function move(delta) {
  const n = matches.value.length;
  if (!n) return;
  active.value = (active.value + delta + n) % n;
  await nextTick();
  list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

function onKey(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    move(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    move(-1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    run(matches.value[active.value]);
  } else if (e.key === 'Escape') {
    e.stopPropagation();
    emit('close');
  }
}
</script>

<template>
  <div v-if="open" class="scrim" @pointerdown.self="emit('close')" />
  <div v-if="open" class="palette" role="dialog" aria-modal="true" :aria-label="t('palette.aria')" @keydown="onKey">
    <div class="palette-q">
      <Icon name="search" :size="17" />
      <input
        ref="input"
        v-model="query"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        :aria-activedescendant="matches.length ? `cmd-${active}` : undefined"
        :placeholder="t('palette.placeholder')"
        spellcheck="false"
        autocomplete="off"
      />
      <kbd>Esc</kbd>
    </div>
    <ul id="palette-list" ref="list" class="palette-list" role="listbox">
      <template v-for="(c, i) in rows" :key="c.id">
        <li v-if="c.heading" class="palette-grp" role="presentation">{{ c.heading }}</li>
        <li
          :id="`cmd-${i}`"
          role="option"
          class="palette-item"
          :aria-selected="i === active"
          :aria-disabled="c.disabled || undefined"
          @pointermove="active = i"
          @click="run(c)"
        >
          <Icon :name="c.icon ?? 'command'" :size="16" />
          <span class="palette-label">{{ c.label }}</span>
          <span v-if="c.keys" class="palette-keys"><kbd v-for="k in c.keys.split(' ')" :key="k">{{ k }}</kbd></span>
        </li>
      </template>
      <li v-if="!rows.length" class="palette-empty">{{ t('palette.empty') }}</li>
    </ul>
  </div>
</template>
