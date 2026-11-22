<template>
  <AppLayout :title="t('insights.' + kind)"
    ><section v-if="route.path === path" class="card">
      <h1>{{ t('insights.' + kind) }}</h1>
      <p>{{ t('insights.auditNotice') }}</p>
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('feed.error') }}</p>
      <button v-if="error && !loading" @click="load">
        {{ t('account.retry') }}
      </button>
      <form @submit.prevent="submit">
        <fieldset class="report-filters">
          <legend>{{ t('insights.scope') }}</legend>
          <label :for="uid + 'term'">{{ t('insights.term') }}</label>
          <select :id="uid + 'term'" v-model="term">
            <option value="">{{ t('insights.all') }}</option>
            <option v-for="x in terms" :key="x.id" :value="x.id">
              {{ x.name }}
            </option>
          </select>
          <template v-if="kind === 'attendance'">
            <label :for="uid + 'subject'">{{ t('insights.subject') }}</label>
            <select :id="uid + 'subject'" v-model="subject">
              <option value="">{{ t('insights.all') }}</option>
              <option v-for="x in subjects" :key="x.id" :value="x.id">
                {{ x.name }}
              </option>
            </select>
          </template>
          <label :for="uid + 'event'">{{ t('insights.event') }}</label>
          <select :id="uid + 'event'" v-model="event">
            <option value="">{{ t('insights.all') }}</option>
            <option v-for="x in events" :key="x.id" :value="x.id">
              {{ x.title }}
            </option>
          </select>
          <label v-if="kind === 'attendance'" :for="uid + 'student'">
            {{ t('insights.student') }}
            <select :id="uid + 'student'" v-model="student">
              <option value="">{{ t('insights.all') }}</option>
              <option v-for="x in roster" :key="x.id" :value="x.id">
                {{ x.full_name }}
              </option>
            </select>
          </label>
        </fieldset>
        <fieldset class="report-filters report-period">
          <legend>{{ t('insights.period') }}</legend>
          <label :for="uid + 'from'">{{ t('insights.from') }}</label>
          <input :id="uid + 'from'" v-model="from" type="date" />
          <label :for="uid + 'to'">{{ t('insights.to') }}</label>
          <input :id="uid + 'to'" v-model="to" type="date" />
        </fieldset>
        <div class="report-export-options">
          <label :for="uid + 'format'">{{ t('insights.format') }}</label>
          <select :id="uid + 'format'" v-model="format">
            <option value="pdf">PDF</option>
            <option value="xlsx">Excel</option>
          </select>
        </div>
        <p v-if="invalid" role="alert">{{ t('insights.invalid') }}</p>
        <button :disabled="isSubmitting || loading || !online">
          {{ t('insights.export') }}
        </button>
      </form>
      <p v-if="success" role="status">
        {{ t('insights.exported', { count: count }) }}
      </p>
    </section></AppLayout
  >
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { onIonViewWillEnter } from '@ionic/vue';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import AppLayout from '@/layouts/AppLayout.vue';
import { storeToRefs } from 'pinia';
import { useConnectivityStore } from '@/stores/app';
import {
  listAcademic,
  type AcademicRecord,
} from '@/services/modules/academics';
import { fetchRoster } from '@/services/modules/foundation';
import type { Profile } from '@/types/domain';
import {
  report,
  reportEvents,
  reportBlob,
  downloadReport,
} from '@/services/modules/reports';
const route = useRoute(),
  path = route.path,
  kind = path.endsWith('attendance') ? 'attendance' : 'contributions',
  uid = crypto.randomUUID(),
  { t, locale } = useI18n(),
  { online } = storeToRefs(useConnectivityStore());
const terms = ref<AcademicRecord[]>([]),
  subjects = ref<AcademicRecord[]>([]),
  roster = ref<Profile[]>([]),
  events = ref<{ id: string; title: string }[]>([]),
  term = ref(''),
  subject = ref(''),
  event = ref(''),
  student = ref(''),
  from = ref(''),
  to = ref(''),
  format = ref<'pdf' | 'xlsx'>('pdf'),
  loading = ref(false),
  error = ref(false),
  invalid = ref(false),
  success = ref(false),
  count = ref(0);
const { handleSubmit, isSubmitting } = useForm();
async function load() {
  loading.value = true;
  error.value = false;
  try {
    [terms.value, subjects.value, roster.value, events.value] =
      await Promise.all([
        listAcademic('semesters'),
        listAcademic('subjects'),
        fetchRoster(),
        reportEvents(kind),
      ]);
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
const optionalId = z.union([z.literal(''), z.uuid()]);
const schema = z
  .object({
    term: optionalId,
    subject: optionalId,
    event: optionalId,
    student: optionalId,
    from: z.string(),
    to: z.string(),
    format: z.enum(['pdf', 'xlsx']),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to);
const submit = handleSubmit(async () => {
  success.value = false;
  error.value = false;
  invalid.value = !schema.safeParse({
    term: term.value,
    subject: subject.value,
    event: event.value,
    student: student.value,
    from: from.value,
    to: to.value,
    format: format.value,
  }).success;
  if (invalid.value) return;
  try {
    const snapshot = await report(kind, format.value, {
      term_id: term.value || null,
      subject_filter: kind === 'attendance' ? subject.value || null : null,
      event_filter: event.value || null,
      student_filter: kind === 'attendance' ? student.value || null : null,
      date_from: from.value || null,
      date_to: to.value || null,
    });
    const keys = [
      'attendance',
      'contributions',
      'paid',
      'unpaid',
      'collected',
      'required',
      'records',
      'officer',
      'empty',
      'event',
      'student',
      'status',
      'amount_cent',
      'deadline',
      'created_at',
      'updated_at',
      'occurred_at',
      'subject',
      'term',
    ];
    const labels = Object.fromEntries(keys.map((k) => [k, t('insights.' + k)]));
    for (const status of ['present', 'late', 'absent', 'excused'])
      labels[status] = t('attendance.' + status);
    const blob = await reportBlob(snapshot, format.value, labels, locale.value);
    downloadReport(
      blob,
      `C-LEAD-${kind}-${snapshot.generated_at.slice(0, 10)}.${format.value}`,
    );
    count.value = snapshot.rows.length;
    success.value = true;
  } catch {
    error.value = true;
  }
});
onIonViewWillEnter(load);
</script>
