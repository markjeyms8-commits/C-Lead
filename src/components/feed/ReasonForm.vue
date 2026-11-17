<template>
  <form @submit="submit">
    <label :for="id">{{ t('feed.reason') }}</label><textarea
      :id="id"
      v-model="reason"
      v-bind="attrs"
      maxlength="500"
      :aria-invalid="!!errors.reason"
      :aria-describedby="id + '-error'"
    />
    <p :id="id + '-error'" class="field-error">
      {{ errors.reason ? t('feed.reasonInvalid') : '' }}
    </p>
    <button
      v-for="action in actions"
      :key="action"
      :value="action"
      :disabled="disabled"
    >
      {{ t(`feed.${action}`) }}</button><button
      v-if="cancelable"
      type="button"
      class="secondary"
      @click="$emit('cancel')"
    >
      {{ t('academic.cancel') }}
    </button>
  </form>
</template>
<script setup lang="ts">
import { useForm } from 'vee-validate';
import { useI18n } from 'vue-i18n';
import { moderationReason } from '@/schemas/communication';
defineProps<{ actions: string[]; disabled: boolean; cancelable?: boolean }>();
const emit = defineEmits<{
  submit: [value: { action: string; reason: string }];
  cancel: [];
}>();
const { t } = useI18n();
const id = `reason-${crypto.randomUUID()}`;
const { defineField, errors, handleSubmit } = useForm<{ reason: string }>({
  initialValues: { reason: '' },
  validationSchema: {
    reason: (v: unknown) => moderationReason.safeParse(v).success || 'invalid',
  },
});
const [reason, attrs] = defineField('reason');
function submit(event: Event) {
  const action = ((event as SubmitEvent).submitter as HTMLButtonElement)?.value;
  void handleSubmit((values) =>
    emit('submit', { action, reason: values.reason }),
  )(event);
}
</script>
