<template>
  <fieldset>
    <legend>{{ t('account.notificationChoices') }}</legend>
    <p>{{ t('account.securityAlways') }}</p>
    <label
      v-for="category in notificationCategories"
      :key="category"
      class="checkbox-label"
      ><input
        type="checkbox"
        :checked="modelValue[category]"
        @change="update(category, $event)"
      /><span>{{ t(`notificationCategories.${category}`) }}</span></label
    >
  </fieldset>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import {
  notificationCategories,
  type NotificationCategory,
  type NotificationChoices,
} from '@/constants/notifications';
const props = defineProps<{ modelValue: NotificationChoices }>();
const emit = defineEmits<{
  'update:modelValue': [value: NotificationChoices];
}>();
const { t } = useI18n();
function update(category: NotificationCategory, event: Event) {
  emit('update:modelValue', {
    ...props.modelValue,
    [category]: (event.target as HTMLInputElement).checked,
  });
}
</script>
