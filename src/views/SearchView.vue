<template>
  <AppLayout :title="t('insights.search')"
    ><section class="card">
      <h1>{{ t('insights.search') }}</h1>
      <form @submit.prevent="submit">
        <label for="global-query">{{ t('insights.query') }}</label><input
          id="global-query"
          v-model="query"
          minlength="2"
          maxlength="100"
          required
        /><label
          ><input v-model="archived" type="checkbox" />{{
            t('insights.archived')
          }}</label
        >
        <p v-if="errors.query" role="alert">{{ t('insights.invalid') }}</p>
        <button :disabled="loading || !online">
          {{ t('insights.search') }}
        </button>
      </form>
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('feed.error') }}</p>
      <p v-if="searched && !loading && !rows.length">
        {{ t('insights.empty') }}
      </p>
      <ul>
        <li v-for="row in rows" :key="row.kind + row.id">
          <RouterLink :to="row.path">{{ row.title }}</RouterLink> ·
          {{ t('insights.' + row.kind) }}
        </li>
      </ul>
      <button v-if="page > 0" :disabled="loading" @click="load(page - 1)">
        {{ t('feed.previous') }}</button><button
        v-if="rows.length === 20"
        :disabled="loading"
        @click="load(page + 1)"
      >
        {{ t('feed.next') }}
      </button>
    </section></AppLayout
  >
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import AppLayout from '@/layouts/AppLayout.vue';
import { search, type SearchResult } from '@/services/modules/reports';
import { storeToRefs } from 'pinia';
import { useConnectivityStore } from '@/stores/app';
const { t } = useI18n(),
  { online } = storeToRefs(useConnectivityStore());
const archived = ref(false),
  rows = ref<SearchResult[]>([]),
  loading = ref(false),
  error = ref(false),
  searched = ref(false),
  page = ref(0);
let criteria = { query: '', archived: false };
const schema = z.string().trim().min(2).max(100);
const { defineField, handleSubmit, errors } = useForm({
  initialValues: { query: '' },
  validationSchema: {
    query: (v: unknown) => schema.safeParse(v).success || t('insights.invalid'),
  },
});
const [query] = defineField('query');
const submit = handleSubmit(async (v) => {
  criteria = { query: v.query.trim(), archived: archived.value };
  await load(0);
});
async function load(next: number) {
  loading.value = true;
  error.value = false;
  try {
    rows.value = await search(criteria.query, criteria.archived, next);
    page.value = next;
    searched.value = true;
  } catch {
    error.value = true;
    rows.value = [];
  } finally {
    loading.value = false;
  }
}
</script>
