<template>
  <div class="reaction-control" role="group" :aria-label="t('feed.reactions')">
    <span v-if="total" class="reaction-total">
      {{ total }} <span class="sr-only">{{ t('feed.reactions') }}</span>
    </span>
    <button
      type="button"
      class="reaction-trigger secondary"
      :class="{ 'has-reaction': !!mine }"
      :aria-expanded="open"
      :aria-controls="optionsId"
      :disabled="disabled"
      @click="open = !open"
    >
      {{ mine ? t(`feed.${mine}`) : t('feed.react') }}
    </button>
    <div
      v-show="open"
      :id="optionsId"
      class="reaction-options"
      role="group"
      :aria-label="t('feed.reactionOptions')"
      @keydown.esc="open = false"
    >
      <button
        v-for="value in values"
        :key="value"
        type="button"
        class="reaction-option"
        :aria-pressed="mine === value"
        :disabled="disabled"
        @click="choose(value)"
      >
        <span>{{ t(`feed.${value}`) }}</span>
        <span class="reaction-option-count">{{ countFor(value) }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import type { Reaction, ReactionName } from '@/types/communication';

const props = defineProps<{ items: Reaction[]; disabled: boolean }>();
const emit = defineEmits<{ choose: [value: ReactionName | null] }>();
const { t } = useI18n();
const auth = useAuthStore();
const open = ref(false);
const optionsId = `reaction-options-${crypto.randomUUID()}`;
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
const total = computed(() => props.items.length);

function countFor(value: ReactionName) {
  return props.items.filter((reaction) => reaction.reaction === value).length;
}

function choose(value: ReactionName) {
  emit('choose', mine.value === value ? null : value);
  open.value = false;
}
</script>

<style scoped>
.reaction-control {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.reaction-total {
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.reaction-trigger {
  min-width: 44px;
  min-height: 44px;
  padding: 8px 12px;
  border-radius: 999px;
}

.reaction-trigger[aria-expanded='true'] {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.reaction-trigger.has-reaction {
  box-shadow: inset 0 0 0 1px var(--primary);
  font-weight: 750;
}

.reaction-options {
  position: absolute;
  z-index: 5;
  inset-block-start: calc(100% + 6px);
  inset-inline-start: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  width: min(320px, calc(100vw - 48px));
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow);
}

.reaction-option {
  justify-content: space-between;
  min-width: 0;
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--text);
  font-size: 0.85rem;
  text-align: start;
}

.reaction-option[aria-pressed='true'] {
  border-color: var(--primary);
  background: var(--mint);
  color: var(--primary);
}

.reaction-option-count {
  color: var(--muted);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
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

@media (prefers-reduced-motion: no-preference) {
  .reaction-option {
    transition:
      background-color 140ms ease,
      border-color 140ms ease;
  }
}
</style>
