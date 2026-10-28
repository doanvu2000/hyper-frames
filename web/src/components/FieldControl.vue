<script setup>
import Dropdown from './Dropdown.vue';
import { t } from '../lib/i18n.js';

const props = defineProps({
  field: { type: Object, required: true },
  value: { type: [String, Number], default: '' },
});
const emit = defineEmits(['update']);

const HEX = /^#[0-9a-f]{6}$/i;
const id = `field-${props.field.id}`;
function onHex(e) {
  const v = e.target.value.trim();
  if (HEX.test(v)) emit('update', v.toUpperCase());
  else e.target.value = props.value;
}
</script>

<template>
  <div class="field" :class="`field--${field.type}`">
    <span v-if="field.type === 'select'" class="field-label">{{ field.label }}</span>
    <label v-else class="field-label" :for="id">{{ field.label }}</label>

    <textarea
      v-if="field.type === 'textarea'"
      :id="id"
      class="input input--area"
      :rows="field.id === 'items' ? 4 : 2"
      :maxlength="field.maxLength"
      :value="value"
      @input="emit('update', $event.target.value)"
    />

    <div v-else-if="field.type === 'color'" class="color-row">
      <input :id="id" type="color" class="color-swatch" :value="value" @input="emit('update', $event.target.value.toUpperCase())" />
      <input
        type="text"
        class="input input--mono"
        :aria-label="t('field.hex', { label: field.label })"
        :value="value"
        maxlength="7"
        spellcheck="false"
        @change="onHex"
      />
    </div>

    <Dropdown
      v-else-if="field.type === 'select'"
      :model-value="value"
      :options="field.options"
      :label="field.label"
      trigger-class="dd-trigger dd-trigger--field"
      panel-class="pop--wide"
      @update:model-value="(v) => emit('update', v)"
    />

    <input
      v-else-if="field.type === 'number'"
      :id="id"
      type="number"
      inputmode="decimal"
      class="input input--mono"
      :min="field.min"
      :max="field.max"
      :step="field.step ?? 1"
      :value="value"
      @input="emit('update', $event.target.value)"
    />

    <input
      v-else
      :id="id"
      type="text"
      class="input"
      :maxlength="field.maxLength"
      :value="value"
      @input="emit('update', $event.target.value)"
    />

    <p v-if="field.hint" class="field-hint">{{ field.hint }}</p>
    <p v-else-if="field.id === 'duration'" class="field-hint">{{ t('field.seconds', { min: field.min, max: field.max }) }}</p>
  </div>
</template>
