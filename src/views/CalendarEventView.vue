<template>
  <AppLayout :title="t('calendar.event')"
    ><section v-if="route.path === path" class="card">
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('feed.error') }}</p>
      <button v-if="error" @click="load">
        {{ t('account.retry') }}</button><RouterLink to="/calendar">{{
        t('calendar.title')
      }}</RouterLink>
      <form v-if="editing && !loading" @submit="submit">
        <h1>{{ t('calendar.editor') }}</h1>
        <label :for="uid + 'title'">{{ t('feed.postTitle') }}</label><input
          :id="uid + 'title'"
          v-model="title"
          v-bind="titleAttrs"
          maxlength="160"
        /><label :for="uid + 'term'">{{ t('feed.term') }}</label
        ><select :id="uid + 'term'" v-model="term" v-bind="termAttrs">
          <option value="" disabled>{{ t('academic.choose') }}</option>
          <option v-for="s in terms" :key="s.id" :value="s.id">
            {{ s.name }}
          </option></select
        ><label :for="uid + 'description'">{{ t('tasks.description') }}</label
        ><textarea
          :id="uid + 'description'"
          v-model="description"
          maxlength="5000"
        /><label :for="uid + 'start'">{{ t('calendar.starts') }}</label
        ><input
          :id="uid + 'start'"
          v-model="starts"
          type="datetime-local"
        /><label :for="uid + 'end'">{{ t('calendar.ends') }}</label
        ><input :id="uid + 'end'" v-model="ends" type="datetime-local" />
        <p>{{ t('feed.timezone') }}</p>
        <label :for="uid + 'reason'">{{ t('feed.reason') }}</label><textarea
          :id="uid + 'reason'"
          v-model="reason"
          maxlength="500"
        />
        <p>{{ t('calendar.reason') }}</p>
        <p v-if="invalid || Object.keys(errors).length" role="alert">
          {{ t('feed.invalid') }}
        </p>
        <button :disabled="isSubmitting || !online || !writable">
          {{ t('module.save') }}
        </button>
      </form>
      <template v-else-if="item"
        ><h1>{{ item.title }}</h1>
        <p class="description">{{ item.description }}</p>
        <p>
          {{ dateManila(item.starts_at, locale) }} –
          {{ dateManila(item.ends_at, locale) }}
        </p>
        <p v-if="item.archived_at">{{ t('feed.archived') }}</p>
        <RouterLink v-if="writable" :to="`/calendar/events/${item.id}/edit`">{{
          t('academic.edit')
        }}</RouterLink><ReasonForm
          v-if="writable"
          :actions="['archive']"
          :disabled="busy || !online"
          @submit="archive"
      /></template></section
  ></AppLayout>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { onIonViewWillEnter, alertController } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import AppLayout from '@/layouts/AppLayout.vue';
import ReasonForm from '@/components/feed/ReasonForm.vue';
import { useAuthStore } from '@/stores/auth';
import { useConnectivityStore } from '@/stores/app';
import { eventSchema, type CalendarEvent } from '@/schemas/calendar';
import { calendarEvent, saveEvent } from '@/services/modules/calendar';
import {
  listAcademic,
  type AcademicRecord,
} from '@/services/modules/academics';
import {
  dateManila,
  fromManila,
  toManila,
  rpc,
} from '@/services/modules/communication';
const uid = crypto.randomUUID(),
  { t, locale } = useI18n(),
  route = useRoute(),
  router = useRouter(),
  auth = useAuthStore(),
  path = route.path,
  id = typeof route.params.id === 'string' ? route.params.id : null,
  editing = path.endsWith('/new') || path.endsWith('/edit');
const { online } = storeToRefs(useConnectivityStore());
const loading = ref(true),
  error = ref(false),
  invalid = ref(false),
  busy = ref(false),
  item = ref<CalendarEvent | null>(null),
  terms = ref<AcademicRecord[]>([]),
  description = ref(''),
  starts = ref(''),
  ends = ref(''),
  reason = ref('');
const writable = computed(
  () =>
    ['president', 'vice_president'].includes(auth.profile?.role ?? '') &&
    (!id ||
      (!!item.value &&
        !item.value.archived_at &&
        terms.value.some((s) => s.id === item.value!.semester_id))),
);
const { defineField, errors, handleSubmit, isSubmitting, resetForm } = useForm<{
  title: string;
  semester_id: string;
}>({
  initialValues: { title: '', semester_id: '' },
  validationSchema: {
    title: (v: unknown) =>
      z.string().trim().min(1).max(160).safeParse(v).success || 'invalid',
    semester_id: (v: unknown) => z.uuid().safeParse(v).success || 'invalid',
  },
});
const [title, titleAttrs] = defineField('title'),
  [term, termAttrs] = defineField('semester_id');
async function load() {
  loading.value = true;
  error.value = false;
  try {
    const years = await listAcademic('academic_years');
    terms.value = (await listAcademic('semesters')).filter(
      (s) =>
        !s.archived_at &&
        years.some((y) => y.id === s.academic_year_id && !y.archived_at),
    );
    if (id) item.value = await calendarEvent(id);
    if (editing) {
      resetForm({
        values: {
          title: item.value?.title ?? '',
          semester_id: item.value?.semester_id ?? '',
        },
      });
      description.value = item.value?.description ?? '';
      starts.value = toManila(item.value?.starts_at ?? null);
      ends.value = toManila(item.value?.ends_at ?? null);
      reason.value = '';
    }
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
const submit = handleSubmit(async (v) => {
  invalid.value = false;
  error.value = false;
  try {
    const input = {
      ...v,
      description: description.value,
      starts_at: fromManila(starts.value),
      ends_at: fromManila(ends.value),
      reason: reason.value,
    };
    if (
      !eventSchema.safeParse(input).success ||
      !input.starts_at ||
      Date.parse(input.starts_at) <= Date.now() ||
      (id && reason.value.trim().length < 3)
    ) {
      invalid.value = true;
      return;
    }
    const saved = await saveEvent(id, input);
    await router.push(`/calendar/events/${saved}`);
  } catch {
    error.value = true;
  }
});
async function archive(v: { reason: string }) {
  const a = await alertController.create({
    header: t('academic.archive'),
    buttons: [
      { text: t('academic.cancel'), role: 'cancel' },
      { text: t('feed.confirm'), role: 'confirm' },
    ],
  });
  await a.present();
  if ((await a.onDidDismiss()).role !== 'confirm') return;
  busy.value = true;
  try {
    await rpc('archive_calendar_event', {
      target_event: id,
      archive_reason: v.reason,
    });
    await load();
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
onIonViewWillEnter(load);
</script>
<style scoped>
.description {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
