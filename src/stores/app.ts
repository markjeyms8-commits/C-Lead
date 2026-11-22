import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { Capacitor } from '@capacitor/core';
import { useAuthStore } from './auth';
import { can } from '@/utils/permissions';
import type { Capability } from '@/types/domain';
export const usePreferencesStore = defineStore('preferences', () => {
  const language = ref(localStorage.getItem('language') || 'en');
  const theme = ref(localStorage.getItem('theme') || 'light');
  watch(language, (v) => localStorage.setItem('language', v));
  watch(
    theme,
    (v) => {
      localStorage.setItem('theme', v);
      document.documentElement.dataset.theme = v;
    },
    { immediate: true },
  );
  return { language, theme };
});
export const useThemeStore = defineStore('theme', () => {
  const preferences = usePreferencesStore();
  return {
    current: computed(() => preferences.theme),
    toggle: () => {
      preferences.theme = preferences.theme === 'dark' ? 'light' : 'dark';
    },
  };
});
export const useLanguageStore = defineStore('language', () => {
  const preferences = usePreferencesStore();
  return {
    current: computed(() => preferences.language),
    toggle: () => {
      preferences.language = preferences.language === 'en' ? 'fil' : 'en';
    },
  };
});
export const usePermissionsStore = defineStore('permissions', () => {
  const auth = useAuthStore();
  return {
    allows: (capability: Capability) => can(auth.profile?.role, capability),
  };
});
export const useTermStore = defineStore('term', () => ({
  activeId: ref<string | null>(null),
}));
export const useNotificationsStore = defineStore('notifications', () => ({
  unread: ref(0),
}));
export const useConnectivityStore = defineStore('connectivity', () => {
  const online = ref(navigator.onLine);
  window.addEventListener('online', () => {
    online.value = true;
  });
  window.addEventListener('offline', () => {
    online.value = false;
  });
  return { online };
});
export const usePwaStore = defineStore('pwa', () => {
  const installed = ref(
    Capacitor.isNativePlatform() ||
      matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  );
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  window.addEventListener('appinstalled', () => {
    installed.value = true;
  });
  return {
    installed,
    mobile,
    needsInstall: computed(() => mobile && !installed.value),
  };
});
