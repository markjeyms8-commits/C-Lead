<template>
  <div class="reaction-bar" role="group" :aria-label="t('feed.reactions')">
    <button
      v-for="value in values"
      :key="value"
      class="secondary"
      :aria-pressed="mine === value"
      :disabled="disabled"
      @click="$emit('choose', mine === value ? null : value)"
    >
      {{ t(`feed.${value}`) }} ({{
        items.filter((r) => r.reaction === value).length
      }})
    </button>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import type { Reaction, ReactionName } from '@/types/communication';
const props = defineProps<{ items: Reaction[]; disabled: boolean }>();
defineEmits<{ choose: [value: ReactionName | null] }>();
const { t } = useI18n();
const auth = useAuthStore();
const values: ReactionName[] = [
  'like',
  'love',
  'laugh',
  'surprised',
  'sad',
  'support',
];
const mine = computed(
  () => props.items.find((r) => r.user_id === auth.profile?.id)?.reaction,
);
</script>
<style scoped>
.reaction-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-block: 0.75rem;
}
.reaction-bar button[aria-pressed='true'] {
  outline: 2px solid var(--primary);
}
</style>
