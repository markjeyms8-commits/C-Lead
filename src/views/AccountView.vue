<template>
  <AppLayout :title="t(`pages.${pageKey}.title`)"
    ><section class="narrow card">
      <h1>{{ t(`pages.${pageKey}.title`) }}</h1>
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert" class="field-error">{{ t(error) }}</p>
      <button v-if="error && !busy" class="secondary" @click="load">
        {{ t('account.retry') }}
      </button>
      <p v-if="success" role="status">{{ t(success) }}</p>
      <template v-if="!loading && auth.profile">
        <template v-if="mode === 'profile'"
          ><InitialsAvatar :name="auth.profile.full_name" />
          <h2>{{ auth.profile.full_name }}</h2>
          <dl>
            <dt>{{ t('auth.username') }}</dt>
            <dd>{{ auth.profile.username }}</dd>
            <dt>{{ t('account.studentNumber') }}</dt>
            <dd>{{ studentNumber }}</dd>
            <dt>{{ t('account.role') }}</dt>
            <dd>{{ t(`roles.${auth.profile.role}`) }}</dd>
          </dl>
          <RouterLink
            v-if="
              ['president', 'vice_president', 'secretary'].includes(
                auth.profile.role,
              )
            "
            to="/administration/terms"
            >{{ t('academic.title') }}</RouterLink
          >
          <RouterLink
            v-if="['president', 'vice_president'].includes(auth.profile.role)"
            to="/administration"
            >{{ t('admin.title') }}</RouterLink
          >
          <nav class="link-grid" :aria-label="t('nav.profile')">
            <RouterLink v-for="link in links" :key="link.key" :to="link.path"
              >{{ t(`pages.${link.key}.title`) }} →</RouterLink
            >
            <RouterLink
              v-if="can(auth.profile.role, 'attendance')"
              to="/reports/attendance"
              >{{ t('insights.attendance') }}</RouterLink><RouterLink
              v-if="can(auth.profile.role, 'contributions')"
              to="/reports/contributions"
              >{{ t('insights.contributions') }}</RouterLink
            ><RouterLink v-if="can(auth.profile.role, 'audit')" to="/audit">{{
              t('insights.audit')
            }}</RouterLink
            ><RouterLink
              v-if="can(auth.profile.role, 'audit')"
              to="/analytics"
              >{{ t('insights.analytics') }}</RouterLink
            ><RouterLink
              v-if="can(auth.profile.role, 'publish')"
              to="/moderation"
              >{{ t('pages.moderation.title') }}</RouterLink
            ><RouterLink
              v-if="can(auth.profile.role, 'publish')"
              to="/discussions/review"
              >{{ t('pages.review.title') }}</RouterLink
            ><RouterLink to="/polls">{{ t('polls.title') }}</RouterLink
            ><RouterLink to="/report-problem">{{
              t('problems.title')
            }}</RouterLink
            ><RouterLink to="/offline">{{ t('offlineData.title') }}</RouterLink>
          </nav>
          <button :disabled="busy || !connectivity.online" @click="signOut">
            {{ t('module.signOut') }}
          </button></template
        >
        <form
          v-else-if="mode === 'preferences' || mode === 'notifications'"
          @submit.prevent="save"
        >
          <template v-if="mode === 'preferences'"
            ><label for="account-language">{{ t('language') }}</label
            ><select id="account-language" v-model="settings.language">
              <option value="en">English</option>
              <option value="fil">Filipino</option></select
            ><label for="account-theme">{{ t('theme') }}</label
            ><select id="account-theme" v-model="settings.theme">
              <option value="light">{{ t('light') }}</option>
              <option value="dark">{{ t('dark') }}</option>
            </select></template
          ><NotificationChoices
            v-else
            v-model="settings.notifications"
          /><button :disabled="busy || !connectivity.online">
            {{ t(busy ? 'account.saving' : 'module.save') }}
          </button>
        </form>
        <template v-else-if="mode === 'sessions'"
          ><p>{{ t('account.sessionsHelp') }}</p>
          <ul class="session-list">
            <li v-for="session in sessions" :key="session.id">
              <strong>{{ session.device_label }}</strong><span
                v-if="session.is_current"
              >
                · {{ t('account.currentDevice') }}</span
              >
              <p>{{ formatDate(session.created_at) }}</p>
              <button
                class="secondary"
                :disabled="busy || !connectivity.online"
                @click="terminate(session)"
              >
                {{ t('account.terminate') }}
              </button>
            </li>
          </ul></template
        >
        <form v-else-if="mode === 'password'" @submit.prevent="updatePassword">
          <p>{{ t('account.passwordHelp') }}</p>
          <label for="account-password">{{ t('auth.password') }}</label><input
            id="account-password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            minlength="12"
            maxlength="128"
            required
          /><label for="confirm-password">{{
            t('account.confirmPassword')
          }}</label
          ><input
            id="confirm-password"
            v-model="confirmation"
            type="password"
            autocomplete="new-password"
            required
          /><button :disabled="busy || !connectivity.online">
            {{ t(busy ? 'account.saving' : 'account.changePassword') }}
          </button>
        </form>
      </template>
    </section></AppLayout
  >
</template>
<script setup lang="ts">
import { can } from '@/utils/permissions';
import { computed, ref } from 'vue';
import { onIonViewWillEnter, alertController } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import AppLayout from '@/layouts/AppLayout.vue';
import InitialsAvatar from '@/components/common/InitialsAvatar.vue';
import NotificationChoices from '@/components/common/NotificationChoices.vue';
import { useAuthStore } from '@/stores/auth';
import { usePreferencesStore, useConnectivityStore } from '@/stores/app';
import {
  listSessions,
  revokeSession,
  savePreferences,
  loadStudentNumber,
} from '@/services/auth/account';
import { changePassword } from '@/services/auth';
import { passwordSchema } from '@/schemas/auth';
import { defaultNotificationChoices } from '@/constants/notifications';
import type { AccountPreferences, DeviceSession } from '@/types/account';
const props = defineProps<{
  mode: 'profile' | 'preferences' | 'notifications' | 'sessions' | 'password';
}>();
const { t, locale } = useI18n();
const auth = useAuthStore();
const preferences = usePreferencesStore();
const connectivity = useConnectivityStore();
const router = useRouter();
const pageKey = computed(() =>
  props.mode === 'notifications'
    ? 'notificationSettings'
    : props.mode === 'password'
      ? 'password'
      : props.mode,
);
const settings = ref<AccountPreferences>({
  language: 'en',
  theme: 'light',
  tour_completed_at: null,
  notifications: defaultNotificationChoices(),
});
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const success = ref('');
const sessions = ref<DeviceSession[]>([]);
const studentNumber = ref('');
const password = ref('');
const confirmation = ref('');
const links = [
  { path: '/settings/preferences', key: 'preferences' },
  { path: '/settings/notifications', key: 'notificationSettings' },
  { path: '/settings/password', key: 'password' },
  { path: '/settings/sessions', key: 'sessions' },
  { path: '/privacy', key: 'privacy' },
  { path: '/community-guidelines', key: 'community' },
];
const formatDate = (value: string) =>
  new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value));
async function load() {
  loading.value = true;
  error.value = '';
  success.value = '';
  password.value = '';
  confirmation.value = '';
  try {
    await auth.refresh();
    if (auth.unavailable) throw new Error();
    if (auth.settings)
      settings.value = {
        ...auth.settings,
        notifications: { ...auth.settings.notifications },
      };
    if (props.mode === 'sessions') sessions.value = await listSessions();
    if (props.mode === 'profile' && auth.profile)
      studentNumber.value = await loadStudentNumber(auth.profile.id);
  } catch {
    error.value = 'account.failed';
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(load);
async function run(action: () => Promise<void>) {
  if (busy.value || !connectivity.online) return;
  busy.value = true;
  error.value = '';
  success.value = '';
  try {
    await action();
  } catch {
    error.value = 'account.failed';
  } finally {
    busy.value = false;
  }
}
async function save() {
  await run(async () => {
    await savePreferences(settings.value);
    preferences.language = settings.value.language;
    preferences.theme = settings.value.theme;
    await auth.refresh();
    success.value = 'account.saved';
  });
}
async function signOut() {
  await run(async () => {
    await auth.logout();
    await router.replace('/login');
  });
}
async function terminate(session: DeviceSession) {
  const dialog = await alertController.create({
    header: t('account.terminate'),
    message: t('account.terminateConfirm'),
    buttons: [
      { text: t('account.cancel'), role: 'cancel' },
      { text: t('account.terminate'), role: 'confirm' },
    ],
  });
  await dialog.present();
  if ((await dialog.onDidDismiss()).role !== 'confirm') return;
  await run(async () => {
    await revokeSession(session.id);
    if (session.is_current) {
      await auth.refresh();
      await router.replace('/login');
    } else {
      sessions.value = await listSessions();
      success.value = 'account.sessionRevoked';
    }
  });
}
async function updatePassword() {
  if (
    password.value !== confirmation.value ||
    !passwordSchema.safeParse(password.value).success
  ) {
    error.value = 'account.passwordValidation';
    return;
  }
  await run(async () => {
    await changePassword(password.value);
    password.value = '';
    confirmation.value = '';
    success.value = 'account.passwordChanged';
  });
}
</script>
