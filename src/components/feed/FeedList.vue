<template>
  <section class="classroom-feed">
    <nav class="feed-actions">
      <RouterLink v-if="canPublish" to="/announcements/new" class="button">{{
        t('feed.createOfficial')
      }}</RouterLink><RouterLink
        to="/discussions/new"
        class="button"
        :class="{ secondary: canPublish }"
        >{{ t('feed.createDiscussion') }}</RouterLink
      >
      <RouterLink to="/polls" class="feed-tool-link">{{
        t('polls.title')
      }}</RouterLink>
    </nav>
    <div class="feed-controls">
      <div class="feed-tabs" role="group" :aria-label="t('feed.filter')">
        <button
          v-for="value in ['all', 'announcement', 'discussion']"
          :key="value"
          :aria-pressed="kind === value"
          :class="{ selected: kind === value }"
          @click="kind = value"
        >
          {{ t(`feed.${value}`) }}
        </button>
      </div>
      <div class="feed-view-control">
        <label :for="`feed-mode-${instanceId}`">{{ t('feed.view') }}</label>
        <select :id="`feed-mode-${instanceId}`" v-model="mode">
          <option
            v-for="value in ['active', 'archive', 'mine']"
            :key="value"
            :value="value"
          >
            {{ t(`feed.${value}`) }}
          </option>
        </select>
      </div>
    </div>
    <p v-if="loading" role="status">{{ t('account.loading') }}</p>
    <p v-if="error" role="alert">{{ t('feed.error') }}</p>
    <button v-if="error" @click="load">{{ t('account.retry') }}</button>
    <p v-if="!loading && !rows.length">{{ t('feed.empty') }}</p>
    <article
      v-for="post in rows"
      :key="post.id"
      class="card feed-card"
      :class="{
        'is-pinned': post.pinned,
        'is-announcement': post.kind === 'announcement',
      }"
    >
      <div v-if="post.pinned" class="pinned-banner">
        <span aria-hidden="true">◆</span> {{ t('feed.pinned') }}
      </div>
      <span class="pill post-kind-pill" :class="post.kind">{{
        t(`feed.${post.kind}`)
      }}</span>
      <h2>
        <RouterLink :to="`/announcements/${post.id}`">{{
          post.title
        }}</RouterLink>
      </h2>
      <p>
        {{ t(`feed.${post.state}`) }}
        <span v-if="post.publish_at"
          >· {{ dateManila(post.publish_at, locale) }}</span
        ><span v-if="post.edited_at"> · {{ t('feed.edited') }}</span>
      </p>
      <RichText :body="post.body" /><RouterLink
        :to="`/announcements/${post.id}`"
        >{{ t('feed.open') }}</RouterLink
      >
    </article>
    <div class="link-grid">
      <button :disabled="page === 0 || loading" @click="page--">
        {{ t('feed.previous') }}</button><button
        :disabled="rows.length < 20 || loading"
        @click="page++"
      >
        {{ t('feed.next') }}
      </button>
    </div>
  </section>
</template>
<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { onIonViewWillEnter, onIonViewDidLeave } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { can } from '@/utils/permissions';
import {
  feed,
  watchCommunication,
  dateManila,
  type FeedMode,
} from '@/services/modules/communication';
import type { Post } from '@/types/communication';
import RichText from './RichText.vue';
const { t, locale } = useI18n();
const auth = useAuthStore();
const canPublish = computed(() => can(auth.profile?.role, 'publish'));
const instanceId = crypto.randomUUID();
const mode = ref<FeedMode>('active'),
  kind = ref('all'),
  page = ref(0),
  rows = ref<Post[]>([]),
  loading = ref(true),
  error = ref(false);
let version = 0;
let stop: (() => void) | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
async function load() {
  const current = ++version;
  loading.value = true;
  error.value = false;
  try {
    const result = await feed(mode.value, kind.value, page.value);
    if (current === version) rows.value = result;
  } catch {
    if (current === version) error.value = true;
  } finally {
    if (current === version) loading.value = false;
  }
}
function start() {
  if (stop) return;
  stop = watchCommunication(() => void load());
  timer = setInterval(() => void load(), 30000);
  void load();
}
function end() {
  version++;
  stop?.();
  stop = undefined;
  if (timer) clearInterval(timer);
  timer = undefined;
}
watch([mode, kind], () => {
  page.value = 0;
  void load();
});
watch(page, () => void load());
onMounted(start);
onIonViewWillEnter(start);
onIonViewDidLeave(end);
onUnmounted(end);
</script>
<style scoped>
.feed-card {
  margin-block: 1rem;
  overflow-wrap: anywhere;
}
</style>
