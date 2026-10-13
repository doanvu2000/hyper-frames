<script setup>
import { computed } from 'vue';
import Icon from './Icon.vue';
import FieldControl from './FieldControl.vue';
import AiPanel from './AiPanel.vue';
import ImportZone from './ImportZone.vue';
import { t, tr } from '../lib/i18n.js';

const props = defineProps({
  mode: { type: String, default: 'template' },
  template: { type: Object, default: null },
  values: { type: Object, default: () => ({}) },
  aspects: { type: Array, default: () => [] },
  aspect: { type: String, default: '16:9' },
  html: { type: String, default: '' },
  htmlSize: { type: String, default: '' },
  ai: { type: Object, default: null },
  status: { type: Object, default: null },
  renders: { type: Array, default: () => [] },
  projectId: { type: String, default: '' },
  assets: { type: Object, default: null },
});
const emit = defineEmits(['field', 'reset', 'aspect', 'html', 'from-template', 'generated', 'ai-updated', 'imported', 'clear-assets']);

const STYLE_TYPES = new Set(['color', 'select']);
const isStyle = (f) => STYLE_TYPES.has(f.type) || f.id === 'duration';
const contentFields = computed(() => props.template?.fields.filter((f) => !isStyle(f)) ?? []);
const colorFields = computed(() => props.template?.fields.filter((f) => f.type === 'color') ?? []);
const otherStyleFields = computed(() => props.template?.fields.filter((f) => isStyle(f) && f.type !== 'color') ?? []);

const htmlProblem = computed(() => {
  if (props.mode !== 'html' || !props.html.trim()) return '';
  if (!/data-composition-id\s*=/.test(props.html)) return t('inspector.noCompositionId');
  if (!/__timelines/.test(props.html)) return t('inspector.noTimeline');
  return '';
});

</script>

<template>
  <section class="inspector" :aria-label="t('inspector.aria')">
    <template v-if="mode === 'template' && template">
      <div class="inspector-head">
        <h2 class="panel-title">{{ template.name }}</h2>
        <button type="button" class="ghost-btn" @click="emit('reset')">
          <Icon name="reset" :size="14" /> {{ t('inspector.reset') }}
        </button>
      </div>

      <div class="group">
        <div class="segmented" role="radiogroup" :aria-label="t('inspector.frameSize')">
          <button
            v-for="a in aspects"
            :key="a.id"
            type="button"
            role="radio"
            class="segmented-item"
            :aria-checked="a.id === aspect"
            :title="`${a.width}×${a.height}`"
            @click="emit('aspect', a.id)"
          >
            <span class="aspect-glyph" :data-aspect="a.id" aria-hidden="true" />
            {{ t(`aspect.${a.id}`) }}
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
    </template>

    <template v-else>
      <div class="inspector-head">
        <h2 class="panel-title">{{ t('inspector.customHtml') }}</h2>
        <button type="button" class="ghost-btn" @click="emit('from-template')">
          <Icon name="layers" :size="14" /> {{ t('inspector.fromTemplate') }}
        </button>
      </div>
      <AiPanel
        :ai="ai"
        :status="status"
        :renders="renders"
        :aspects="aspects"
        :current-html="html"
        :project-id="projectId"
        @generated="(h, by) => emit('generated', h, by)"
        @ai-updated="(a) => emit('ai-updated', a)"
      />
      <ImportZone :assets="assets" @imported="(p) => emit('imported', p)" @clear-assets="emit('clear-assets')" />

      <div class="group">
        <h3 class="group-title">{{ t('inspector.source') }}</h3>
        <p class="field-hint">
          <span v-html="tr('inspector.sourceHint')" /><span v-if="htmlSize"> {{ t('inspector.now', { size: htmlSize }) }}</span>
        </p>
      </div>
      <div class="field">
        <label class="visually-hidden" for="html-editor">{{ t('inspector.editor') }}</label>
        <textarea
          id="html-editor"
          class="input input--code"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          :value="html"
          @input="emit('html', $event.target.value)"
        />
      </div>
      <p v-if="htmlProblem" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ htmlProblem }}</p>
      <p class="field-hint" v-html="tr('inspector.rules')" />
    </template>
  </section>
</template>
