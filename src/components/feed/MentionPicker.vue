<template>
  <div>
    <label :for="id">{{ t('feed.mentionPerson') }}</label><select
      :id="id"
      v-model="chosen"
      :disabled="loading"
      @change="pick"
    >
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
    <p v-if="error" role="alert">{{ t('feed.mentionError') }}</p>
  </div>
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
