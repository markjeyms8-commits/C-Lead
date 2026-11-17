<template>
  <AppLayout :title="t('feed.moderation')"
    ><section class="card">
      <h1>{{ t('feed.moderation') }}</h1>
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('feed.error') }}</p>
      <button v-if="error" @click="load">{{ t('account.retry') }}</button>
      <p v-if="success" role="status">{{ t('feed.saved') }}</p>
      <label for="report-filter">{{ t('feed.view') }}</label><select
        id="report-filter"
        v-model="filter"
      >
        <option value="pending">{{ t('feed.pending') }}</option>
        <option value="all">{{ t('feed.all') }}</option>
      </select>
      <p v-if="!loading && !visible.length">{{ t('feed.noReports') }}</p>
      <article v-for="entry in visible" :key="entry.id">
        <h2>
          <RouterLink :to="`/announcements/${entry.post_id}`">{{
            t(entry.comment_id ? 'feed.reportedComment' : 'feed.reportedPost')
          }}</RouterLink>
        </h2>
        <p>{{ entry.reason }}</p>
        <p>
          {{ t(`feed.${entry.state}`) }} ·
          {{ dateManila(entry.created_at, locale) }}
        </p>
        <p v-if="entry.decision_reason">{{ entry.decision_reason }}</p>
        <ReasonForm
          v-if="entry.state !== 'removed'"
          :actions="['hidden', 'rejected', 'restored', 'removed']"
          :disabled="busy || !connectivity.online"
          @submit="(value) => decide(entry, value)"
        />
      </article></section
  ></AppLayout>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue';
import { onIonViewWillEnter, alertController } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import AppLayout from '@/layouts/AppLayout.vue';
import ReasonForm from '@/components/feed/ReasonForm.vue';
import {
  reports,
  moderate,
  rpc,
  dateManila,
} from '@/services/modules/communication';
import { removePost } from '@/services/modules/attachments';
import type { ContentReport } from '@/types/communication';
import { useConnectivityStore } from '@/stores/app';
const { t, locale } = useI18n();
const connectivity = useConnectivityStore();
const rows = ref<ContentReport[]>([]),
  filter = ref('pending'),
  loading = ref(true),
  error = ref(false),
  success = ref(false),
  busy = ref(false);
const visible = computed(() =>
  rows.value.filter((r) => filter.value === 'all' || r.state === 'pending'),
);
async function load() {
  loading.value = true;
  error.value = false;
  try {
    rows.value = await reports();
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
async function decide(
  entry: ContentReport,
  value: { action: string; reason: string },
) {
  if (value.action === 'removed') {
    const alert = await alertController.create({
      header: t('feed.delete'),
      message: t('feed.deleteWarning'),
      buttons: [
        { text: t('academic.cancel'), role: 'cancel' },
        { text: t('feed.delete'), role: 'confirm' },
      ],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'confirm') return;
  }
  busy.value = true;
  success.value = false;
  error.value = false;
  try {
    if (value.action === 'removed') {
      if (entry.comment_id)
        await rpc('remove_reported_comment', {
          report_id: entry.id,
          moderation_reason: value.reason,
        });
      else await removePost(entry.post_id, value.reason, entry.id);
    } else await moderate(entry.id, value.action, value.reason);
    await load();
    success.value = !error.value;
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
onIonViewWillEnter(load);
</script>
