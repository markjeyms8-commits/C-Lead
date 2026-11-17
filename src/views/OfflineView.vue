<template>
  <AppLayout :title="t('offlineData.title')"
    ><section class="card">
      <h1>{{ t('offlineData.title') }}</h1>
      <p>{{ t('offlineData.explanation') }}</p>
      <p v-if="!data">{{ t('offlineData.empty') }}</p>
      <template v-else
        ><p>
          {{ t('offlineData.saved') }}
          {{ dateManila(new Date(data.savedAt).toISOString(), locale) }}
        </p>
        <section v-for="kind in kinds" :key="kind">
          <h2>{{ t('offlineData.' + kind) }}</h2>
          <p v-if="!data[kind].length">{{ t('offlineData.empty') }}</p>
          <article v-for="item in data[kind]" :key="item.id">
            <h3>{{ item.title || t('offlineData.record') }}</h3>
            <p v-if="item.date">{{ dateManila(item.date, locale) }}</p>
            <p class="cached-text">
              {{
                kind === 'attendance' ? t('attendance.' + item.text) : item.text
              }}
            </p>
          </article>
        </section>
        <button @click="forget">{{ t('offlineData.forget') }}</button></template
      ><RouterLink v-if="online" to="/home">{{ t('module.home') }}</RouterLink>
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
import { backendEnv } from '@/config/env';
import {
  readOffline,
  clearOffline,
  sessionIdentity,
  type OfflineBundle,
} from '@/services/offline/cache';
import { dateManila } from '@/services/modules/communication';
const { t, locale } = useI18n(),
  { online } = storeToRefs(useConnectivityStore()),
  data = ref<OfflineBundle | null>(null),
  kinds = ['announcements', 'tasks', 'attendance'] as const;
function load() {
  data.value = null;
  try {
    if (!backendEnv) return;
    const project = new URL(backendEnv.VITE_SUPABASE_URL).hostname.split(
      '.',
    )[0];
    const session = JSON.parse(
      localStorage.getItem(`sb-${project}-auth-token`) || 'null',
    );
    if (session?.user?.id && session.access_token)
      data.value = readOffline(
        session.user.id,
        sessionIdentity(session.access_token),
      );
  } catch {
    /* Invalid or missing local sessions do not unlock cached records. */
  }
}
function forget() {
  clearOffline();
  data.value = null;
}
onIonViewWillEnter(load);
</script>
<style scoped>
.cached-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
article {
  border-bottom: 1px solid var(--border);
  padding-block: 0.75rem;
}
</style>
