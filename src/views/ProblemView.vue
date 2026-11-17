<template>
  <AppLayout :title="t('problems.title')"
    ><section class="card">
      <h1>{{ t('problems.title') }}</h1>
      <p>{{ t('problems.privacy') }}</p>
      <form @submit.prevent="submit">
        <label for="problem-description">{{
          t('problems.description')
        }}</label><textarea
          id="problem-description"
          v-model="description"
          minlength="10"
          maxlength="2000"
          rows="6"
          required
        />
        <p v-if="errors.description" role="alert">
          {{ t('problems.invalid') }}
        </p>
        <p>{{ t('problems.context') }}: {{ source }} · 0.1.0</p>
        <button :disabled="isSubmitting || !online">
          {{ t('problems.submit') }}
        </button>
      </form>
      <p v-if="success" role="status">{{ t('problems.sent') }}</p>
      <p v-if="error" role="alert">{{ t('problems.error') }}</p>
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <button v-if="error" @click="load">{{ t('account.retry') }}</button>
      <h2>{{ t('problems.history') }}</h2>
      <p v-if="!loading && !rows.length">{{ t('insights.empty') }}</p>
      <article v-for="row in rows" :key="row.id">
        <p class="description">{{ row.description }}</p>
        <p>{{ row.route }} · {{ dateManila(row.created_at, locale) }}</p>
        <p>{{ t(row.resolved_at ? 'problems.resolved' : 'problems.open') }}</p>
        <p v-if="row.resolution">{{ row.resolution }}</p>
        <ReasonForm
          v-if="admin && !row.resolved_at"
          :disabled="busy || !online"
          :actions="['resolve']"
          @submit="(v) => resolve(row.id, v.reason)"
        />
      </article>
      <button
        v-if="page > 0"
        :disabled="loading"
        @click="
          page--;
          load();
        "
      >
        {{ t('feed.previous') }}</button><button
        v-if="rows.length === 20"
        :disabled="loading"
        @click="
          page++;
          load();
        "
      >
        {{ t('feed.next') }}
      </button>
    </section></AppLayout
  >
</template>
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useForm } from 'vee-validate';
import { onIonViewWillEnter } from '@ionic/vue';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { useConnectivityStore } from '@/stores/app';
import { can } from '@/utils/permissions';
import AppLayout from '@/layouts/AppLayout.vue';
import ReasonForm from '@/components/feed/ReasonForm.vue';
import {
  problemSchema,
  problems,
  submitProblem,
  type ProblemReport,
} from '@/services/modules/problems';
import { dateManila, rpc } from '@/services/modules/communication';
const { t, locale } = useI18n(),
  auth = useAuthStore(),
  { online } = storeToRefs(useConnectivityStore()),
  route = useRoute();
const source =
  typeof route.query.from === 'string' &&
  /^\/[a-zA-Z0-9/_-]{0,159}$/.test(route.query.from)
    ? route.query.from
    : '/report-problem';
const admin = computed(() => can(auth.profile?.role, 'audit')),
  rows = ref<ProblemReport[]>([]),
  page = ref(0),
  loading = ref(false),
  busy = ref(false),
  error = ref(false),
  success = ref(false);
const { defineField, handleSubmit, isSubmitting, errors, resetForm } = useForm({
  initialValues: { description: '' },
  validationSchema: {
    description: (v: unknown) =>
      problemSchema.safeParse(v).success || t('problems.invalid'),
  },
});
const [description] = defineField('description');
async function load() {
  loading.value = true;
  error.value = false;
  try {
    rows.value = await problems(page.value);
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
const submit = handleSubmit(async (v) => {
  error.value = false;
  success.value = false;
  try {
    await submitProblem(v.description, source);
    resetForm();
    page.value = 0;
    await load();
    success.value = true;
  } catch {
    error.value = true;
  }
});
async function resolve(id: string, reason: string) {
  busy.value = true;
  try {
    await rpc('resolve_problem', {
      target_report: id,
      resolution_reason: reason,
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
article {
  border-bottom: 1px solid var(--border);
  padding-block: 1rem;
}
</style>
