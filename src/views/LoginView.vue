<template>
  <IonPage
    ><IonContent
      ><main id="main" class="auth-layout">
        <section class="auth-story">
          <RouterLink to="/home" class="brand"
            >C-LEAD <span>✦</span></RouterLink
          >
          <div>
            <p class="eyebrow">{{ t('brand.section') }}</p>
            <h1>{{ t('home.hero') }}</h1>
            <p>{{ t('brand.tagline') }}</p>
            <CiMascot />
          </div>
          <p>{{ t('brand.together') }}</p>
        </section>
        <section class="auth-panel">
          <span class="eyebrow">{{ t('auth.welcome') }}</span>
          <h1>{{ t('auth.login') }}</h1>
          <p>{{ t('auth.subtitle') }}</p>
          <div v-if="!backendConfigured" class="notice">
            {{ t('auth.setup') }}
          </div>
          <form @submit="submit">
            <label for="username">{{ t('auth.username') }}</label><input
              id="username"
              v-model="username"
              v-bind="usernameAttrs"
              autocomplete="username"
              :aria-invalid="!!errors.username"
              aria-describedby="username-error"
            /><span id="username-error" class="field-error">{{
              errors.username ? t('auth.usernameError') : ''
            }}</span
            ><label for="password">{{ t('auth.password') }}</label
            ><input
              id="password"
              v-model="password"
              v-bind="passwordAttrs"
              type="password"
              autocomplete="current-password"
              :aria-invalid="!!errors.password"
              aria-describedby="password-error"
            /><span id="password-error" class="field-error">{{
              errors.password ? t('auth.passwordError') : ''
            }}</span>
            <p v-if="error" role="alert" class="field-error">{{ t(error) }}</p>
            <p v-if="retrySeconds > 0" role="status">
              {{ t('account.retryAfter', { seconds: retrySeconds }) }}
            </p>
            <p v-if="auth.invalidated" role="status">
              {{ t('account.invalidated') }}
            </p>
            <p v-if="auth.unavailable" role="alert">
              {{ t('account.connectionFailed') }}
            </p>
            <button
              v-if="auth.unavailable"
              type="button"
              class="secondary"
              @click="retryConnection"
            >
              {{ t('account.retry') }}
            </button>
            <button
              type="submit"
              :disabled="
                !backendConfigured ||
                isSubmitting ||
                !connectivity.online ||
                retrySeconds > 0
              "
            >
              {{ t(isSubmitting ? 'auth.signingIn' : 'auth.login') }} →
            </button>
          </form>
          <p class="fine-print">{{ t('auth.reset') }}</p>
          <p class="fine-print">{{ t('auth.lockout') }}</p>
          <RouterLink to="/home">{{ t('auth.explore') }} →</RouterLink>
        </section>
      </main></IonContent
    ></IonPage
  >
</template>
<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue';
import { IonPage, IonContent } from '@ionic/vue';
import { useForm } from 'vee-validate';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { loginSchema } from '@/schemas/auth';
import { login, LoginError } from '@/services/auth';
import { useAuthStore } from '@/stores/auth';
import { backendConfigured } from '@/config/env';
import { useConnectivityStore } from '@/stores/app';
import CiMascot from '@/components/common/CiMascot.vue';
const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const connectivity = useConnectivityStore();
const error = ref('');
const retryUntil = ref(0);
const now = ref(Date.now());
const timer = setInterval(() => {
  now.value = Date.now();
}, 1000);
onUnmounted(() => clearInterval(timer));
const retrySeconds = computed(() =>
  Math.max(0, Math.ceil((retryUntil.value - now.value) / 1000)),
);
async function retryConnection() {
  await auth.refresh();
  if (auth.profile && !auth.unavailable) await router.replace('/home');
}
const { defineField, errors, handleSubmit, isSubmitting } = useForm<{
  username: string;
  password: string;
}>({
  validationSchema: {
    username: (value: unknown) =>
      loginSchema.shape.username.safeParse(value).success ||
      t('auth.usernameError'),
    password: (value: unknown) =>
      loginSchema.shape.password.safeParse(value).success ||
      t('auth.passwordError'),
  },
});
const [username, usernameAttrs] = defineField('username');
const [password, passwordAttrs] = defineField('password');
watch(username, () => {
  retryUntil.value = 0;
  error.value = '';
});
const submit = handleSubmit(async (values) => {
  error.value = '';
  try {
    await login(values);
    await auth.refresh();
    await router.replace(auth.onboarded ? '/home' : '/onboarding');
  } catch (failure) {
    error.value = 'auth.failed';
    if (failure instanceof LoginError)
      retryUntil.value = Date.now() + failure.retryAfter * 1000;
  }
});
</script>
