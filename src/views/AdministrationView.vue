<template>
  <AppLayout :title="t('admin.title')"
    ><section class="card">
      <h1>{{ t('admin.title') }}</h1>
      <RouterLink to="/members">{{ t('members.title') }}</RouterLink> ·
      <RouterLink to="/administration/terms">{{
        t('academic.title')
      }}</RouterLink>
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('admin.error') }}</p>
      <p v-if="success" role="status">{{ t('admin.success') }}</p>
      <button v-if="error" :disabled="busy" @click="load">
        {{ t('account.retry') }}
      </button>
      <form @submit="submit">
        <h2>{{ t(selected ? 'admin.edit' : 'admin.create') }}</h2>
        <label for="official-name">{{ t('admin.fullName') }}</label><input
          id="official-name"
          v-model="fullName"
          v-bind="nameAttrs"
          :aria-invalid="!!errors.full_name"
          aria-describedby="account-validation"
          maxlength="160"
        />
        <label for="official-username">{{ t('auth.username') }}</label><input
          id="official-username"
          v-model="username"
          v-bind="usernameAttrs"
          :aria-invalid="!!errors.username"
          aria-describedby="account-validation"
          maxlength="40"
        />
        <label for="official-number">{{
          t('account.studentNumber')
        }}</label><input
          id="official-number"
          v-model="number"
          v-bind="numberAttrs"
          :aria-invalid="!!errors.student_number"
          aria-describedby="account-validation"
          maxlength="40"
        />
        <p
          v-if="Object.keys(errors).length"
          id="account-validation"
          class="field-error"
        >
          {{ t('admin.invalid') }}
        </p>
        <template v-if="selected"
          ><label for="official-role">{{ t('account.role') }}</label
          ><select
            id="official-role"
            v-model="role"
            :disabled="selected.role === 'president'"
          >
            <option v-if="selected.role === 'president'" value="president">
              {{ t('roles.president') }}
            </option>
            <option v-for="r in editableRoles" :key="r" :value="r">
              {{ t(`roles.${r}`) }}
            </option></select
          ><label
            ><input
              v-model="active"
              type="checkbox"
              :disabled="selected.role === 'president'"
            />{{ t('members.active') }}</label
          >
          <label for="account-reason">{{ t('admin.reason') }}</label><textarea
            id="account-reason"
            v-model="reason"
            required
            minlength="3"
            maxlength="500"
          />
        </template>
        <p>{{ t('admin.passwordHelp') }}</p>
        <button :disabled="blocked || isSubmitting">
          {{ t('module.save') }}</button><button
          type="button"
          class="secondary"
          :disabled="busy"
          @click="clear"
        >
          {{ t('academic.cancel') }}
        </button>
        <button
          v-if="selected && selected.id !== auth.profile?.id"
          type="button"
          :disabled="blocked"
          @click="resetPassword"
        >
          {{ t('admin.reset') }}
        </button>
        <button
          v-if="selected && selected.id !== auth.profile?.id"
          type="button"
          :disabled="blocked"
          @click="revokeSessions"
        >
          {{ t('admin.revoke') }}
        </button>
      </form>
      <section>
        <h2>{{ t('admin.import') }}</h2>
        <p>{{ t('admin.importHelp') }}</p>
        <label for="roster-file">{{ t('admin.file') }}</label><input
          id="roster-file"
          type="file"
          accept=".csv,.xlsx"
          :disabled="blocked"
          @change="parseFile"
        />
        <div v-if="preview.length" class="import-preview">
          <table>
            <caption>
              {{
                t('admin.preview')
              }}
            </caption>
            <thead>
              <tr>
                <th>{{ t('admin.row') }}</th>
                <th>{{ t('admin.fullName') }}</th>
                <th>{{ t('auth.username') }}</th>
                <th>{{ t('account.studentNumber') }}</th>
                <th>{{ t('admin.result') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in preview" :key="row.operation_id">
                <td>{{ row.row }}</td>
                <td>{{ row.input.full_name }}</td>
                <td>{{ row.input.username }}</td>
                <td>{{ row.input.student_number }}</td>
                <td>
                  {{ t(`admin.${row.status}`)
                  }}<span v-for="issue in row.errors" :key="issue">
                    · {{ t(`admin.${issue}`) }}</span
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="preview.length" role="status">
          {{
            t('admin.counts', {
              created: preview.filter((r) => r.status === 'created').length,
              total: preview.length,
            })
          }}
        </p>
        <button
          v-if="
            preview.some((r) => r.status === 'ready' || r.status === 'failed')
          "
          :disabled="blocked"
          @click="runImport"
        >
          {{ t('admin.importValid') }}</button><button
          v-if="preview.length"
          class="secondary"
          :disabled="busy"
          @click="downloadResults"
        >
          {{ t('admin.download') }}
        </button>
      </section>
      <section v-if="pending.length">
        <h2>{{ t('admin.pending') }}</h2>
        <p>{{ t('admin.pendingHelp') }}</p>
        <ul>
          <li v-for="row in pending" :key="row.operation_id">
            {{ row.full_name }} (@{{ row.username }})
            <button :disabled="blocked" @click="resume(row)">
              {{ t('account.retry') }}
            </button>
          </li>
        </ul>
      </section>
      <label for="admin-search">{{ t('members.search') }}</label><input
        id="admin-search"
        v-model="search"
        type="search"
      />
      <p v-if="!loading && !filtered.length">{{ t('members.empty') }}</p>
      <ul>
        <li v-for="row in filtered" :key="row.id">
          <InitialsAvatar :name="row.full_name" /><strong>{{
            row.full_name
          }}</strong>
          <p>
            @{{ row.username }} · {{ t(`roles.${row.role}`) }} ·
            {{ t(row.active ? 'members.active' : 'members.inactive') }}
          </p>
          <button :disabled="busy" @click="edit(row)">
            {{ t('academic.edit') }}
          </button>
        </li>
      </ul>
    </section></AppLayout
  >
</template>
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useForm } from 'vee-validate';
import { onIonViewWillEnter, alertController } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import AppLayout from '@/layouts/AppLayout.vue';
import InitialsAvatar from '@/components/common/InitialsAvatar.vue';
import {
  importResultsCsv,
  accountSchema,
  type AccountInput,
  type ImportRow,
} from '@/schemas/accounts';
import {
  memberRoster,
  pendingAccounts,
  createAccount,
  editAccount,
  resetAccount,
  revokeAccountSessions,
  readRosterFile,
} from '@/services/modules/administration';
import type { Member, PendingAccount } from '@/types/administration';
import type { Role } from '@/types/domain';
import { useConnectivityStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
const { t } = useI18n();
const connectivity = useConnectivityStore();
const auth = useAuthStore();
const busy = ref(false),
  loading = ref(true),
  error = ref(false),
  success = ref(false);
const blocked = computed(
  () => busy.value || loading.value || !connectivity.online,
);
const rows = ref<Member[]>([]),
  pending = ref<PendingAccount[]>([]),
  preview = ref<ImportRow[]>([]),
  selected = ref<Member | null>(null),
  operation = ref(crypto.randomUUID()),
  role = ref<Role>('student'),
  active = ref(true),
  reason = ref(''),
  search = ref('');
const editableRoles: Role[] = [
  'vice_president',
  'secretary',
  'treasurer',
  'student',
];
const filtered = computed(() =>
  rows.value.filter((r) =>
    `${r.full_name} ${r.username}`
      .toLowerCase()
      .includes(search.value.toLowerCase()),
  ),
);
const { defineField, errors, handleSubmit, resetForm, isSubmitting } =
  useForm<AccountInput>({
    initialValues: { full_name: '', username: '', student_number: '' },
    validationSchema: {
      full_name: (v: unknown) =>
        accountSchema.shape.full_name.safeParse(v).success || 'invalid',
      username: (v: unknown) =>
        accountSchema.shape.username.safeParse(v).success || 'invalid',
      student_number: (v: unknown) =>
        accountSchema.shape.student_number.safeParse(v).success || 'invalid',
    },
  });
const [fullName, nameAttrs] = defineField('full_name'),
  [username, usernameAttrs] = defineField('username'),
  [number, numberAttrs] = defineField('student_number');
function clear() {
  selected.value = null;
  operation.value = crypto.randomUUID();
  reason.value = '';
  role.value = 'student';
  active.value = true;
  resetForm({ values: { full_name: '', username: '', student_number: '' } });
}
function edit(row: Member) {
  selected.value = row;
  resetForm({
    values: {
      full_name: row.full_name,
      username: row.username,
      student_number: row.student_number,
    },
  });
  role.value = row.role;
  active.value = row.active;
  reason.value = '';
}
async function confirm(message: string) {
  const alert = await alertController.create({
    header: t('admin.confirm'),
    message,
    buttons: [
      { text: t('academic.cancel'), role: 'cancel' },
      { text: t('admin.confirm'), role: 'confirm' },
    ],
  });
  await alert.present();
  return (await alert.onDidDismiss()).role === 'confirm';
}
async function load() {
  loading.value = true;
  error.value = false;
  try {
    rows.value = await memberRoster();
    pending.value = await pendingAccounts();
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
async function action(work: () => Promise<void>) {
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
const submit = handleSubmit(async (values) => {
  if (blocked.value) return;
  if (
    selected.value &&
    !z.string().trim().min(3).max(500).safeParse(reason.value).success
  ) {
    error.value = true;
    return;
  }
  if (
    !(await confirm(
      t(selected.value ? 'admin.editConfirm' : 'admin.createConfirm'),
    ))
  )
    return;
  await action(async () => {
    if (selected.value)
      await editAccount(
        selected.value.id,
        accountSchema.parse(values),
        role.value,
        active.value,
        reason.value,
      );
    else await createAccount(values, operation.value);
    clear();
  });
});
async function resetPassword() {
  if (
    !selected.value ||
    !z.string().trim().min(3).max(500).safeParse(reason.value).success
  ) {
    error.value = true;
    return;
  }
  if (!(await confirm(t('admin.resetConfirm')))) return;
  const id = selected.value.id;
  await action(async () => {
    await resetAccount(id, reason.value);
  });
}
async function revokeSessions() {
  if (
    !selected.value ||
    !z.string().trim().min(3).max(500).safeParse(reason.value).success
  ) {
    error.value = true;
    return;
  }
  if (!(await confirm(t('admin.revokeConfirm')))) return;
  const id = selected.value.id;
  await action(async () => {
    await revokeAccountSessions(id, reason.value);
  });
}
async function parseFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  preview.value = [];
  await action(async () => {
    const existing = await memberRoster();
    preview.value = await readRosterFile(file, existing);
  });
  (event.target as HTMLInputElement).value = '';
}
async function runImport() {
  if (!(await confirm(t('admin.importConfirm')))) return;
  await action(async () => {
    for (const row of preview.value) {
      if (!['ready', 'failed'].includes(row.status)) continue;
      try {
        await createAccount(row.input, row.operation_id);
        row.status = 'created';
      } catch {
        row.status = 'failed';
      }
    }
  });
}
async function resume(row: PendingAccount) {
  await action(async () => {
    await createAccount(row, row.operation_id);
  });
}
function downloadResults() {
  const content = importResultsCsv(preview.value);
  const url = URL.createObjectURL(
    new Blob([content], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'c-lead-import-results.csv';
  a.click();
  URL.revokeObjectURL(url);
}
onIonViewWillEnter(() => {
  clear();
  preview.value = [];
  void load();
});
</script>
<style scoped lang="scss">
.import-preview {
  overflow-x: auto;
}
table {
  border-collapse: collapse;
  width: 100%;
}
th,
td {
  text-align: left;
  padding: 0.75rem;
  border-bottom: 1px solid var(--border);
}
li {
  margin-block: 1rem;
}
</style>
