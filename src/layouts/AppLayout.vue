<template>
  <IonPage
    ><IonContent
      ><div class="app-frame">
        <aside class="sidebar">
          <RouterLink to="/home" class="brand"
            ><span class="brand-mark">C<span>✦</span></span
            ><span
              >C-LEAD<small>{{ t('brand.subtitle') }}</small></span
            ></RouterLink
          >
          <p class="nav-caption">{{ t('nav.yourSpace') }}</p>
          <nav :aria-label="t('nav.main')">
            <RouterLink v-for="item in mainNav" :key="item.path" :to="item.path"
              ><IonIcon :icon="item.icon" aria-hidden="true" />{{
                t(item.key)
              }}</RouterLink
            >
          </nav>
          <p class="nav-caption">{{ t('nav.classroom') }}</p>
          <nav :aria-label="t('nav.classroom')">
            <RouterLink
              v-for="item in secondaryNav"
              :key="item.path"
              :to="item.path"
              ><IonIcon :icon="item.icon" aria-hidden="true" />{{
                t(item.key)
              }}</RouterLink
            >
          </nav>
          <div class="sidebar-note">
            <CiMascot /><strong>{{ t('brand.together') }}</strong>
            <p>{{ t('brand.tagline') }}</p>
          </div>
          <span class="section-label"
            >{{ t('brand.section') }} <span class="status-dot"></span
          ></span>
        </aside>
        <div class="workspace">
          <header class="topbar">
            <span class="mobile-brand">C-LEAD <span>✦</span></span
            ><span class="breadcrumb"
              >{{ t('brand.section') }} <span>/</span> {{ title }}</span
            >
            <div class="header-actions">
              <RouterLink
                class="icon-button"
                to="/search"
                :aria-label="t('pages.search.title')"
                ><IonIcon
                  :icon="searchOutline"
                  aria-hidden="true" /></RouterLink
              ><button
                class="icon-button"
                :aria-label="t('language')"
                @click="language.toggle()"
              >
                {{ language.current === 'en' ? 'FIL' : 'EN' }}</button
              ><button
                class="icon-button"
                :aria-label="t('theme')"
                @click="theme.toggle()"
              >
                <IonIcon
                  aria-hidden="true"
                  :icon="theme.current === 'dark' ? sunnyOutline : moonOutline"
                /></button
              ><RouterLink
                class="icon-button"
                to="/notifications"
                :aria-label="t('pages.notifications.title')"
                ><IonIcon
                  :icon="notificationsOutline"
                  aria-hidden="true" /></RouterLink
              ><RouterLink to="/profile" :aria-label="t('nav.profile')"
                ><InitialsAvatar :name="auth.profile?.full_name || 'Section C'"
              /></RouterLink>
            </div>
          </header>
          <main id="main" :data-page-path="pagePath" tabindex="-1">
            <div v-if="!backendConfigured" class="preview-banner" role="status">
              <span>{{ t('preview') }}</span><RouterLink to="/login"
                >{{ t('auth.login') }} ↗</RouterLink
              >
            </div>
            <slot />
          </main>
          <footer>
            {{ t('brand.tagline') }}
            <RouterLink
              v-if="auth.profile"
              :to="{ path: '/report-problem', query: { from: route.path } }"
              >{{ t('problems.title') }}</RouterLink
            >
            <span>C-LEAD · {{ t('brand.section') }}</span>
          </footer>
        </div>
        <nav class="bottom-nav" :aria-label="t('nav.main')">
          <RouterLink v-for="item in mainNav" :key="item.path" :to="item.path"
            ><IonIcon :icon="item.icon" aria-hidden="true" /><span>{{
              t(item.key)
            }}</span></RouterLink
          >
        </nav>
      </div></IonContent
    ></IonPage
  >
</template>
<script setup lang="ts">
import { IonPage, IonContent, IonIcon } from '@ionic/vue';
import {
  homeOutline,
  megaphoneOutline,
  checkboxOutline,
  peopleOutline,
  personCircleOutline,
  calendarOutline,
  checkmarkDoneOutline,
  walletOutline,
  gridOutline,
  searchOutline,
  notificationsOutline,
  moonOutline,
  sunnyOutline,
} from 'ionicons/icons';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
const route = useRoute();
const pagePath = route.path;
import CiMascot from '@/components/common/CiMascot.vue';
import InitialsAvatar from '@/components/common/InitialsAvatar.vue';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore, useLanguageStore } from '@/stores/app';
import { backendConfigured } from '@/config/env';
defineProps<{ title: string }>();
const { t } = useI18n();
const auth = useAuthStore();
const theme = useThemeStore();
const language = useLanguageStore();
const mainNav = [
  { path: '/home', key: 'nav.home', icon: homeOutline },
  { path: '/announcements', key: 'nav.announcements', icon: megaphoneOutline },
  { path: '/tasks', key: 'nav.tasks', icon: checkboxOutline },
  { path: '/members', key: 'nav.members', icon: peopleOutline },
  { path: '/profile', key: 'nav.profile', icon: personCircleOutline },
];
const secondaryNav = [
  { path: '/calendar', key: 'pages.calendar.title', icon: calendarOutline },
  {
    path: '/attendance',
    key: 'pages.attendance.title',
    icon: checkmarkDoneOutline,
  },
  {
    path: '/contributions',
    key: 'pages.contributions.title',
    icon: walletOutline,
  },
  { path: '/groups', key: 'pages.groups.title', icon: gridOutline },
];
</script>
