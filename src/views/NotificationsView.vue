<template>
  <AppLayout :title="t('notices.title')"
    ><section class="card">
      <PageHero :title="t('notices.title')" />
      <RouterLink to="/settings/notifications">{{
        t('notices.preferences')
      }}</RouterLink>
      <section>
        <h2>{{ t('notices.device') }}</h2>
        <p>{{ t('notices.generic') }}</p>
        <p v-if="!supported">{{ t('notices.unsupported') }}</p>
        <p v-else-if="!configured">{{ t('notices.notConfigured') }}</p>
        <p v-else>{{ t(enabled ? 'notices.enabled' : 'notices.disabled') }}</p>
        <button
          v-if="supported && configured"
          :disabled="busy || !online"
          @click="togglePush"
        >
          {{ t(enabled ? 'notices.disable' : 'notices.enable') }}
        </button>
      </section>
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('notices.error') }}</p>
      <button v-if="error" @click="load">{{ t('account.retry') }}</button>
      <p v-if="success" role="status">{{ t('feed.saved') }}</p>
      <label for="notice-view">{{ t('feed.view') }}</label><select
        id="notice-view"
        v-model="unread"
      >
        <option :value="false">{{ t('feed.all') }}</option>
        <option :value="true">{{ t('notices.unread') }}</option></select
      ><button
        :disabled="busy || !online || !rows.some((r) => !r.read_at)"
        @click="readAll"
      >
        {{ t('notices.readAll') }}
      </button>
      <p v-if="!loading && !rows.length">{{ t('notices.empty') }}</p>
      <article
        v-for="notice in rows"
        :key="notice.id"
        class="card notification-row"
        :class="{ unread: !notice.read_at }"
      >
        <h2>{{ notice.title }}</h2>
        <p>{{ notice.body }}</p>
        <p>
          {{ dateManila(notice.created_at, locale) }} ·
          {{ t(notice.read_at ? 'notices.read' : 'notices.unread') }}
        </p>
        <button :disabled="busy || !online" @click="open(notice)">
          {{ t('notices.open') }}</button><button
          v-if="!notice.read_at"
          :disabled="busy || !online"
          @click="read(notice.id)"
        >
          {{ t('notices.markRead') }}
        </button>
      </article>
      <button :disabled="page === 0 || loading" @click="page--">
        {{ t('feed.previous') }}</button><button
        :disabled="rows.length < 20 || loading"
        @click="page++"
      >
        {{ t('feed.next') }}
      </button>
    </section></AppLayout
  >
</template>
<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { onIonViewWillEnter, onIonViewDidLeave } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import PageHero from '@/components/common/PageHero.vue';
import AppLayout from '@/layouts/AppLayout.vue';
import { useConnectivityStore } from '@/stores/app';
import {
  notices,
  markNotice,
  markAllNotices,
  safeInternalPath,
  pushSupported,
  pushEnabled,
  enablePush,
  disablePush,
  pushConfigured,
  watchNotices,
  type Notice,
} from '@/services/modules/notifications';
import { dateManila } from '@/services/modules/communication';
const { t, locale } = useI18n(),
  router = useRouter(),
  { online } = storeToRefs(useConnectivityStore()),
  supported = pushSupported(),
  configured = pushConfigured();
const rows = ref<Notice[]>([]),
  page = ref(0),
  unread = ref(false),
  loading = ref(true),
  error = ref(false),
  success = ref(false),
  busy = ref(false),
  enabled = ref(false);
let stop: (() => void) | undefined,
  revision = 0;
async function load() {
  const version = ++revision;
  loading.value = true;
  error.value = false;
  try {
    const result = await notices(page.value, unread.value);
    if (version === revision) rows.value = result;
    if (supported && configured) enabled.value = await pushEnabled();
  } catch {
    if (version === revision) error.value = true;
  } finally {
    if (version === revision) loading.value = false;
  }
}
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
async function read(id: string) {
  await action(() => markNotice(id));
}
async function readAll() {
  await action(markAllNotices);
}
async function open(notice: Notice) {
  await action(async () => {
    await markNotice(notice.id);
    await router.push(safeInternalPath(notice.path));
  });
}
async function togglePush() {
  await action(enabled.value ? disablePush : enablePush);
}
function cleanup() {
  stop?.();
  stop = undefined;
  revision++;
}
onIonViewWillEnter(() => {
  void load();
  if (!stop) stop = watchNotices(() => void load());
});
onIonViewDidLeave(cleanup);
onUnmounted(cleanup);
watch(page, load);
watch(unread, () => {
  page.value = 0;
  void load();
});
</script>
