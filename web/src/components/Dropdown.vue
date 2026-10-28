<script setup>
import { computed } from 'vue';
import Popover from './Popover.vue';
import Icon from './Icon.vue';

const props = defineProps({
  modelValue: { type: [String, Number, Boolean], default: '' },
  options: { type: Array, required: true },
  label: { type: String, required: true },
  icon: { type: String, default: '' },
  triggerClass: { type: [String, Array, Object], default: 'dd-trigger' },
  panelClass: { type: [String, Array, Object], default: '' },
  align: { type: String, default: 'start' },
  placement: { type: String, default: 'down' },
  display: { type: String, default: '' },
  footer: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const selected = computed(() => props.options.find((o) => o.value === props.modelValue));
const rows = computed(() =>
  props.options.map((o, i) => ({ ...o, heading: o.group && o.group !== props.options[i - 1]?.group ? o.group : '', divider: i > 0 && o.group !== props.options[i - 1]?.group })),
);

function pick(option, close) {
  emit('update:modelValue', option.value);
  close(true);
}
</script>

<template>
  <Popover :label="label" role="listbox" :trigger-class="triggerClass" :panel-class="panelClass" :align="align" :placement="placement" :disabled="disabled">
    <template #trigger>
      <Icon v-if="icon" :name="icon" :size="15" />
      <span class="dd-val">{{ display || selected?.short || selected?.label || '' }}</span>
    </template>
    <template #default="{ close }">
      <template v-for="o in rows" :key="String(o.value)">
        <div v-if="o.divider" class="pop-sep" role="presentation" />
        <div v-if="o.heading" class="pop-lbl" role="presentation">{{ o.heading }}</div>
        <button type="button" role="option" class="pop-item" :aria-selected="o.value === modelValue" :disabled="o.disabled" @click="pick(o, close)">
          <Icon name="check" :size="15" class="pop-check" />
          <span class="pop-text">
            {{ o.label }}
            <small v-if="o.hint">{{ o.hint }}</small>
          </span>
          <kbd v-if="o.kbd">{{ o.kbd }}</kbd>
        </button>
      </template>
      <p v-if="footer" class="pop-foot">{{ footer }}</p>
    </template>
  </Popover>
</template>
