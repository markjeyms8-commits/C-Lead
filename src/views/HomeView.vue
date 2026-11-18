<template>
  <AppLayout :title="t('nav.home')"
    ><section class="home-masthead">
      <div>
        <p>{{ t('brand.section') }}</p>
        <h1>{{ t('home.greeting') }}</h1>
        <p>{{ t('home.subtitle') }}</p>
      </div>
      <CiMascot />
    </section>
    <section class="welcome-card class-summary">
      <div>
        <span class="pill">{{ t('brand.section') }}</span>
      </div>
      <RouterLink to="/announcements" class="button"
        >{{ t('viewAll') }} <span aria-hidden="true">→</span></RouterLink
      >
    </section>
    <div class="dashboard-columns">
      <section>
        <div class="section-heading">
          <h2>{{ t('home.feed') }}</h2>
          <RouterLink to="/announcements">{{ t('viewAll') }} →</RouterLink>
        </div>
        <FeedList v-if="auth.profile" /><template v-else>
          <div class="feed-tabs" role="group" :aria-label="t('home.feed')">
            <button
              v-for="filter in ['all', 'official', 'discussions']"
              :key="filter"
              :class="{ selected: activeFilter === filter }"
              :aria-pressed="activeFilter === filter"
              @click="activeFilter = filter"
            >
              {{ t(`home.${filter}`) }}
            </button>
          </div>
          <div class="card">
            <div class="card-heading">
              <span class="round-icon">◎</span>
              <div>
                <strong>{{ t('home.officialFirst') }}</strong>
                <p>{{ t('home.priority') }}</p>
              </div>
              <span class="pill muted">{{ t('home.classroom') }}</span>
            </div>
            <EmptyState
              :title="t('home.emptyTitle')"
              :description="t('home.emptyBody')"
            />
          </div>
          <RouterLink class="discussion-cta" to="/discussions/new"
            ><span class="round-icon">＋</span
            ><span
              ><strong>{{ t('home.share') }}</strong
              ><small>{{ t('home.shareBody') }}</small></span
            ><span>→</span></RouterLink
          >
        </template>
      </section>
      <aside class="right-column">
        <div class="shortcut-grid">
          <RouterLink
            v-for="item in shortcuts"
            :key="item.path"
            :to="item.path"
            class="shortcut"
            ><span class="shortcut-icon"
              ><IonIcon :icon="item.icon" aria-hidden="true" /></span
            ><span
              ><strong>{{ t(item.title) }}</strong
              ><small>{{ t(item.caption) }}</small></span
            ><span class="arrow">↗</span></RouterLink
          >
        </div>

        <section class="card">
          <div class="section-heading">
            <h2>{{ t('home.upNext') }}</h2>
            <span class="round-icon">↗</span>
          </div>
          <p v-if="upcomingLoading" role="status">{{ t('account.loading') }}</p>
          <p v-else-if="upcomingError" role="alert">{{ t('feed.error') }}</p>
          <button v-if="upcomingError" @click="loadUpcoming">
            {{ t('account.retry') }}
          </button>
          <ul v-if="upcoming.length">
            <li v-for="item in upcoming" :key="item.kind + item.id">
              <RouterLink :to="item.path">{{ item.title }}</RouterLink>
              <p>{{ dateManila(item.starts_at, locale) }}</p>
            </li>
          </ul>
          <EmptyState
            v-else-if="!upcomingLoading && !upcomingError"
            :title="t('home.clear')"
            :description="t('home.clearBody')"
          /><RouterLink class="full-link" to="/tasks"
            >{{ t('home.tasks') }} →</RouterLink
          >
        </section>
        <section class="community-card">
          <span class="eyebrow">{{ t('home.smallReminder') }}</span>
          <h3>{{ t('home.kind') }}</h3>
          <p>{{ t('home.kindBody') }}</p>
          <RouterLink to="/community-guidelines"
            >{{ t('home.guidelines') }} ↗</RouterLink
          >
        </section>
      </aside>
    </div></AppLayout
  >
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { onIonViewWillEnter } from '@ionic/vue';
import { calendarFeed } from '@/services/modules/calendar';
import { dateManila } from '@/services/modules/communication';
import { manilaDay, type CalendarItem } from '@/schemas/calendar';
const upcoming = ref<CalendarItem[]>([]),
  upcomingLoading = ref(false),
  upcomingError = ref(false);
async function loadUpcoming() {
  if (!auth.profile) return;
  upcomingLoading.value = true;
  upcomingError.value = false;
  try {
    const now = new Date(),
      later = new Date(now.getTime() + 30 * 86400000);
    const months = [
      ...new Set([
        manilaDay(now.toISOString()).slice(0, 7),
        manilaDay(later.toISOString()).slice(0, 7),
      ]),
    ];
    const rows = (await Promise.all(months.map(calendarFeed))).flat();
    upcoming.value = rows
      .filter(
        (v, i) =>
          Date.parse(v.ends_at) >= now.getTime() &&
          rows.findIndex((x) => x.id === v.id && x.kind === v.kind) === i,
      )
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, 5);
  } catch {
    upcomingError.value = true;
  } finally {
    upcomingLoading.value = false;
  }
}
onIonViewWillEnter(loadUpcoming);
import FeedList from '@/components/feed/FeedList.vue';
import { useAuthStore } from '@/stores/auth';
const auth = useAuthStore();
import { useI18n } from 'vue-i18n';
import { IonIcon } from '@ionic/vue';
import {
  checkmarkDoneOutline,
  walletOutline,
  gridOutline,
  calendarOutline,
} from 'ionicons/icons';
import AppLayout from '@/layouts/AppLayout.vue';
import CiMascot from '@/components/common/CiMascot.vue';
import EmptyState from '@/components/common/EmptyState.vue';
const { t, locale } = useI18n();
const activeFilter = ref('all');
const shortcuts = [
  {
    path: '/attendance',
    title: 'pages.attendance.title',
    caption: 'home.attendanceHint',
    icon: checkmarkDoneOutline,
  },
  {
    path: '/contributions',
    title: 'pages.contributions.title',
    caption: 'home.contributionHint',
    icon: walletOutline,
  },
  {
    path: '/groups',
    title: 'pages.groups.title',
    caption: 'home.groupHint',
    icon: gridOutline,
  },
  {
    path: '/calendar',
    title: 'pages.calendar.title',
    caption: 'home.calendarHint',
    icon: calendarOutline,
  },
];
</script>
