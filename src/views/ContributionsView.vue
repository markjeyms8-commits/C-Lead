<template>
  <AppLayout :title="t('contributions.title')"
    ><section v-if="route.path === path" class="card">
      <h1>{{ t('contributions.title') }}</h1>
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('feed.error') }}</p>
      <button v-if="error" @click="load">{{ t('account.retry') }}</button>
      <p v-if="success" role="status">{{ t('feed.saved') }}</p>
      <nav>
        <RouterLink to="/contributions">{{
          t('contributions.list')
        }}</RouterLink><RouterLink
          v-if="manager && !editing"
          to="/contributions/new"
          >{{ t('contributions.create') }}</RouterLink
        >
      </nav>
      <form v-if="editing && !loading" @submit="submit">
        <label :for="uid + 'title'">{{ t('feed.postTitle') }}</label><input
          :id="uid + 'title'"
          v-model="title"
          v-bind="titleAttrs"
          maxlength="160"
        /><label :for="uid + 'term'">{{ t('feed.term') }}</label
        ><select
          :id="uid + 'term'"
          v-model="term"
          v-bind="termAttrs"
          :disabled="!!id"
        >
          <option value="" disabled>{{ t('academic.choose') }}</option>
          <option v-for="s in terms" :key="s.id" :value="s.id">
            {{ s.name }}
          </option></select
        ><label :for="uid + 'purpose'">{{ t('contributions.purpose') }}</label
        ><textarea
          :id="uid + 'purpose'"
          v-model="purpose"
          v-bind="purposeAttrs"
          maxlength="5000"
        /><label :for="uid + 'amount'">{{ t('contributions.amount') }}</label
        ><input
          :id="uid + 'amount'"
          v-model="amount"
          v-bind="amountAttrs"
          inputmode="decimal"
          :disabled="!!summary?.paid_count"
        />
        <p>{{ t('contributions.amountHelp') }}</p>
        <label :for="uid + 'deadline'">{{ t('tasks.deadline') }}</label><input
          :id="uid + 'deadline'"
          v-model="deadline"
          type="datetime-local"
        />
        <p>{{ t('feed.timezone') }}</p>
        <label :for="uid + 'reason'">{{ t('feed.reason') }}</label><textarea
          :id="uid + 'reason'"
          v-model="reason"
          maxlength="500"
        />
        <p>{{ t('contributions.editReason') }}</p>
        <p v-if="invalid || Object.keys(errors).length" role="alert">
          {{ t('feed.invalid') }}
        </p>
        <button :disabled="isSubmitting || !online || !writable">
          {{ t('module.save') }}
        </button>
      </form>
      <template v-else-if="current && !loading"
        ><h2>{{ current.title }}</h2>
        <p class="purpose">{{ current.purpose }}</p>
        <p>{{ t('contributions.amount') }}: {{ money(current.amount_cent) }}</p>
        <p>
          {{ t('tasks.deadline') }}: {{ dateManila(current.deadline, locale) }}
        </p>
        <p>{{ t(`tasks.${current.status}`) }}</p>
        <RouterLink v-if="writable" :to="`/contributions/${current.id}/edit`">{{
          t('academic.edit')
        }}</RouterLink>
        <section v-if="summary">
          <h3>{{ t('contributions.totals') }}</h3>
          <dl>
            <dt>{{ t('contributions.target') }}</dt>
            <dd>{{ money(summary.target_cent) }}</dd>
            <dt>{{ t('contributions.collected') }}</dt>
            <dd>{{ money(summary.collected_cent) }}</dd>
            <dt>{{ t('contributions.outstanding') }}</dt>
            <dd>{{ money(summary.outstanding_cent) }}</dd>
          </dl>
        </section>
        <p>{{ t('contributions.privacy') }}</p>
        <template v-if="manager"
          ><label :for="uid + 'filter'">{{ t('contributions.status') }}</label
          ><select :id="uid + 'filter'" v-model="filter">
            <option value="all">{{ t('feed.all') }}</option>
            <option value="paid">{{ t('contributions.paid') }}</option>
            <option value="unpaid">
              {{ t('contributions.unpaid') }}
            </option></select
          ><label :for="uid + 'search'">{{ t('contributions.student') }}</label
          ><input :id="uid + 'search'" v-model="search" type="search"
        /></template>
        <p v-if="!visibleRecords.length">{{ t('contributions.noRecords') }}</p>
        <article v-for="r in visibleRecords" :key="r.id" class="card">
          <h3>{{ name(r.student_id) }}</h3>
          <p class="record-status" :class="r.status">
            {{ t(`contributions.${r.status}`) }}
          </p>
          <template v-if="writable"
            ><label :for="uid + r.id">{{ t('contributions.status') }}</label
            ><select :id="uid + r.id" v-model="statuses[r.id]">
              <option value="paid">{{ t('contributions.paid') }}</option>
              <option value="unpaid">
                {{ t('contributions.unpaid') }}
              </option></select
            ><ReasonForm
              :actions="['save']"
              :disabled="busy || !online || statuses[r.id] === r.status"
              @submit="(v) => mark(r, v.reason)"
          /></template>
        </article>
        <template v-if="writable"
          ><h3>{{ t('contributions.reminders') }}</h3>
          <p>{{ t('contributions.reminderHelp') }}</p>
          <p v-if="current.last_reminded_at">
            {{ dateManila(current.last_reminded_at, locale) }}
          </p>
          <ReasonForm
            :actions="['remind']"
            :disabled="busy || !online || cooldown"
            @submit="remind" /><ReasonForm
            :actions="['archive']"
            :disabled="busy || !online"
            @submit="archive" /></template
      ></template>
      <template v-else-if="!editing"
        ><p v-if="!loading && !rows.length">{{ t('contributions.empty') }}</p>
        <article v-for="c in rows" :key="c.id">
          <h2>
            <RouterLink :to="`/contributions/${c.id}`">{{
              c.title
            }}</RouterLink>
          </h2>
          <p>
            {{ money(c.amount_cent) }} · {{ dateManila(c.deadline, locale) }}
          </p>
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
import { ref, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { onIonViewWillEnter, alertController } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import { useForm } from 'vee-validate';
import AppLayout from '@/layouts/AppLayout.vue';
import ReasonForm from '@/components/feed/ReasonForm.vue';
import { useAuthStore } from '@/stores/auth';
import { useConnectivityStore } from '@/stores/app';
import {
  contributionSchema,
  type Contribution,
  type ContributionRecord,
  type ContributionSummary,
} from '@/schemas/contributions';
import {
  listContributions,
  getContribution,
  contributionRecords,
  contributionSummary,
  saveContribution,
  markContribution,
} from '@/services/modules/contributions';
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
  auth = useAuthStore(),
  path = ref(route.path),
  id = ref(typeof route.params.id === 'string' ? route.params.id : null);
const { online } = storeToRefs(useConnectivityStore());
const manager = computed(() =>
    ['president', 'vice_president', 'treasurer'].includes(
      auth.profile?.role ?? '',
    ),
  ),
  editing = computed(
    () => path.value === '/contributions/new' || path.value.endsWith('/edit'),
  );
const loading = ref(true),
  error = ref(false),
  success = ref(false),
  busy = ref(false),
  invalid = ref(false),
  rows = ref<Contribution[]>([]),
  current = ref<Contribution | null>(null),
  records = ref<ContributionRecord[]>([]),
  summary = ref<ContributionSummary | null>(null),
  terms = ref<AcademicRecord[]>([]),
  names = ref<Record<string, string>>({}),
  statuses = ref<Record<string, string>>({}),
  deadline = ref(''),
  reason = ref(''),
  page = ref(0),
  search = ref(''),
  filter = ref('all');
const writable = computed(
    () =>
      manager.value &&
      (!id.value ||
        (!!current.value &&
          current.value.status === 'active' &&
          terms.value.some((s) => s.id === current.value!.semester_id))),
  ),
  cooldown = computed(
    () =>
      !!current.value?.last_reminded_at &&
      Date.parse(current.value.last_reminded_at) > Date.now() - 86400000,
  ),
  visibleRecords = computed(() =>
    records.value.filter(
      (r) =>
        (filter.value === 'all' || r.status === filter.value) &&
        name(r.student_id).toLowerCase().includes(search.value.toLowerCase()),
    ),
  );
const name = (id: string) => names.value[id] ?? t('feed.formerMember'),
  money = (cent: number) =>
    new Intl.NumberFormat(locale.value === 'fil' ? 'fil-PH' : 'en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(cent / 100);
const { defineField, errors, handleSubmit, isSubmitting, resetForm } = useForm<{
  title: string;
  semester_id: string;
  purpose: string;
  amount: string;
}>({
  initialValues: { title: '', semester_id: '', purpose: '', amount: '' },
  validationSchema: Object.fromEntries(
    ['title', 'semester_id', 'purpose', 'amount'].map((key) => [
      key,
      (v: unknown) =>
        contributionSchema.shape[key as 'title'].safeParse(v).success ||
        'invalid',
    ]),
  ),
});
const [title, titleAttrs] = defineField('title'),
  [term, termAttrs] = defineField('semester_id'),
  [purpose, purposeAttrs] = defineField('purpose'),
  [amount, amountAttrs] = defineField('amount');
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
    if (id.value) {
      current.value = await getContribution(id.value);
      records.value = await contributionRecords(id.value);
      summary.value = await contributionSummary(id.value);
      names.value = Object.fromEntries(
        (await fetchRoster()).map((p) => [p.id, p.full_name]),
      );
      statuses.value = Object.fromEntries(
        records.value.map((r) => [r.id, r.status]),
      );
    } else rows.value = await listContributions(page.value);
    if (editing.value) {
      const v = current.value;
      resetForm({
        values: {
          title: v?.title ?? '',
          semester_id: v?.semester_id ?? '',
          purpose: v?.purpose ?? '',
          amount: v ? (v.amount_cent / 100).toFixed(2) : '',
        },
      });
      deadline.value = toManila(v?.deadline ?? null);
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
      deadline: fromManila(deadline.value),
      reason: reason.value,
    };
    if (
      !contributionSchema.safeParse(input).success ||
      !input.deadline ||
      Date.parse(input.deadline) <= Date.now() ||
      (id.value && reason.value.trim().length < 3)
    ) {
      invalid.value = true;
      return;
    }
    const saved = await saveContribution(id.value, input);
    await router.push(`/contributions/${saved}`);
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
async function mark(r: ContributionRecord, reason: string) {
  await action(() => markContribution(r.id, statuses.value[r.id]!, reason));
}
async function remind(v: { reason: string }) {
  await action(() =>
    rpc('remind_contribution', {
      target_contribution: id.value,
      reminder_reason: v.reason,
    }),
  );
}
async function archive(v: { reason: string }) {
  const a = await alertController.create({
    header: t('academic.archive'),
    message: t('contributions.archiveConfirm'),
    buttons: [
      { text: t('academic.cancel'), role: 'cancel' },
      { text: t('feed.confirm'), role: 'confirm' },
    ],
  });
  await a.present();
  if ((await a.onDidDismiss()).role === 'confirm')
    await action(() =>
      rpc('archive_contribution', {
        target_contribution: id.value,
        archive_reason: v.reason,
      }),
    );
}
onIonViewWillEnter(load);
watch(page, load);
</script>
<style scoped>
nav {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
.purpose {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
article {
  margin-block: 1rem;
}
dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}
dd {
  margin: 0;
  text-align: right;
}
</style>
