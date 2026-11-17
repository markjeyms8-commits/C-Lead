<template>
  <AppLayout :title="t('feed.review')"
    ><section class="card">
      <h1>{{ t('feed.review') }}</h1>
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('feed.error') }}</p>
      <button v-if="error" @click="load">{{ t('account.retry') }}</button>
      <p v-if="success" role="status">{{ t('feed.saved') }}</p>
      <p v-if="!loading && !rows.length">{{ t('feed.noPending') }}</p>
      <article v-for="post in rows" :key="post.id">
        <h2>
          <RouterLink :to="`/announcements/${post.id}`">{{
            post.title
          }}</RouterLink>
        </h2>
        <RichText :body="post.body" /><ReasonForm
          :actions="['approved', 'rejected']"
          :disabled="busy || !connectivity.online"
          @submit="(value) => decide(post.id, value)"
        />
      </article>
      <button
        :disabled="loading || page === 0"
        @click="
          page--;
          load();
        "
      >
        {{ t('feed.previous') }}</button><button
        :disabled="loading || rows.length < 20"
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
import { ref } from 'vue';
import { onIonViewWillEnter } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import AppLayout from '@/layouts/AppLayout.vue';
import RichText from '@/components/feed/RichText.vue';
import ReasonForm from '@/components/feed/ReasonForm.vue';
import { feed, review } from '@/services/modules/communication';
import type { Post } from '@/types/communication';
import { useConnectivityStore } from '@/stores/app';
const { t } = useI18n();
const connectivity = useConnectivityStore();
const rows = ref<Post[]>([]),
  loading = ref(true),
  busy = ref(false),
  error = ref(false),
  success = ref(false),
  page = ref(0);
async function load() {
  loading.value = true;
  error.value = false;
  try {
    rows.value = await feed('review', 'discussion', page.value);
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
async function decide(id: string, value: { action: string; reason: string }) {
  busy.value = true;
  success.value = false;
  try {
    await review(id, value.action, value.reason);
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
