<script setup>
import { computed } from 'vue';
import Icon from './Icon.vue';
import FieldControl from './FieldControl.vue';
import TemplateThumb from './TemplateThumb.vue';
import { t } from '../lib/i18n.js';

const props = defineProps({
  templates: { type: Array, default: () => [] },
  thumbs: { type: Object, default: () => ({}) },
  mode: { type: String, default: 'html' },
  template: { type: Object, default: null },
  values: { type: Object, default: () => ({}) },
  aspects: { type: Array, default: () => [] },
  aspect: { type: String, default: '16:9' },
});
const emit = defineEmits(['select', 'field', 'reset', 'aspect', 'to-html']);

const editing = computed(() => (props.mode === 'template' ? props.template : null));
const isStyle = (f) => f.type === 'color' || f.type === 'select' || f.id === 'duration';
const contentFields = computed(() => editing.value?.fields.filter((f) => !isStyle(f)) ?? []);
const colorFields = computed(() => editing.value?.fields.filter((f) => f.type === 'color') ?? []);
const otherStyleFields = computed(() => editing.value?.fields.filter((f) => isStyle(f) && f.type !== 'color') ?? []);
const posterTime = (tpl) => Math.min(3, tpl.duration - 1);
</script>

<template>
  <div class="tpl-panel">
    <ul class="tpl-grid" :aria-label="t('rail.templates')">
      <li v-for="tpl in templates" :key="tpl.id">
        <button
          type="button"
          class="tpl-card"
          :aria-current="mode === 'template' && tpl.id === template?.id ? 'true' : undefined"
          @click="emit('select', tpl.id)"
        >
          <TemplateThumb :html="thumbs[tpl.id]" :time="posterTime(tpl)" />
          <span class="tpl-name">{{ tpl.name }}</span>
          <span class="tpl-summary">{{ tpl.summary }}</span>
        </button>
      </li>
    </ul>

    <template v-if="editing">
      <div class="group">
        <div class="group-head">
          <h3 class="group-title">{{ editing.name }}</h3>
          <button type="button" class="ghost-btn" @click="emit('reset')"><Icon name="reset" :size="14" /> {{ t('inspector.reset') }}</button>
        </div>
        <div class="aspects" role="radiogroup" :aria-label="t('inspector.frameSize')">
          <button
            v-for="a in aspects"
            :key="a.id"
            type="button"
            role="radio"
            class="aspect-btn"
            :aria-checked="a.id === aspect"
            :title="`${a.width}×${a.height}`"
            @click="emit('aspect', a.id)"
          >
            <span class="aspect-glyph" :data-aspect="a.id" aria-hidden="true" />
            {{ a.id }}
          </button>
        </div>
      </div>
      <div class="group">
        <h3 class="group-title">{{ t('inspector.content') }}</h3>
        <FieldControl v-for="f in contentFields" :key="f.id" :field="f" :value="values[f.id]" @update="(v) => emit('field', f.id, v)" />
      </div>
      <div class="group">
        <h3 class="group-title">{{ t('inspector.style') }}</h3>
        <div class="color-grid">
          <FieldControl v-for="f in colorFields" :key="f.id" :field="f" :value="values[f.id]" @update="(v) => emit('field', f.id, v)" />
        </div>
        <FieldControl v-for="f in otherStyleFields" :key="f.id" :field="f" :value="values[f.id]" @update="(v) => emit('field', f.id, v)" />
      </div>
      <button type="button" class="btn btn--line btn--block" @click="emit('to-html')"><Icon name="code" :size="15" /> {{ t('tpl.toHtml') }}</button>
    </template>
    <p v-else class="field-hint">{{ t('tpl.pickHint') }}</p>
  </div>
</template>
