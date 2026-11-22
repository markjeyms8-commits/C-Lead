<template>
  <IonPage class="auth-page">
    <IonContent class="auth-content">
      <main id="main" class="auth-layout">
        <section class="auth-story" aria-label="C-LEAD">
          <RouterLink
            to="/home"
            class="auth-brand"
            :aria-label="t('auth.homeLink')"
          >
            <img
              class="auth-brand-logo"
              src="/icon-192.png"
              alt=""
              width="192"
              height="192"
            />
          </RouterLink>

          <div class="auth-story-copy">
            <p class="eyebrow">{{ t('brand.section') }}</p>
            <h2>{{ t('home.hero') }}</h2>
            <p>{{ t('brand.tagline') }}</p>
          </div>

          <CiMascot class="auth-mascot" />
          <p class="auth-story-note">{{ t('brand.together') }}</p>
        </section>

        <section class="auth-panel" aria-labelledby="sign-in-title">
          <header class="auth-heading">
            <p class="eyebrow">{{ t('auth.welcome') }}</p>
            <h1 id="sign-in-title">{{ t('auth.login') }}</h1>
            <p class="auth-subtitle">{{ t('auth.subtitle') }}</p>
          </header>

          <div v-if="!backendConfigured" class="notice" role="status">
            {{ t('auth.setup') }}
          </div>

          <form class="auth-form" novalidate @submit="submit">
            <div class="auth-field">
              <label for="username">{{ t('auth.username') }}</label>
              <input
                id="username"
                v-model="username"
                v-bind="usernameAttrs"
                name="username"
                type="text"
                autocomplete="username"
                autocapitalize="none"
                autocorrect="off"
                spellcheck="false"
                enterkeyhint="next"
                :aria-invalid="!!errors.username"
                :aria-describedby="
                  errors.username ? 'username-error' : undefined
                "
              />
              <p v-if="errors.username" id="username-error" class="field-error">
                {{ t('auth.usernameError') }}
              </p>
            </div>

            <div class="auth-field">
              <label for="password">{{ t('auth.password') }}</label>
              <div class="auth-password-field">
                <input
                  id="password"
                  v-model="password"
                  v-bind="passwordAttrs"
                  :type="showPassword ? 'text' : 'password'"
                  name="password"
                  autocomplete="current-password"
                  enterkeyhint="go"
                  :aria-invalid="!!errors.password"
                  :aria-describedby="
                    errors.password ? 'password-error' : undefined
                  "
                />
                <button
                  class="auth-password-toggle"
                  type="button"
                  :aria-label="
                    t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')
                  "
                  :aria-pressed="showPassword"
                  aria-controls="password"
                  @click="showPassword = !showPassword"
                >
                  <IonIcon
                    :icon="showPassword ? eyeOffOutline : eyeOutline"
                    aria-hidden="true"
                  />
                </button>
              </div>
              <p v-if="errors.password" id="password-error" class="field-error">
                {{ t('auth.passwordError') }}
              </p>
            </div>

            <p v-if="error" role="alert" class="auth-alert">
              {{ t(error) }}
            </p>
            <p v-if="retrySeconds > 0" role="status" class="auth-status">
              {{ t('account.retryAfter', { seconds: retrySeconds }) }}
            </p>
            <p v-if="auth.invalidated" role="status" class="auth-status">
              {{ t('account.invalidated') }}
            </p>
            <p v-if="auth.unavailable" role="alert" class="auth-alert">
              {{ t('account.connectionFailed') }}
            </p>
            <p v-if="!connectivity.online" role="status" class="auth-status">
              {{ t('auth.offline') }}
            </p>

            <button
              v-if="auth.unavailable"
              type="button"
              class="secondary auth-retry"
              @click="retryConnection"
            >
              {{ t('account.retry') }}
            </button>
            <button
              class="auth-submit"
              type="submit"
              :aria-busy="isSubmitting"
              :disabled="
                !backendConfigured ||
                isSubmitting ||
                !connectivity.online ||
                retrySeconds > 0
              "
            >
              <IonSpinner
                v-if="isSubmitting"
                name="crescent"
                aria-hidden="true"
              />
              <span>{{
                t(isSubmitting ? 'auth.signingIn' : 'auth.login')
              }}</span>
              <span v-if="!isSubmitting" aria-hidden="true">→</span>
            </button>
          </form>

          <div class="auth-help">
            <p>{{ t('auth.reset') }}</p>
            <p>{{ t('auth.lockout') }}</p>
          </div>

          <RouterLink to="/home" class="auth-preview">
            {{ t('auth.explore') }} <span aria-hidden="true">→</span>
          </RouterLink>
        </section>
      </main>
    </IonContent>
  </IonPage>
</template>
<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue';
import { IonContent, IonIcon, IonPage, IonSpinner } from '@ionic/vue';
import { eyeOffOutline, eyeOutline } from 'ionicons/icons';
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
const showPassword = ref(false);
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
