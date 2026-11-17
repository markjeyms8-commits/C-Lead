<template>
  <fieldset>
    <legend>{{ t('feed.content') }}</legend>
    <p>{{ t('feed.editorHelp') }}</p>
    <MentionPicker @pick="addMention" />
    <div v-for="(block, index) in model" :key="index" class="rich-block">
      <label :for="`block-type-${index}`">{{
        t('feed.blockType')
      }}</label><select :id="`block-type-${index}`" v-model="block.type">
        <option
          v-for="kind in ['paragraph', 'bullet', 'number']"
          :key="kind"
          :value="kind"
        >
          {{ t(`feed.${kind}`) }}
        </option></select
      ><label :for="`block-text-${index}`">{{
        t('feed.text', { number: index + 1 })
      }}</label
      ><textarea
        :id="`block-text-${index}`"
        v-model="block.text"
        maxlength="2000"
        required
      /><label
        ><input v-model="block.bold" type="checkbox" />{{
          t('feed.bold')
        }}</label
      ><label
        ><input v-model="block.italic" type="checkbox" />{{
          t('feed.italic')
        }}</label
      ><label :for="`block-url-${index}`">{{ t('feed.link') }}</label
      ><input
        :id="`block-url-${index}`"
        :value="block.url"
        type="url"
        @input="setUrl(index, ($event.target as HTMLInputElement).value)"
      /><button type="button" class="secondary" @click="model.splice(index, 1)">
        {{ t('feed.removeBlock') }}
      </button>
    </div>
    <button
      type="button"
      :disabled="model.length >= 50"
      @click="model.push({ type: 'paragraph', text: '' })"
    >
      {{ t('feed.addBlock') }}
    </button>
  </fieldset>
</template>
<script setup lang="ts">
import MentionPicker from './MentionPicker.vue';
import { useI18n } from 'vue-i18n';
import type { RichBlock } from '@/schemas/communication';
const { t } = useI18n();
const model = defineModel<RichBlock[]>({ required: true });
function addMention(value: string) {
  if (!model.value.length) model.value.push({ type: 'paragraph', text: '' });
  model.value[model.value.length - 1]!.text += ' ' + value + ' ';
}
function setUrl(index: number, value: string) {
  const block = model.value[index];
  if (block) {
    if (value.trim()) block.url = value.trim();
    else delete block.url;
  }
}
</script>
<style scoped>
.rich-block {
  padding: 1rem;
  margin-block: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
fieldset {
  min-width: 0;
  border: 1px solid var(--border);
}
</style>
