<template>
  <details class="mention-picker">
    <summary>{{ t('feed.mentionPerson') }}</summary>
    <div class="mention-picker-content">
      <label :for="id">{{ t('feed.chooseMention') }}</label>
      <select :id="id" v-model="chosen" :disabled="loading" @change="pick">
        <option value="">{{ t('feed.chooseMention') }}</option>
        <optgroup :label="t('members.students')">
          <option
            v-for="person in choices.people"
            :key="person.id"
            :value="'@' + person.username"
          >
            {{ person.full_name }} (@{{ person.username }})
          </option>
        </optgroup>
        <optgroup :label="t('feed.groups')">
          <option
            v-for="group in choices.groups"
            :key="group.id"
            :value="'@group:' + group.mention_handle"
          >
            {{ group.name }}
          </option>
        </optgroup>
      </select>
    </div>
    <p v-if="error" role="alert">{{ t('feed.mentionError') }}</p>
  </details>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { mentionChoices } from '@/services/modules/communication';
const emit = defineEmits<{ pick: [value: string] }>();
const { t } = useI18n();
const id = crypto.randomUUID();
const chosen = ref(''),
  loading = ref(true),
  error = ref(false),
  choices = ref<Awaited<ReturnType<typeof mentionChoices>>>({
    people: [],
    groups: [],
  });
function pick() {
  if (chosen.value) emit('pick', chosen.value);
  chosen.value = '';
}
onMounted(async () => {
  try {
    choices.value = await mentionChoices();
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
});
</script>
<style scoped>
.mention-picker {
  margin-block: 8px;
}

.mention-picker summary {
  display: flex;
  align-items: center;
  min-height: 44px;
  width: fit-content;
  padding: 8px 10px;
  border-radius: 9px;
  color: var(--primary);
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
}

.mention-picker summary:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}

.mention-picker-content {
  max-width: 480px;
  padding: 4px 10px 10px;
}

.mention-picker-content label {
  margin-top: 8px;
}
</style>
