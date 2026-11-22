<template>
  <article
    :id="`comment-${comment.id}`"
    class="comment"
    :class="{ reply: !!comment.parent_id }"
  >
    <header class="comment-header">
      <InitialsAvatar :name="author" />
      <div class="comment-byline">
        <strong>{{ author }}</strong>
        <span v-if="comment.parent_id" class="comment-context">
          {{ t('feed.inReplyTo') }}
          <a :href="`#comment-${comment.parent_id}`">{{ parentLabel }}</a>
        </span>
        <span v-if="comment.edited_at" class="comment-context">
          · {{ t('feed.edited') }}
        </span>
      </div>
      <button
        v-if="!comment.deleted_at"
        type="button"
        class="comment-more secondary"
        :aria-expanded="actionsOpen"
        :aria-controls="`comment-actions-${comment.id}`"
        @click="actionsOpen = !actionsOpen"
      >
        {{ t('feed.moreActions') }}
      </button>
    </header>

    <p class="comment-text">
      {{ comment.deleted_at ? t('feed.deletedComment') : comment.body }}
    </p>

    <template v-if="!comment.deleted_at">
      <div class="comment-toolbar">
        <ReactionBar
          :items="reactions"
          :disabled="disabled || !!comment.hidden_at"
          @choose="(value) => $emit('react', value)"
        />
        <button
          v-if="!comment.parent_id"
          type="button"
          class="comment-reply secondary"
          :disabled="disabled || !!comment.hidden_at"
          @click="$emit('reply')"
        >
          {{ t('feed.reply') }}
        </button>
      </div>

      <div
        v-show="actionsOpen"
        :id="`comment-actions-${comment.id}`"
        class="comment-menu"
        role="group"
        :aria-label="t('feed.moreActions')"
        @keydown.esc="actionsOpen = false"
      >
        <button
          v-if="own"
          type="button"
          :disabled="disabled || !!comment.hidden_at"
          @click="emitAction('edit')"
        >
          {{ t('academic.edit') }}
        </button>
        <button
          v-if="own"
          type="button"
          class="comment-delete"
          :disabled="disabled"
          @click="emitAction('remove')"
        >
          {{ t('feed.delete') }}
        </button>
        <button
          type="button"
          :disabled="disabled"
          @click="emitAction('report')"
        >
          {{ t('feed.report') }}
        </button>
      </div>
    </template>
  </article>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import InitialsAvatar from '@/components/common/InitialsAvatar.vue';
import ReactionBar from './ReactionBar.vue';
import type { Comment, Reaction, ReactionName } from '@/types/communication';

defineProps<{
  comment: Comment;
  author: string;
  reactions: Reaction[];
  own: boolean;
  disabled: boolean;
  parentLabel?: string;
}>();
const emit = defineEmits<{
  react: [value: ReactionName | null];
  reply: [];
  edit: [];
  remove: [];
  report: [];
}>();
const { t } = useI18n();
const actionsOpen = ref(false);

function emitAction(action: 'edit' | 'remove' | 'report') {
  actionsOpen.value = false;
  if (action === 'edit') emit('edit');
  else if (action === 'remove') emit('remove');
  else emit('report');
}
</script>

<style scoped>
.comment {
  min-width: 0;
  padding: 14px 0;
  border-block-start: 1px solid var(--border);
}

.comment.reply {
  margin-inline-start: clamp(10px, 4vw, 28px);
  padding-inline-start: 12px;
  border-inline-start: 2px solid var(--hero-border);
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.comment-byline {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
}

.comment-byline strong {
  font-size: 0.92rem;
}

.comment-context {
  color: var(--muted);
  font-size: 0.78rem;
}

.comment-more,
.comment-reply {
  min-height: 44px;
  padding: 8px 11px;
  border-radius: 999px;
  font-size: 0.82rem;
  white-space: nowrap;
}

.comment-text {
  margin: 8px 0 10px 46px;
  color: var(--text);
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.comment-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-inline-start: 46px;
}

.comment-menu {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 0 46px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--hero);
}

.comment-menu button {
  min-height: 44px;
  padding: 8px 12px;
  background: transparent;
  color: var(--primary);
  font-size: 0.85rem;
}

.comment-menu .comment-delete {
  color: var(--danger);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 420px) {
  .comment-header {
    align-items: flex-start;
  }

  .comment-more {
    padding-inline: 9px;
    font-size: 0.76rem;
  }

  .comment-text,
  .comment-toolbar,
  .comment-menu {
    margin-inline-start: 0;
  }
}
</style>
