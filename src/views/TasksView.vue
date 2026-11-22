<template>
  <AppLayout :title="t('tasks.title')"
    ><section v-if="route.path === viewPath" class="card">
      <PageHero :title="t('tasks.title')" />
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('feed.error') }}</p>
      <button v-if="error" @click="load">{{ t('account.retry') }}</button>
      <p v-if="success" role="status">{{ t('feed.saved') }}</p>
      <div class="task-actions">
        <RouterLink to="/tasks" class="button secondary">{{
          t('tasks.list')
        }}</RouterLink><RouterLink
          v-if="manager && !editing"
          to="/tasks/new"
          class="button"
          >{{ t('tasks.create') }}</RouterLink
        >
      </div>
      <form v-if="editing && !loading" @submit="submit">
        <label :for="'task-title-' + formId">{{
          t('feed.postTitle')
        }}</label><input
          :id="'task-title-' + formId"
          v-model="title"
          v-bind="titleAttrs"
          maxlength="160"
        /><label :for="'task-description-' + formId">{{
          t('tasks.description')
        }}</label
        ><textarea
          :id="'task-description-' + formId"
          v-model="description"
          maxlength="10000"
        /><label :for="'task-subject-' + formId">{{
          t('groups.subject')
        }}</label
        ><select
          :id="'task-subject-' + formId"
          v-model="subject"
          v-bind="subjectAttrs"
        >
          <option value="" disabled>{{ t('academic.choose') }}</option>
          <option v-for="s in subjects" :key="s.id" :value="s.id">
            {{ s.code }} · {{ s.name }}
          </option></select
        ><label :for="'task-deadline-' + formId">{{
          t('tasks.deadline')
        }}</label
        ><input
          :id="'task-deadline-' + formId"
          v-model="deadline"
          type="datetime-local"
        />
        <p>{{ t('feed.timezone') }}</p>
        <label :for="'task-target-' + formId">{{
          t('tasks.audience')
        }}</label><select :id="'task-target-' + formId" v-model="audience">
          <option
            v-for="value in ['class', 'group', 'individual']"
            :key="value"
            :value="value"
          >
            {{ t(`tasks.${value}`) }}
          </option></select
        ><template v-if="audience === 'group'"
          ><label :for="'task-group-' + formId">{{ t('tasks.group') }}</label
          ><select :id="'task-group-' + formId" v-model="group">
            <option value="" disabled>{{ t('academic.choose') }}</option>
            <option v-for="g in matchingGroups" :key="g.id" :value="g.id">
              {{ g.name }}
            </option>
          </select></template
        ><template v-if="audience === 'individual'"
          ><label :for="'task-person-' + formId">{{
            t('tasks.individual')
          }}</label
          ><select :id="'task-person-' + formId" v-model="person">
            <option value="" disabled>{{ t('academic.choose') }}</option>
            <option v-for="p in roster" :key="p.id" :value="p.id">
              {{ p.full_name }}
            </option>
          </select></template
        >
        <p>{{ t('tasks.snapshot') }}</p>
        <fieldset>
          <legend>{{ t('tasks.reminders') }}</legend>
          <label v-for="minutes in [10080, 1440, 60]" :key="minutes"
            ><input v-model="reminders" type="checkbox" :value="minutes" />{{
              t(`tasks.reminder${minutes}`)
            }}</label
          >
        </fieldset>
        <label :for="'task-reason-' + formId">{{
          t('feed.reason')
        }}</label><textarea
          :id="'task-reason-' + formId"
          v-model="reason"
          maxlength="500"
        />
        <p>{{ t('tasks.reason') }}</p>
        <p v-if="invalid || Object.keys(errors).length" role="alert">
          {{ t('feed.invalid') }}
        </p>
        <button :disabled="isSubmitting || !online || !editable">
          {{ t('module.save') }}
        </button>
        <p v-if="!editable">{{ t('feed.readOnly') }}</p>
      </form>
      <template v-else-if="task"
        ><h2>{{ task.title }}</h2>
        <p class="description">{{ task.description }}</p>
        <p>
          {{ t('tasks.deadline') }}: {{ dateManila(task.deadline, locale) }}
        </p>
        <p>
          {{ t(`tasks.${task.target_type}`) }} · {{ t(`tasks.${task.status}`) }}
        </p>
        <RouterLink v-if="editable" :to="`/tasks/${task.id}/edit`">{{
          t('academic.edit')
        }}</RouterLink><AttachmentsPanel
          :post-id="task.id"
          parent-type="task"
          :editable="editable" />
        <p v-if="mine?.locked || locked">{{ t('tasks.locked') }}</p>
        <button
          v-if="mine"
          :disabled="busy || !online || mine.locked || locked"
          @click="toggle"
        >
          {{
            t(mine.completed ? 'tasks.markIncomplete' : 'tasks.markComplete')
          }}
        </button>
        <ul>
          <li v-for="p in progress" :key="p.student_id">
            {{ p.full_name }}:
            {{
              t(
                p.revoked_at
                  ? 'tasks.unassigned'
                  : p.completed
                    ? 'tasks.complete'
                    : p.overdue || locked
                      ? 'tasks.overdue'
                      : 'tasks.incomplete',
              )
            }}
          </li>
        </ul>
        <ReasonForm
          v-if="editable"
          :actions="['archive']"
          :disabled="busy || !online"
          @submit="archive"
      /></template>
      <template v-else-if="!editing"
        ><label :for="'task-filter-' + formId">{{ t('feed.view') }}</label
        ><select :id="'task-filter-' + formId" v-model="archived">
          <option :value="false">{{ t('feed.active') }}</option>
          <option :value="true">{{ t('feed.archive') }}</option>
        </select>
        <p v-if="!loading && !rows.length">{{ t('tasks.empty') }}</p>
        <article v-for="entry in rows" :key="entry.id" class="task-card">
          <span class="pill task-status">{{ t(`tasks.${entry.status}`) }}</span>
          <h2>
            <RouterLink :to="`/tasks/${entry.id}`">{{
              entry.title
            }}</RouterLink>
          </h2>
          <p class="task-deadline">
            {{ t('tasks.deadline') }}: {{ dateManila(entry.deadline, locale) }}
          </p>
          <span class="pill">{{ t(`tasks.${entry.target_type}`) }}</span>
        </article>
        <button :disabled="page === 0 || loading" @click="page--">
          {{ t('feed.previous') }}</button><button
          :disabled="rows.length < 20 || loading"
          @click="page++"
        >
          {{ t('feed.next') }}
        </button></template
      >
    </section></AppLayout
  >
</template>
<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import {
  onIonViewWillEnter,
  onIonViewDidLeave,
  alertController,
} from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import PageHero from '@/components/common/PageHero.vue';
import AppLayout from '@/layouts/AppLayout.vue';
import ReasonForm from '@/components/feed/ReasonForm.vue';
import AttachmentsPanel from '@/components/feed/AttachmentsPanel.vue';
import { useAuthStore } from '@/stores/auth';
import { useConnectivityStore } from '@/stores/app';
import { taskSchema, type Task, type TaskProgress } from '@/schemas/tasks';
import {
  listTasks,
  getTask,
  taskProgress,
  saveTask,
  completeTask,
} from '@/services/modules/tasks';
import { listGroups } from '@/services/modules/groups';
import type { SubjectGroup } from '@/schemas/groups';
import { fetchRoster } from '@/services/modules/foundation';
import type { Profile } from '@/types/domain';
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
const formId = crypto.randomUUID();
const { t, locale } = useI18n(),
  route = useRoute(),
  router = useRouter(),
  auth = useAuthStore();
const { online } = storeToRefs(useConnectivityStore());
const manager = computed(() =>
  ['president', 'vice_president', 'secretary'].includes(
    auth.profile?.role ?? '',
  ),
);
const editing = computed(
    () => viewPath.value === '/tasks/new' || viewPath.value.endsWith('/edit'),
  ),
  id = computed(() =>
    typeof viewRecordId.value === 'string' ? viewRecordId.value : null,
  );
const viewPath = ref(route.path),
  viewRecordId = ref(route.params.id);
const loading = ref(true),
  error = ref(false),
  success = ref(false),
  busy = ref(false),
  invalid = ref(false),
  rows = ref<Task[]>([]),
  task = ref<Task | null>(null),
  progress = ref<TaskProgress[]>([]),
  subjects = ref<AcademicRecord[]>([]),
  groups = ref<SubjectGroup[]>([]),
  roster = ref<Profile[]>([]),
  page = ref(0),
  archived = ref(false),
  description = ref(''),
  deadline = ref(''),
  audience = ref('class'),
  group = ref(''),
  person = ref(''),
  reminders = ref<number[]>([1440, 60]),
  reason = ref(''),
  now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
const editable = computed(
    () =>
      manager.value &&
      (!id.value ||
        (!!task.value &&
          task.value.status === 'active' &&
          subjects.value.some((s) => s.id === task.value!.subject_id))),
  ),
  locked = computed(
    () => !!task.value && Date.parse(task.value.deadline) <= now.value,
  ),
  mine = computed(() =>
    progress.value.find(
      (p) => p.student_id === auth.profile?.id && !p.revoked_at,
    ),
  );
const { defineField, errors, handleSubmit, isSubmitting, resetForm } = useForm<{
  title: string;
  subject_id: string;
}>({
  initialValues: { title: '', subject_id: '' },
  validationSchema: {
    title: (v: unknown) =>
      z.string().trim().min(1).max(160).safeParse(v).success || 'invalid',
    subject_id: (v: unknown) => z.uuid().safeParse(v).success || 'invalid',
  },
});
const [title, titleAttrs] = defineField('title'),
  [subject, subjectAttrs] = defineField('subject_id');
const matchingGroups = computed(() =>
  groups.value.filter((g) => !g.archived_at && g.subject_id === subject.value),
);
async function load() {
  loading.value = true;
  error.value = false;
  try {
    const years = await listAcademic('academic_years'),
      terms = await listAcademic('semesters');
    subjects.value = (await listAcademic('subjects')).filter(
      (s) =>
        !s.archived_at &&
        terms.some(
          (term) =>
            term.id === s.semester_id &&
            !term.archived_at &&
            years.some((y) => y.id === term.academic_year_id && !y.archived_at),
        ),
    );
    if (id.value) {
      task.value = await getTask(id.value);
      progress.value = await taskProgress(id.value);
    } else {
      task.value = null;
      rows.value = await listTasks(page.value, archived.value);
    }
    if (editing.value) {
      groups.value = await listGroups();
      roster.value = (await fetchRoster()).filter((p) => p.active) as Profile[];
      const v = task.value;
      resetForm({
        values: { title: v?.title ?? '', subject_id: v?.subject_id ?? '' },
      });
      description.value = v?.description ?? '';
      deadline.value = toManila(v?.deadline ?? null);
      audience.value = v?.target_type ?? 'class';
      group.value = v?.target_group_id ?? '';
      person.value = v?.target_user_id ?? '';
      reminders.value = v?.reminder_minutes ?? [1440, 60];
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
      deadline: fromManila(deadline.value),
      target_type: audience.value,
      target_group_id: audience.value === 'group' ? group.value : null,
      target_user_id: audience.value === 'individual' ? person.value : null,
      reminder_minutes: reminders.value,
      reason: reason.value,
    };
    if (
      !taskSchema.safeParse(input).success ||
      !input.deadline ||
      Date.parse(input.deadline) <= Date.now() ||
      (id.value && reason.value.trim().length < 3)
    ) {
      invalid.value = true;
      return;
    }
    const saved = await saveTask(id.value, input);
    await router.push(`/tasks/${saved}`);
    await load();
    success.value = true;
  } catch {
    error.value = true;
  }
});
async function toggle() {
  if (!id.value || !mine.value) return;
  busy.value = true;
  error.value = false;
  try {
    await completeTask(id.value, !mine.value.completed);
    await load();
    success.value = true;
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
async function archive(v: { reason: string }) {
  const a = await alertController.create({
    header: t('academic.archive'),
    message: t('tasks.archiveConfirm'),
    buttons: [
      { text: t('academic.cancel'), role: 'cancel' },
      { text: t('feed.confirm'), role: 'confirm' },
    ],
  });
  await a.present();
  if ((await a.onDidDismiss()).role !== 'confirm') return;
  busy.value = true;
  try {
    await rpc('archive_task', {
      target_task: id.value,
      archive_reason: v.reason,
    });
    await load();
    success.value = true;
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
function stop() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
onIonViewWillEnter(() => {
  void load();
  stop();
  timer = setInterval(() => (now.value = Date.now()), 1000);
});
onIonViewDidLeave(stop);
onUnmounted(stop);

watch([page, archived], load);
</script>
<style scoped>
fieldset label {
  display: block;
  padding: 0.5rem;
}
.description {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
article {
  margin-block: 1rem;
}
</style>
