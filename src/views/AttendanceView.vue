<template>
  <AppLayout :title="t('attendance.title')"
    ><section v-if="route.path === path" class="card">
      <h1>{{ t('attendance.title') }}</h1>
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('feed.error') }}</p>
      <button v-if="error" @click="load">{{ t('account.retry') }}</button>
      <p v-if="success" role="status">{{ t('attendance.saved') }}</p>
      <nav>
        <RouterLink to="/attendance">{{
          t('attendance.history')
        }}</RouterLink><RouterLink v-if="manager" to="/attendance/new">{{
          t('attendance.create')
        }}</RouterLink
        ><RouterLink v-if="manager" to="/attendance/review">{{
          t('attendance.review')
        }}</RouterLink>
      </nav>
      <form v-if="creating && manager" @submit="submit">
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
        ><label :for="uid + 'kind'">{{ t('attendance.kind') }}</label
        ><select :id="uid + 'kind'" v-model="kind">
          <option v-for="k in kinds" :key="k" :value="k">
            {{ t(`attendance.${k}`) }}
          </option></select
        ><template v-if="kind === 'subject'"
          ><label :for="uid + 'subject'">{{ t('groups.subject') }}</label
          ><select :id="uid + 'subject'" v-model="subject">
            <option value="" disabled>{{ t('academic.choose') }}</option>
            <option
              v-for="s in subjects.filter((s) => s.semester_id === term)"
              :key="s.id"
              :value="s.id"
            >
              {{ s.name }}
            </option>
          </select></template
        ><label :for="uid + 'time'">{{ t('attendance.time') }}</label
        ><input :id="uid + 'time'" v-model="time" type="datetime-local" />
        <p>{{ t('feed.timezone') }} {{ t('attendance.window') }}</p>
        <p>{{ t('attendance.initial') }}</p>
        <p v-if="invalid || Object.keys(errors).length" role="alert">
          {{ t('feed.invalid') }}
        </p>
        <button :disabled="isSubmitting || !online">
          {{ t('module.save') }}
        </button>
      </form>
      <template v-else-if="reviewing"
        ><h2>{{ t('attendance.review') }}</h2>
        <p v-if="!loading && !pending.length">
          {{ t('attendance.noCorrections') }}
        </p>
        <article v-for="c in pending" :key="c.id">
          <h3>{{ recordName(c.record_id) }}</h3>
          <p>
            {{ t(`attendance.${c.previous_status}`) }} →
            {{ t(`attendance.${c.requested_status}`) }}
          </p>
          <p>{{ c.reason }}</p>
          <p>{{ dateManila(c.created_at, locale) }}</p>
          <p v-if="oldCorrection(c) && !admin">
            {{ t('attendance.oldApproval') }}
          </p>
          <ReasonForm
            v-else
            :actions="['approved', 'rejected']"
            :disabled="busy || !online"
            @submit="(v) => decide(c.id, v)"
          /></article
      ></template>
      <template v-else-if="current && !loading"
        ><h2>{{ current.title }}</h2>
        <p>
          {{ t(`attendance.${current.kind}`) }} ·
          {{ dateManila(current.occurred_at, locale) }}
        </p>
        <p>{{ t('attendance.window') }}</p>
        <p v-if="!writable">{{ t('feed.readOnly') }}</p>
        <article v-for="r in records" :key="r.id" class="card">
          <h3>{{ name(r.student_id) }}</h3>
          <p>{{ t(`attendance.${r.status}`) }}</p>
          <template v-if="writable"
            ><label :for="uid + r.id">{{ t('attendance.newStatus') }}</label
            ><select :id="uid + r.id" v-model="statuses[r.id]">
              <option v-for="s in statusOptions" :key="s" :value="s">
                {{ t(`attendance.${s}`) }}
              </option></select
            ><ReasonForm
              :actions="[manager ? 'save' : 'request']"
              :disabled="
                busy ||
                !online ||
                statuses[r.id] === r.status ||
                corrections.some(
                  (c) => c.record_id === r.id && c.state === 'pending',
                )
              "
              @submit="(v) => change(r, v.reason)"
          /></template>
          <ul>
            <li
              v-for="c in corrections.filter((c) => c.record_id === r.id)"
              :key="c.id"
            >
              {{ t(`feed.${c.state}`) }}: {{ c.reason
              }}<span v-if="c.decision_reason"> · {{ c.decision_reason }}</span>
            </li>
          </ul>
        </article>
        <ReasonForm
          v-if="manager && writable"
          :actions="['archive']"
          :disabled="busy || !online"
          @submit="archive"
      /></template>
      <template v-else-if="!creating"
        ><label :for="uid + 'filter'">{{ t('attendance.filter') }}</label
        ><input :id="uid + 'filter'" v-model="search" type="search" /><label
          :for="uid + 'kindfilter'"
          >{{ t('attendance.kind') }}</label
        ><select :id="uid + 'kindfilter'" v-model="kindFilter">
          <option value="all">{{ t('feed.all') }}</option>
          <option v-for="k in kinds" :key="k" :value="k">
            {{ t(`attendance.${k}`) }}
          </option>
        </select>
        <p v-if="!loading && !visible.length">{{ t('attendance.empty') }}</p>
        <article v-for="s in visible" :key="s.id">
          <h2>
            <RouterLink :to="`/attendance/sessions/${s.id}`">{{
              s.title
            }}</RouterLink>
          </h2>
          <p>
            {{ t(`attendance.${s.kind}`) }} ·
            {{ dateManila(s.occurred_at, locale) }}
          </p>
        </article></template
      >
    </section></AppLayout
  >
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
import {
  attendanceSchema,
  type AttendanceSession,
  type AttendanceRecord,
  type AttendanceCorrection,
} from '@/schemas/attendance';
import {
  attendanceSessions,
  attendanceRecords,
  attendanceCorrections,
  createAttendance,
  markAttendance,
  requestCorrection,
  reviewCorrection,
} from '@/services/modules/attendance';
import {
  listAcademic,
  type AcademicRecord,
} from '@/services/modules/academics';
import { fetchRoster } from '@/services/modules/foundation';
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
  auth = useAuthStore();
const { online } = storeToRefs(useConnectivityStore());
const path = ref(route.path),
  id = ref(typeof route.params.id === 'string' ? route.params.id : null),
  manager = computed(() =>
    ['president', 'vice_president', 'secretary'].includes(
      auth.profile?.role ?? '',
    ),
  ),
  admin = computed(() =>
    ['president', 'vice_president'].includes(auth.profile?.role ?? ''),
  ),
  creating = computed(() => path.value === '/attendance/new'),
  reviewing = computed(() => path.value === '/attendance/review');
const kinds = ['subject', 'meeting', 'seminar', 'event', 'activity'],
  statusOptions = ['present', 'late', 'absent', 'excused'];
const loading = ref(true),
  error = ref(false),
  success = ref(false),
  busy = ref(false),
  invalid = ref(false),
  sessions = ref<AttendanceSession[]>([]),
  records = ref<AttendanceRecord[]>([]),
  corrections = ref<AttendanceCorrection[]>([]),
  terms = ref<AcademicRecord[]>([]),
  subjects = ref<AcademicRecord[]>([]),
  names = ref<Record<string, string>>({}),
  statuses = ref<Record<string, string>>({}),
  kind = ref('meeting'),
  subject = ref(''),
  time = ref(toManila(new Date().toISOString())),
  search = ref(''),
  kindFilter = ref('all');
const current = computed(() => sessions.value.find((s) => s.id === id.value)),
  writable = computed(
    () =>
      !!current.value &&
      !current.value.archived_at &&
      terms.value.some((s) => s.id === current.value!.semester_id) &&
      (!current.value.subject_id ||
        subjects.value.some((s) => s.id === current.value!.subject_id)),
  ),
  pending = computed(() =>
    corrections.value.filter((c) => c.state === 'pending'),
  ),
  visible = computed(() =>
    sessions.value
      .filter(
        (s) =>
          (kindFilter.value === 'all' || s.kind === kindFilter.value) &&
          s.title.toLowerCase().includes(search.value.toLowerCase()),
      )
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
  );
const name = (id: string) => names.value[id] ?? t('feed.formerMember'),
  recordName = (id: string) =>
    name(records.value.find((r) => r.id === id)?.student_id ?? '');
const oldCorrection = (c: AttendanceCorrection) => {
  const record = records.value.find((r) => r.id === c.record_id),
    session = sessions.value.find((s) => s.id === record?.session_id);
  return (
    !!session && Date.parse(session.occurred_at) < Date.now() - 7 * 86400000
  );
};
const { defineField, errors, handleSubmit, isSubmitting } = useForm<{
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
    sessions.value = await attendanceSessions();
    records.value = await attendanceRecords(id.value ?? undefined);
    corrections.value = await attendanceCorrections();
    names.value = Object.fromEntries(
      (await fetchRoster()).map((p) => [p.id, p.full_name]),
    );
    const years = await listAcademic('academic_years');
    terms.value = (await listAcademic('semesters')).filter(
      (s) =>
        !s.archived_at &&
        years.some((y) => y.id === s.academic_year_id && !y.archived_at),
    );
    subjects.value = (await listAcademic('subjects')).filter(
      (s) =>
        !s.archived_at && terms.value.some((term) => term.id === s.semester_id),
    );
    statuses.value = Object.fromEntries(
      records.value.map((r) => [r.id, r.status]),
    );
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
const submit = handleSubmit(async (v) => {
  error.value = false;
  invalid.value = false;
  try {
    const input = {
      ...v,
      kind: kind.value,
      subject_id: kind.value === 'subject' ? subject.value : null,
      occurred_at: fromManila(time.value),
    };
    if (
      !attendanceSchema.safeParse(input).success ||
      !input.occurred_at ||
      Date.parse(input.occurred_at) > Date.now() ||
      Date.parse(input.occurred_at) < Date.now() - 7 * 86400000
    ) {
      invalid.value = true;
      return;
    }
    const saved = await createAttendance(input);
    await router.push(`/attendance/sessions/${saved}`);
  } catch {
    error.value = true;
  }
});
async function action(work: () => Promise<unknown>) {
  busy.value = true;
  error.value = false;
  success.value = false;
  try {
    await work();
    await load();
    success.value = !error.value;
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
async function change(r: AttendanceRecord, reason: string) {
  await action(() =>
    manager.value
      ? markAttendance(r.id, statuses.value[r.id]!, reason)
      : requestCorrection(r.id, statuses.value[r.id]!, reason),
  );
}
async function decide(id: string, v: { action: string; reason: string }) {
  await action(() => reviewCorrection(id, v.action, v.reason));
}
async function archive(v: { reason: string }) {
  const a = await alertController.create({
    header: t('academic.archive'),
    message: t('attendance.archiveConfirm'),
    buttons: [
      { text: t('academic.cancel'), role: 'cancel' },
      { text: t('feed.confirm'), role: 'confirm' },
    ],
  });
  await a.present();
  if ((await a.onDidDismiss()).role === 'confirm')
    await action(() =>
      rpc('archive_attendance', {
        target_session: id.value,
        archive_reason: v.reason,
      }),
    );
}
onIonViewWillEnter(() => {
  void load();
});
</script>
<style scoped>
nav {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
article {
  margin-block: 1rem;
}
</style>
