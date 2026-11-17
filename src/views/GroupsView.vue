<template>
  <AppLayout :title="t('groups.title')"
    ><section v-if="route.path === viewPath" class="card">
      <h1>{{ t('groups.title') }}</h1>
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('feed.error') }}</p>
      <button v-if="error" @click="load">{{ t('account.retry') }}</button>
      <p v-if="success" role="status">{{ t('feed.saved') }}</p>
      <RouterLink v-if="!editing" to="/groups/new">{{
        t('groups.create')
      }}</RouterLink><RouterLink v-else to="/groups">{{
        t('feed.back')
      }}</RouterLink>
      <form v-if="editing && !loading" @submit="submit">
        <label :for="'group-name-' + formId">{{
          t('groups.name')
        }}</label><input
          :id="'group-name-' + formId"
          v-model="name"
          v-bind="nameAttrs"
          :disabled="membershipOnly"
          maxlength="100"
        /><label :for="'group-subject-' + formId">{{
          t('groups.subject')
        }}</label
        ><select
          :id="'group-subject-' + formId"
          v-model="subject"
          v-bind="subjectAttrs"
          :disabled="membershipOnly"
        >
          <option value="" disabled>{{ t('academic.choose') }}</option>
          <option v-for="s in subjects" :key="s.id" :value="s.id">
            {{ s.code }} · {{ s.name }}
          </option>
        </select>
        <fieldset>
          <legend>{{ t('groups.members') }}</legend>
          <label v-for="person in roster" :key="person.id"
            ><input
              v-model="members"
              type="checkbox"
              :value="person.id"
              :disabled="!person.active && !members.includes(person.id)"
            />{{ person.full_name
            }}<span v-if="!person.active">
              · {{ t('admin.inactive') }}</span
            ></label
          >
        </fieldset>
        <label :for="'group-reason-' + formId">{{
          t('feed.reason')
        }}</label><textarea
          :id="'group-reason-' + formId"
          v-model="reason"
          maxlength="500"
        />
        <p>{{ t('groups.reasonHelp') }}</p>
        <p v-if="Object.keys(errors).length || invalid" role="alert">
          {{ t('feed.invalid') }}
        </p>
        <button :disabled="isSubmitting || !online || !mayEdit">
          {{ t('module.save') }}
        </button>
        <p v-if="!mayEdit">{{ t('feed.readOnly') }}</p>
      </form>
      <template v-else
        ><label :for="'group-filter-' + formId">{{ t('feed.view') }}</label
        ><select :id="'group-filter-' + formId" v-model="filter">
          <option value="active">{{ t('feed.active') }}</option>
          <option value="archive">{{ t('feed.archive') }}</option>
          <option value="mine">{{ t('feed.mine') }}</option>
        </select>
        <p v-if="!loading && !visible.length">{{ t('groups.empty') }}</p>
        <article v-for="g in visible" :key="g.id" class="card">
          <h2>
            <RouterLink :to="`/groups/${g.id}`">{{ g.name }}</RouterLink>
          </h2>
          <p>{{ subjectName(g.subject_id) }} · {{ g.mention_handle }}</p>
          <p v-if="g.archived_at">{{ t('feed.archived') }}</p>
          <ul>
            <li v-for="person in groupPeople(g.id)" :key="person.id">
              {{ person.full_name }}
            </li>
          </ul>
          <RouterLink v-if="editable(g)" :to="`/groups/${g.id}/edit`">{{
            t('academic.edit')
          }}</RouterLink>
          <template v-if="admin"
            ><button :disabled="busy || !online" @click="moderating = g.id">
              {{ t('groups.moderate') }}</button
            ><ReasonForm
              v-if="moderating === g.id"
              :actions="['archive', 'removed']"
              :disabled="busy || !online"
              cancelable
              @cancel="moderating = null"
              @submit="(v) => moderate(g.id, v)"
          /></template></article
      ></template></section
  ></AppLayout>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { onIonViewWillEnter, alertController } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import { useForm } from 'vee-validate';
import AppLayout from '@/layouts/AppLayout.vue';
import ReasonForm from '@/components/feed/ReasonForm.vue';
import {
  groupSchema,
  type SubjectGroup,
  type GroupMembership,
} from '@/schemas/groups';
import {
  listGroups,
  listMemberships,
  saveGroup,
  moderateGroup,
} from '@/services/modules/groups';
import {
  listAcademic,
  type AcademicRecord,
} from '@/services/modules/academics';
import { fetchRoster } from '@/services/modules/foundation';
import type { Profile } from '@/types/domain';
import { useAuthStore } from '@/stores/auth';
import { useConnectivityStore } from '@/stores/app';
const formId = crypto.randomUUID();
const { t } = useI18n(),
  route = useRoute(),
  router = useRouter(),
  auth = useAuthStore();
const { online } = storeToRefs(useConnectivityStore());
const rows = ref<SubjectGroup[]>([]),
  memberships = ref<GroupMembership[]>([]),
  subjects = ref<AcademicRecord[]>([]),
  roster = ref<Profile[]>([]),
  filter = ref('active');
const viewPath = ref(route.path),
  viewRecordId = ref(route.params.id);
const loading = ref(true),
  error = ref(false),
  success = ref(false),
  invalid = ref(false),
  busy = ref(false),
  moderating = ref<string | null>(null),
  members = ref<string[]>([]),
  reason = ref('');
const id = computed(() =>
    typeof viewRecordId.value === 'string' ? viewRecordId.value : null,
  ),
  editing = computed(
    () => viewPath.value === '/groups/new' || viewPath.value.endsWith('/edit'),
  );
const admin = computed(() =>
    ['president', 'vice_president'].includes(auth.profile?.role ?? ''),
  ),
  officer = computed(() => admin.value || auth.profile?.role === 'secretary');
const current = computed(() => rows.value.find((g) => g.id === id.value));
const membershipOnly = computed(
  () =>
    !!current.value &&
    current.value.creator_id !== auth.profile?.id &&
    !admin.value,
);
const editable = (g: SubjectGroup) =>
  !g.archived_at &&
  subjects.value.some((s) => s.id === g.subject_id) &&
  (g.creator_id === auth.profile?.id || officer.value);
const mayEdit = computed(
  () => !id.value || (!!current.value && editable(current.value)),
);
const visible = computed(() =>
  rows.value.filter((g) =>
    id.value
      ? g.id === id.value
      : filter.value === 'archive'
        ? !!g.archived_at
        : filter.value === 'mine'
          ? g.creator_id === auth.profile?.id
          : !g.archived_at,
  ),
);
const { defineField, errors, handleSubmit, isSubmitting, resetForm } = useForm<{
  name: string;
  subject_id: string;
}>({
  initialValues: { name: '', subject_id: '' },
  validationSchema: {
    name: (v: unknown) =>
      groupSchema.shape.name.safeParse(v).success || 'invalid',
    subject_id: (v: unknown) =>
      groupSchema.shape.subject_id.safeParse(v).success || 'invalid',
  },
});
const [name, nameAttrs] = defineField('name'),
  [subject, subjectAttrs] = defineField('subject_id');
const subjectName = (id: string) =>
  subjects.value.find((s) => s.id === id)?.name ?? t('feed.archived');
const groupPeople = (id: string) =>
  roster.value.filter((p) =>
    memberships.value.some((m) => m.group_id === id && m.user_id === p.id),
  );
async function load() {
  loading.value = true;
  error.value = false;
  try {
    rows.value = await listGroups();
    memberships.value = await listMemberships();
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
    roster.value = await fetchRoster();
    if (editing.value) {
      resetForm({
        values: {
          name: current.value?.name ?? '',
          subject_id: current.value?.subject_id ?? '',
        },
      });
      members.value = id.value
        ? memberships.value
            .filter((m) => m.group_id === id.value)
            .map((m) => m.user_id)
        : [auth.profile!.id];
      reason.value = '';
    }
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
const submit = handleSubmit(async (values) => {
  invalid.value = false;
  error.value = false;
  try {
    const input = { ...values, members: members.value, reason: reason.value };
    if (
      !groupSchema.safeParse(input).success ||
      (current.value &&
        current.value.creator_id !== auth.profile?.id &&
        reason.value.trim().length < 3)
    ) {
      invalid.value = true;
      return;
    }
    const saved = await saveGroup(id.value, input);
    success.value = true;
    await router.push(`/groups/${saved}`);
    await load();
  } catch {
    error.value = true;
  }
});
async function moderate(id: string, v: { action: string; reason: string }) {
  const dialog = await alertController.create({
    header: t('groups.moderate'),
    message: t('groups.confirm'),
    buttons: [
      { text: t('academic.cancel'), role: 'cancel' },
      { text: t('feed.confirm'), role: 'confirm' },
    ],
  });
  await dialog.present();
  if ((await dialog.onDidDismiss()).role !== 'confirm') return;
  busy.value = true;
  error.value = false;
  try {
    await moderateGroup(
      id,
      v.action === 'removed' ? 'remove' : 'archive',
      v.reason,
    );
    moderating.value = null;
    success.value = true;
    await router.push('/groups');
    await load();
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
onIonViewWillEnter(() => {
  void load();
});
</script>
<style scoped>
fieldset label {
  display: block;
  padding: 0.4rem 0;
}
article {
  margin-block: 1rem;
}
</style>
