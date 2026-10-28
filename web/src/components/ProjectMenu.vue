<script setup>
import { ref, computed } from 'vue';
import Popover from './Popover.vue';
import Icon from './Icon.vue';
import TemplateThumb from './TemplateThumb.vue';
import { t, locale } from '../lib/i18n.js';

const props = defineProps({
  docs: { type: Array, default: () => [] },
  currentId: { type: String, default: '' },
  name: { type: String, default: '' },
  saveState: { type: String, default: 'saved' },
});
const emit = defineEmits(['open', 'create', 'duplicate', 'rename', 'remove', 'refresh']);

const draft = ref('');
const MAX_SHOWN = 12;
const others = computed(() => props.docs.slice(0, MAX_SHOWN));
const saveText = computed(() => t(`lib.${props.saveState}`));

const when = (iso) => {
  const diff = (Date.now() - new Date(iso)) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
  if (diff < 60) return rtf.format(0, 'second');
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  return rtf.format(-Math.round(diff / 86400), 'day');
};

function onOpen() {
  draft.value = props.name;
  emit('refresh');
}

function commitName() {
  if (draft.value.trim() && draft.value.trim() !== props.name) emit('rename', draft.value.trim());
}

function act(fn, close) {
  close();
  fn();
}
</script>

<template>
  <Popover :label="t('lib.menu')" :title="t('lib.menu')" role="dialog" trigger-class="proj-trigger" panel-class="pop--projects" @open="onOpen">
    <template #trigger>
      <span class="proj-name">{{ name || t('lib.untitled') }}</span>
      <span class="proj-state" :data-state="saveState">{{ saveText }}</span>
    </template>
    <template #default="{ close }">
      <div class="proj-rename">
        <label class="pop-lbl" for="proj-name-input">{{ t('lib.name') }}</label>
        <input
          id="proj-name-input"
          v-model="draft"
          class="input"
          maxlength="80"
          spellcheck="false"
          @change="commitName"
          @keydown.enter.prevent="commitName(), close(true)"
        />
      </div>
      <div class="pop-sep" />
      <div class="pop-lbl">{{ t('lib.recent') }}</div>
      <div class="proj-list" role="menu" :aria-label="t('lib.recent')">
        <button
          v-for="doc in others"
          :key="doc.id"
          type="button"
          role="menuitem"
          class="proj-item"
          :aria-current="doc.id === currentId ? 'true' : undefined"
          @click="act(() => emit('open', doc.id), close)"
        >
          <span class="proj-thumb"><TemplateThumb :html="doc.thumbHtml" :time="2" /></span>
          <span class="pop-text">
            {{ doc.name }}
            <small>{{ doc.aspect }} · {{ t('lib.edited', { when: when(doc.updatedAt) }) }}</small>
          </span>
          <span v-if="doc.id === currentId" class="proj-open">{{ t('lib.openNow') }}</span>
        </button>
        <p v-if="!docs.length" class="pop-foot">{{ t('lib.empty') }}</p>
      </div>
      <div class="pop-sep" />
      <button type="button" role="menuitem" class="pop-item" @click="act(() => emit('create'), close)">
        <Icon name="plus" :size="15" /><span class="pop-text">{{ t('lib.new') }}</span>
      </button>
      <button type="button" role="menuitem" class="pop-item" :disabled="!currentId" @click="act(() => emit('duplicate'), close)">
        <Icon name="copy" :size="15" /><span class="pop-text">{{ t('lib.duplicate') }}</span>
      </button>
      <button type="button" role="menuitem" class="pop-item pop-item--danger" :disabled="!currentId" @click="act(() => emit('remove', currentId), close)">
        <Icon name="trash" :size="15" /><span class="pop-text">{{ t('lib.delete') }}</span>
      </button>
    </template>
  </Popover>
</template>
