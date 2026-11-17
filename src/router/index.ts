import OfflineView from '@/views/OfflineView.vue';
import { createRouter, createWebHistory } from '@ionic/vue-router';
import { pages } from './pages';
import { useAuthStore } from '@/stores/auth';
import { usePwaStore } from '@/stores/app';
import { backendConfigured } from '@/config/env';
import { can } from '@/utils/permissions';
import type { RouteLocationNormalized } from 'vue-router';
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/home' },
    {
      path: '/home',
      component: () => import('@/views/HomeView.vue'),
      meta: { preview: true },
    },
    {
      path: '/login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/onboarding',
      component: () => import('@/views/OnboardingView.vue'),
    },
    ...(
      [
        'profile',
        'preferences',
        'notifications',
        'sessions',
        'password',
      ] as const
    ).map((mode) => ({
      path: mode === 'profile' ? '/profile' : `/settings/${mode}`,
      component: () => import('@/views/AccountView.vue'),
      props: { mode },
    })),
    {
      path: '/administration/terms',
      component: () => import('@/views/AcademicView.vue'),
      meta: { capability: 'academic' },
    },
    {
      path: '/administration/subjects',
      component: () => import('@/views/AcademicView.vue'),
      meta: { capability: 'academic' },
    },
    { path: '/members', component: () => import('@/views/MembersView.vue') },
    {
      path: '/administration',
      component: () => import('@/views/AdministrationView.vue'),
      meta: { capability: 'accounts' },
    },
    { path: '/announcements', component: () => import('@/views/FeedView.vue') },
    {
      path: '/announcements/new',
      component: () => import('@/views/PostEditorView.vue'),
      meta: { capability: 'publish' },
    },
    {
      path: '/announcements/:id',
      component: () => import('@/views/PostDetailView.vue'),
    },
    {
      path: '/announcements/:id/edit',
      component: () => import('@/views/PostEditorView.vue'),
    },
    {
      path: '/discussions/new',
      component: () => import('@/views/PostEditorView.vue'),
    },
    {
      path: '/discussions/review',
      component: () => import('@/views/DiscussionReviewView.vue'),
      meta: { capability: 'publish' },
    },
    {
      path: '/moderation',
      component: () => import('@/views/ModerationView.vue'),
      meta: { capability: 'publish' },
    },
    ...['/groups', '/groups/new', '/groups/:id', '/groups/:id/edit'].map(
      (path) => ({ path, component: () => import('@/views/GroupsView.vue') }),
    ),
    ...['/polls', '/polls/new', '/polls/:id', '/polls/:id/results'].map(
      (path) => ({
        path,
        component: () => import('@/views/PollsView.vue'),
        meta: path === '/polls/new' ? { capability: 'publish' } : {},
      }),
    ),
    ...['/tasks', '/tasks/new', '/tasks/:id', '/tasks/:id/edit'].map(
      (path) => ({
        path,
        component: () => import('@/views/TasksView.vue'),
        meta:
          path === '/tasks/new' || path.endsWith('/edit')
            ? { capability: 'academic' }
            : {},
      }),
    ),
    ...[
      '/attendance',
      '/attendance/new',
      '/attendance/review',
      '/attendance/sessions/:id',
      '/attendance/corrections/new',
    ].map((path) => ({
      path,
      component: () => import('@/views/AttendanceView.vue'),
      meta: ['/attendance/new', '/attendance/review'].includes(path)
        ? { capability: 'attendance' }
        : {},
    })),
    ...[
      '/contributions',
      '/contributions/new',
      '/contributions/:id',
      '/contributions/:id/edit',
      '/contributions/:id/payments',
    ].map((path) => ({
      path,
      component: () => import('@/views/ContributionsView.vue'),
      meta:
        path === '/contributions/new' ||
        path.endsWith('/edit') ||
        path.endsWith('/payments')
          ? { capability: 'contributions' }
          : {},
    })),
    { path: '/calendar', component: () => import('@/views/CalendarView.vue') },
    ...[
      '/calendar/events/new',
      '/calendar/events/:id',
      '/calendar/events/:id/edit',
    ].map((path) => ({
      path,
      component: () => import('@/views/CalendarEventView.vue'),
      meta:
        path.endsWith('/new') || path.endsWith('/edit')
          ? { capability: 'publish' }
          : {},
    })),
    {
      path: '/notifications',
      component: () => import('@/views/NotificationsView.vue'),
    },
    { path: '/search', component: () => import('@/views/SearchView.vue') },
    ...['attendance', 'contributions'].map((kind) => ({
      path: '/reports/' + kind,
      component: () => import('@/views/ReportsView.vue'),
      meta: { capability: kind },
    })),
    ...(['audit', 'analytics'] as const).map((mode) => ({
      path: '/' + mode,
      component: () => import('@/views/InsightsView.vue'),
      props: { mode },
      meta: { capability: 'audit' },
    })),
    {
      path: '/offline',
      component: OfflineView,
      meta: { public: true },
    },
    {
      path: '/report-problem',
      component: () => import('@/views/ProblemView.vue'),
    },
    ...pages
      .filter(
        (page) =>
          ![
            'problem',
            'search',
            'attendanceReports',
            'contributionReports',
            'audit',
            'analytics',
            'calendar',
            'notifications',
            'payments',
            'contributions',
            'contribution',
            'contributionCreate',
            'attendance',
            'attendanceSession',
            'attendanceCorrection',
            'tasks',
            'task',
            'taskCreate',
            'taskEdit',
            'poll',
            'pollResults',
            'groups',
            'group',
            'groupCreate',
            'groupEdit',
            'announcements',
            'announcement',
            'announcementCreate',
            'announcementEdit',
            'discussion',
            'review',
            'moderation',
            'members',
            'administration',
            'terms',
            'subjects',
            'profile',
            'preferences',
            'notificationSettings',
            'sessions',
          ].includes(page.key),
      )
      .map((page) => ({
        path: page.path,
        component: () => import('@/views/ModuleView.vue'),
        props: { page },
        meta: {
          public: [
            'privacy',
            'community',
            'install',
            'splash',
            'notFound',
            'forbidden',
          ].includes(page.key),
          preview:
            !page.capability &&
            !['editor', 'detail', 'report'].includes(page.kind),
          capability: page.capability,
        },
      })),
  ],
});
router.beforeEach(async (to: RouteLocationNormalized) => {
  if (!navigator.onLine && !to.meta.public && to.path !== '/login')
    return '/offline';
  if (to.path === '/offline') return true;
  const auth = useAuthStore();
  if (!auth.ready || (backendConfigured && navigator.onLine))
    await auth.refresh();
  if (to.meta.public || to.path === '/login') return true;
  if (auth.unavailable) return '/login';
  if (!auth.profile)
    return !backendConfigured && to.meta.preview ? true : { path: '/login' };
  if (!auth.onboarded && to.path !== '/onboarding') return '/onboarding';
  if (auth.onboarded && to.path === '/onboarding') return '/home';
  if (to.path !== '/onboarding' && usePwaStore().needsInstall)
    return '/install';
  if (
    to.meta.capability &&
    !can(auth.profile.role, to.meta.capability as Parameters<typeof can>[1])
  )
    return '/forbidden';
  return true;
});
