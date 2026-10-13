<script setup>
import { computed } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  mode: { type: String, default: 'template' },
  template: { type: Object, default: null },
  values: { type: Object, default: () => ({}) },
  aspects: { type: Array, default: () => [] },
  aspect: { type: String, default: '16:9' },
  html: { type: String, default: '' },
  htmlSize: { type: String, default: '' },
});
const emit = defineEmits(['field', 'reset', 'aspect', 'html', 'from-template']);

const HEX = /^#[0-9a-f]{6}$/i;
const htmlProblem = computed(() => {
  if (props.mode !== 'html' || !props.html.trim()) return '';
  if (!/data-composition-id\s*=/.test(props.html)) return 'Add data-composition-id to the root element, or the renderer will not find the composition.';
  if (!/__timelines/.test(props.html)) return 'Register a paused timeline on window.__timelines, or nothing will animate.';
  return '';
});

const fieldId = (id) => `field-${id}`;
function onHex(field, e) {
  const v = e.target.value.trim();
  if (HEX.test(v)) emit('field', field.id, v);
  else e.target.value = props.values[field.id];
}
const aspectLabel = { '16:9': 'Landscape', '9:16': 'Portrait', '1:1': 'Square' };
</script>

<template>
  <section class="inspector" aria-label="Composition settings">
    <template v-if="mode === 'template' && template">
      <div class="inspector-head">
        <h2 class="panel-title">{{ template.name }}</h2>
        <button type="button" class="text-btn" @click="emit('reset')">
          <Icon name="reset" :size="14" /> Reset fields
        </button>
      </div>

      <fieldset class="field">
        <legend class="field-label">Frame</legend>
        <div class="segmented" role="radiogroup" aria-label="Frame">
          <button
            v-for="a in aspects"
            :key="a.id"
            type="button"
            role="radio"
            class="segmented-item"
            :aria-checked="a.id === aspect"
            @click="emit('aspect', a.id)"
          >
            <span class="aspect-glyph" :data-aspect="a.id" aria-hidden="true" />
            <span>{{ aspectLabel[a.id] ?? a.id }}</span>
            <span class="segmented-sub">{{ a.width }}×{{ a.height }}</span>
          </button>
        </div>
      </fieldset>

      <div v-for="f in template.fields" :key="f.id" class="field">
        <label class="field-label" :for="fieldId(f.id)">{{ f.label }}</label>

        <textarea
          v-if="f.type === 'textarea'"
          :id="fieldId(f.id)"
          class="input input--area"
          :rows="f.id === 'items' ? 5 : 3"
          :maxlength="f.maxLength"
          :value="values[f.id]"
          @input="emit('field', f.id, $event.target.value)"
        />

        <div v-else-if="f.type === 'color'" class="color-row">
          <input
            :id="fieldId(f.id)"
            type="color"
            class="color-swatch"
            :value="values[f.id]"
            @input="emit('field', f.id, $event.target.value)"
          />
          <input
            type="text"
            class="input input--mono"
            :aria-label="`${f.label} hex value`"
            :value="values[f.id]"
            maxlength="7"
            spellcheck="false"
            @change="onHex(f, $event)"
          />
        </div>

        <select
          v-else-if="f.type === 'select'"
          :id="fieldId(f.id)"
          class="input"
          :value="values[f.id]"
          @change="emit('field', f.id, $event.target.value)"
        >
          <option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>

        <input
          v-else-if="f.type === 'number'"
          :id="fieldId(f.id)"
          type="number"
          inputmode="decimal"
          class="input input--mono"
          :min="f.min"
          :max="f.max"
          :step="f.step ?? 1"
          :value="values[f.id]"
          @input="emit('field', f.id, $event.target.value)"
        />

        <input
          v-else
          :id="fieldId(f.id)"
          type="text"
          class="input"
          :maxlength="f.maxLength"
          :value="values[f.id]"
          @input="emit('field', f.id, $event.target.value)"
        />

        <p v-if="f.hint" class="field-hint">{{ f.hint }}</p>
        <p v-else-if="f.type === 'number' && f.min !== undefined && f.id === 'duration'" class="field-hint">
          {{ f.min }} to {{ f.max }} seconds.
        </p>
      </div>
    </template>

    <template v-else>
      <div class="inspector-head">
        <h2 class="panel-title"><Icon name="code" :size="16" /> Composition HTML</h2>
        <button type="button" class="text-btn" @click="emit('from-template')">
          <Icon name="layers" :size="14" /> Start from template
        </button>
      </div>
      <p class="field-hint">
        Frame size and length come from the root element's <code>data-width</code>, <code>data-height</code> and
        <code>data-duration</code>.<span v-if="htmlSize"> Now: {{ htmlSize }}.</span>
      </p>
      <label class="field-label" for="html-editor">Source</label>
      <textarea
        id="html-editor"
        class="input input--code"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        :value="html"
        @input="emit('html', $event.target.value)"
      />
      <p v-if="htmlProblem" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ htmlProblem }}</p>
      <p class="field-hint">
        Keep the timeline deterministic: no <code>Math.random()</code>, <code>Date.now()</code> or network calls in
        scripts. Video and audio clips play only in the render, not in this preview.
      </p>
    </template>
  </section>
</template>
