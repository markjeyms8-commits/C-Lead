<template>
  <IonApp
    ><a class="skip-link" href="#main" @click.prevent="focusContent">{{
      t('skip')
    }}</a
    ><IonRouterOutlet :key="auth.profile?.id ?? 'guest'" />
    <div v-if="!connectivity.online" class="offline" role="status">
      {{ t('offline') }}
      <RouterLink to="/offline">{{ t('offlineData.title') }}</RouterLink>
    </div>
    <aside v-if="needRefresh && !later" class="update-prompt" role="status">
      <p>{{ t('update.message') }}</p>
      <button @click="updateServiceWorker(true)">
        {{ t('update.now') }}</button><button
        class="secondary"
        @click="later = true"
      >
        {{ t('update.later') }}
      </button>
    </aside></IonApp
  >
</template>
<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue';
import { PushNotifications } from '@capacitor/push-notifications';
import { useI18n } from 'vue-i18n';
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useRegisterSW } from 'virtual:pwa-register/vue';
import { useConnectivityStore, usePreferencesStore } from '@/stores/app';
import {
  nativeAndroidPush,
  refreshNativePushIfEnabled,
  safeInternalPath,
} from '@/services/modules/notifications';
const { t, locale } = useI18n();
async function focusContent() {
  // Wait for Ionic's incoming-page transition before moving keyboard focus.
  await Promise.allSettled(
    document
      .getAnimations()
      .filter((animation) =>
        Number.isFinite(animation.effect?.getComputedTiming().endTime),
      )
      .map((animation) => animation.finished),
  );
  const target = Array.from(
    document.querySelectorAll<HTMLElement>('main#main'),
  ).find(
    (el) =>
      (!el.dataset.pagePath ||
        el.dataset.pagePath === router.currentRoute.value.path) &&
      el.getClientRects().length > 0 &&
      !el.closest('.ion-page-hidden,[aria-hidden="true"]'),
  );
  if (target) {
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start' });
  }
}
const connectivity = useConnectivityStore();
const preferences = usePreferencesStore();
const auth = useAuthStore();
const router = useRouter();
let stopMonitoring = () => {};
let removePushAction = () => {};
onMounted(() => {
  stopMonitoring = auth.startMonitoring();
  if (nativeAndroidPush) {
    void PushNotifications.createChannel({
      id: 'clead_updates',
      name: 'C-LEAD updates',
      description: 'Classroom announcements and activity alerts',
      importance: 3,
      visibility: 0,
    }).catch(() => undefined);
    void PushNotifications.addListener(
      'pushNotificationActionPerformed',
      ({ notification }) => {
        const path = notification.data?.path;
        void router.push(
          safeInternalPath(typeof path === 'string' ? path : '/notifications'),
        );
      },
    ).then((handle) => {
      removePushAction = () => void handle.remove();
    });
  }
});
onUnmounted(() => {
  stopMonitoring();
  removePushAction();
});
watch(
  () => [auth.ready, auth.profile?.id] as const,
  ([ready, userId]) => {
    if (ready && userId && nativeAndroidPush)
      void refreshNativePushIfEnabled().catch(() => undefined);
  },
  { immediate: true },
);
watch(
  () => auth.invalidated,
  (invalid) => {
    if (invalid && !router.currentRoute.value.meta.public)
      void router.replace('/login');
  },
);
watch(
  () => auth.profile?.id,
  (id) => {
    if (id && auth.settings) {
      preferences.language = auth.settings.language;
      preferences.theme = auth.settings.theme;
    }
  },
  { immediate: true },
);
const later = ref(false);
const { needRefresh, updateServiceWorker } = useRegisterSW();
watch(
  () => preferences.language,
  (value) => {
    locale.value = value;
    document.documentElement.lang = value;
  },
  { immediate: true },
);
</script>
