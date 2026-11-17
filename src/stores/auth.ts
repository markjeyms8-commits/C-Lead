import {
  openOfflineScope,
  clearOffline,
  sessionIdentity,
} from '@/services/offline/cache';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '@/types/domain';
import type { AccountPreferences } from '@/types/account';
import { supabase } from '@/services/supabase/client';
import { loadAccount } from '@/services/auth/account';
export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null);
  const profile = ref<Profile | null>(null);
  const settings = ref<AccountPreferences | null>(null);
  const onboarded = ref(false);
  const ready = ref(false);
  const unavailable = ref(false);
  const invalidated = ref(false);
  let pending: Promise<void> | null = null;
  let revision = 0;
  function clear() {
    clearOffline();
    revision++;
    session.value = null;
    profile.value = null;
    settings.value = null;
    onboarded.value = false;
  }
  async function refresh() {
    if (pending) return pending;
    pending = (async () => {
      const requestedRevision = revision;
      if (!supabase) {
        ready.value = true;
        return;
      }
      try {
        const snapshot = await loadAccount();
        if (requestedRevision !== revision) return;
        unavailable.value = false;
        if (!snapshot) {
          clear();
          return;
        }
        if (snapshot.invalid || !snapshot.profile?.active) {
          clear();
          invalidated.value = true;
          await supabase.auth.signOut({ scope: 'local' });
          return;
        }
        openOfflineScope(
          snapshot.session.user.id,
          sessionIdentity(snapshot.session.access_token),
        );
        session.value = snapshot.session;
        profile.value = snapshot.profile;
        settings.value = snapshot.settings;
        onboarded.value = snapshot.onboarded;
        invalidated.value = false;
      } catch {
        if (requestedRevision === revision) unavailable.value = true;
      } finally {
        ready.value = true;
      }
    })().finally(() => {
      pending = null;
    });
    return pending;
  }
  async function logout() {
    if (supabase && session.value) {
      const result = await supabase.rpc('revoke_current_session');
      if (result.error) throw result.error;
      await supabase.auth.signOut({ scope: 'local' });
    }
    clear();
  }
  function startMonitoring() {
    if (!supabase) return () => {};
    const subscription = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clear();
        invalidated.value = true;
      } else if (event === 'TOKEN_REFRESHED')
        setTimeout(() => void refresh(), 0);
    });
    const check = () => {
      if (
        navigator.onLine &&
        document.visibilityState === 'visible' &&
        session.value
      )
        void refresh();
    };
    const timer = setInterval(check, 30_000);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      subscription.data.subscription.unsubscribe();
      clearInterval(timer);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
    };
  }
  return {
    session,
    profile,
    settings,
    onboarded,
    ready,
    unavailable,
    invalidated,
    refresh,
    logout,
    clear,
    startMonitoring,
  };
});
