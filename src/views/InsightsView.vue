<template>
  <AppLayout
    :title="t('insights.' + (mode === 'audit' ? 'audit' : 'analytics'))"
    ><section class="card">
      <h1>{{ t('insights.' + mode) }}</h1>
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('feed.error') }}</p>
      <button :disabled="loading || !online" @click="load">
        {{ t('account.retry') }}</button><template v-if="mode === 'audit'"
        ><form
          @submit.prevent="
            page = 0;
            load();
          "
        >
          <label for="audit-action">{{ t('insights.action') }}</label><input
            id="audit-action"
            v-model="action"
            maxlength="100"
          /><button :disabled="loading || !online">
            {{ t('insights.filter') }}
          </button>
        </form>
        <p v-if="!loading && !rows.length">{{ t('insights.empty') }}</p>
        <article v-for="row in rows" :key="row.id">
          <h2>{{ row.action }}</h2>
          <p>
            {{ dateManila(row.created_at, locale) }} · {{ row.target_type }} ·
            {{ row.target_id }}
          </p>
          <p>
            {{ t('insights.actor') }}:
            {{ row.actor_id || t('insights.system') }}
          </p>
          <p v-if="row.reason">{{ row.reason }}</p>
          <details>
            <summary>{{ t('insights.metadata') }}</summary>
            <pre>{{ JSON.stringify(row.metadata, null, 2) }}</pre>
          </details>
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
        </button></template
      >
      <dl v-else-if="stats">
        <template v-for="key in scalarKeys" :key="key"
          ><dt>{{ t('insights.' + key) }}</dt>
          <dd>{{ stats[key] }}</dd></template
        >
        <dt>{{ t('insights.attendance') }}</dt>
        <dd>
          <ul>
            <li v-for="(value, key) in stats.attendance" :key="key">
              {{ t('attendance.' + key) }}: {{ value }}
            </li>
          </ul>
        </dd>
        <dt>{{ t('insights.contributions') }}</dt>
        <dd>
          <ul>
            <li v-for="(value, key) in stats.contributions" :key="key">
              {{ t('insights.' + key) }}: {{ money(value) }}
            </li>
          </ul>
        </dd>
      </dl>
    </section></AppLayout
  >
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { onIonViewWillEnter } from '@ionic/vue';
import { storeToRefs } from 'pinia';
import { useConnectivityStore } from '@/stores/app';
import AppLayout from '@/layouts/AppLayout.vue';
import {
  analytics,
  audit,
  type Analytics,
  type AuditRecord,
} from '@/services/modules/reports';
import { dateManila } from '@/services/modules/communication';
const { mode } = defineProps<{ mode: 'audit' | 'analytics' }>(),
  { t, locale } = useI18n(),
  { online } = storeToRefs(useConnectivityStore());
const loading = ref(false),
  error = ref(false),
  rows = ref<AuditRecord[]>([]),
  stats = ref<Analytics | null>(null),
  page = ref(0),
  action = ref('');
const scalarKeys = [
  'active_users',
  'announcement_views',
  'poll_ballots',
  'task_assigned',
  'task_completed',
] as const;
const money = (n: number) =>
  new Intl.NumberFormat(locale.value === 'fil' ? 'fil-PH' : 'en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(n / 100);
async function load() {
  loading.value = true;
  error.value = false;
  try {
    if (mode === 'audit')
      rows.value = await audit(page.value, action.value.trim());
    else stats.value = await analytics();
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(load);
</script>
<style scoped>
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
article {
  border-bottom: 1px solid var(--border);
  padding-block: 1rem;
}
dd {
  margin-bottom: 1rem;
}
</style>
