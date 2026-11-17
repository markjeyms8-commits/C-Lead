<template>
  <article
    :id="`comment-${comment.id}`"
    class="comment"
    :class="{ reply: !!comment.parent_id }"
  >
    <p>
      <strong>{{ author }}</strong><span v-if="comment.parent_id">
        ·
        <a :href="`#comment-${comment.parent_id}`">{{
          t('feed.inReplyTo')
        }}</a></span
      ><span v-if="comment.edited_at"> · {{ t('feed.edited') }}</span>
    </p>
    <p class="comment-text">
      {{ comment.deleted_at ? t('feed.deletedComment') : comment.body }}
    </p>
    <template v-if="!comment.deleted_at"
      ><ReactionBar
        :items="reactions"
        :disabled="disabled || !!comment.hidden_at"
        @choose="(value) => $emit('react', value)"
      /><button
        v-if="!comment.parent_id"
        :disabled="disabled || !!comment.hidden_at"
        @click="$emit('reply')"
      >
        {{ t('feed.reply') }}</button
      ><button
        v-if="own"
        :disabled="disabled || !!comment.hidden_at"
        @click="$emit('edit')"
      >
        {{ t('academic.edit') }}</button
      ><button v-if="own" :disabled="disabled" @click="$emit('remove')">
        {{ t('feed.delete') }}</button
      ><button :disabled="disabled" @click="$emit('report')">
        {{ t('feed.report') }}
      </button></template
    >
  </article>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import ReactionBar from './ReactionBar.vue';
import type { Comment, Reaction, ReactionName } from '@/types/communication';
defineProps<{
  comment: Comment;
  author: string;
  reactions: Reaction[];
  own: boolean;
  disabled: boolean;
}>();
defineEmits<{
  react: [value: ReactionName | null];
  reply: [];
  edit: [];
  remove: [];
  report: [];
}>();
const { t } = useI18n();
</script>
<style scoped>
.comment {
  border-block-start: 1px solid var(--border);
  padding: 1rem 0;
}
.reply {
  margin-inline-start: 1.25rem;
  border-inline-start: 2px solid var(--border);
  padding-inline-start: 0.75rem;
}
.comment-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
