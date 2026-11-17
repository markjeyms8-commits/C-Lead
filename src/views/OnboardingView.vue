<template>
  <AppLayout :title="t('onboarding.title')"
    ><section class="narrow card onboarding">
      <CiMascot />
      <p class="eyebrow">{{ t('onboarding.eyebrow') }}</p>
      <h1>{{ t('onboarding.title') }}</h1>
      <p>{{ t('onboarding.tour') }}</p>
      <form @submit.prevent="save">
        <label class="checkbox-label"
          ><input v-model="privacy" type="checkbox" required /><span
            >{{ t('onboarding.accept') }}
            <RouterLink to="/privacy">{{
              t('pages.privacy.title')
            }}</RouterLink>
            (1.0)</span
          ></label
        ><label class="checkbox-label"
          ><input v-model="community" type="checkbox" required /><span
            >{{ t('onboarding.accept') }}
            <RouterLink to="/community-guidelines">{{
              t('pages.community.title')
            }}</RouterLink>
            (1.0)</span
          ></label
        ><label for="onboard-language">{{ t('language') }}</label
        ><select id="onboard-language" v-model="preferences.language">
          <option value="en">English</option>
          <option value="fil">Filipino</option></select
        ><label for="onboard-theme">{{ t('theme') }}</label
        ><select id="onboard-theme" v-model="preferences.theme">
          <option value="light">{{ t('light') }}</option>
          <option value="dark">{{ t('dark') }}</option></select
        ><label for="new-password">{{ t('onboarding.password') }}</label
        ><input
          id="new-password"
          v-model="password"
          type="password"
          autocomplete="new-password"
          minlength="12"
          maxlength="128"
        />
        <p class="fine-print">{{ t('onboarding.passwordHint') }}</p>
        <NotificationChoices v-model="notifications" />
        <label class="checkbox-label"
          ><input v-model="tourCompleted" type="checkbox" required /><span>{{
            t('account.tourDone')
          }}</span></label
        >
        <p v-if="error" role="alert" class="field-error">{{ t(error) }}</p>
        <button
          :disabled="
            busy ||
            !privacy ||
            !community ||
            !tourCompleted ||
            !connectivity.online
          "
        >
          {{ t('onboarding.continue') }} →
        </button>
      </form>
    </section></AppLayout
  >
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import AppLayout from '@/layouts/AppLayout.vue';
import CiMascot from '@/components/common/CiMascot.vue';
import NotificationChoices from '@/components/common/NotificationChoices.vue';
import { defaultNotificationChoices } from '@/constants/notifications';
import { usePreferencesStore, useConnectivityStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { acceptPolicies, changePassword } from '@/services/auth';
import { passwordSchema } from '@/schemas/auth';
const { t } = useI18n();
const router = useRouter();
const preferences = usePreferencesStore();
const connectivity = useConnectivityStore();
const auth = useAuthStore();
const privacy = ref(false);
const community = ref(false);
const tourCompleted = ref(false);
const notifications = ref(defaultNotificationChoices());
const password = ref('');
const error = ref('');
const busy = ref(false);
async function save() {
  if (
    busy.value ||
    !privacy.value ||
    !community.value ||
    !tourCompleted.value ||
    !connectivity.online
  )
    return;
  error.value = '';
  busy.value = true;
  try {
    if (password.value) {
      passwordSchema.parse(password.value);
      await changePassword(password.value);
      password.value = '';
    }
    await acceptPolicies(
      preferences.language,
      preferences.theme,
      notifications.value,
    );
    await auth.refresh();
    await router.replace('/home');
  } catch {
    error.value = 'auth.failed';
  } finally {
    busy.value = false;
  }
}
</script>
