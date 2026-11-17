import type { Capability } from '@/types/domain';
export interface PageDefinition {
  key: string;
  path: string;
  kind: string;
  capability?: Capability;
}
export const pages: PageDefinition[] = [
  {
    key: 'announcements',
    path: '/announcements',
    kind: 'list',
  },
  {
    key: 'announcement',
    path: '/announcements/:id',
    kind: 'detail',
  },
  {
    key: 'announcementCreate',
    path: '/announcements/new',
    kind: 'editor',
    capability: 'publish',
  },
  {
    key: 'announcementEdit',
    path: '/announcements/:id/edit',
    kind: 'editor',
    capability: 'publish',
  },
  {
    key: 'discussion',
    path: '/discussions/new',
    kind: 'editor',
  },
  {
    key: 'review',
    path: '/discussions/review',
    kind: 'list',
    capability: 'publish',
  },
  {
    key: 'poll',
    path: '/polls/:id',
    kind: 'detail',
  },
  {
    key: 'pollResults',
    path: '/polls/:id/results',
    kind: 'detail',
  },
  {
    key: 'tasks',
    path: '/tasks',
    kind: 'list',
  },
  {
    key: 'task',
    path: '/tasks/:id',
    kind: 'detail',
  },
  {
    key: 'taskCreate',
    path: '/tasks/new',
    kind: 'editor',
    capability: 'academic',
  },
  {
    key: 'taskEdit',
    path: '/tasks/:id/edit',
    kind: 'editor',
    capability: 'academic',
  },
  {
    key: 'attendance',
    path: '/attendance',
    kind: 'attendance',
  },
  {
    key: 'attendanceSession',
    path: '/attendance/sessions/:id',
    kind: 'detail',
    capability: 'attendance',
  },
  {
    key: 'attendanceCorrection',
    path: '/attendance/corrections/new',
    kind: 'editor',
  },
  {
    key: 'contributions',
    path: '/contributions',
    kind: 'contributions',
  },
  {
    key: 'contribution',
    path: '/contributions/:id',
    kind: 'detail',
  },
  {
    key: 'contributionCreate',
    path: '/contributions/new',
    kind: 'editor',
    capability: 'contributions',
  },
  {
    key: 'payments',
    path: '/contributions/:id/payments',
    kind: 'list',
    capability: 'contributions',
  },
  {
    key: 'calendar',
    path: '/calendar',
    kind: 'calendar',
  },
  {
    key: 'groups',
    path: '/groups',
    kind: 'list',
  },
  {
    key: 'group',
    path: '/groups/:id',
    kind: 'detail',
  },
  {
    key: 'groupCreate',
    path: '/groups/new',
    kind: 'editor',
  },
  {
    key: 'groupEdit',
    path: '/groups/:id/edit',
    kind: 'editor',
  },
  {
    key: 'members',
    path: '/members',
    kind: 'list',
  },
  {
    key: 'administration',
    path: '/administration',
    kind: 'list',
    capability: 'accounts',
  },
  {
    key: 'terms',
    path: '/administration/terms',
    kind: 'list',
    capability: 'academic',
  },
  {
    key: 'subjects',
    path: '/administration/subjects',
    kind: 'list',
    capability: 'academic',
  },
  {
    key: 'notifications',
    path: '/notifications',
    kind: 'list',
  },
  {
    key: 'search',
    path: '/search',
    kind: 'list',
  },
  {
    key: 'attendanceReports',
    path: '/reports/attendance',
    kind: 'report',
    capability: 'attendance',
  },
  {
    key: 'contributionReports',
    path: '/reports/contributions',
    kind: 'report',
    capability: 'contributions',
  },
  {
    key: 'moderation',
    path: '/moderation',
    kind: 'list',
    capability: 'publish',
  },
  {
    key: 'audit',
    path: '/audit',
    kind: 'list',
    capability: 'audit',
  },
  {
    key: 'analytics',
    path: '/analytics',
    kind: 'detail',
    capability: 'audit',
  },
  {
    key: 'profile',
    path: '/profile',
    kind: 'profile',
  },
  {
    key: 'preferences',
    path: '/settings/preferences',
    kind: 'settings',
  },
  {
    key: 'notificationSettings',
    path: '/settings/notifications',
    kind: 'settings',
  },
  {
    key: 'sessions',
    path: '/settings/sessions',
    kind: 'list',
  },
  {
    key: 'problem',
    path: '/report-problem',
    kind: 'editor',
  },
  {
    key: 'privacy',
    path: '/privacy',
    kind: 'policy',
  },
  {
    key: 'community',
    path: '/community-guidelines',
    kind: 'policy',
  },
  {
    key: 'install',
    path: '/install',
    kind: 'install',
  },
  {
    key: 'splash',
    path: '/splash',
    kind: 'splash',
  },
  {
    key: 'forbidden',
    path: '/forbidden',
    kind: 'detail',
  },
  {
    key: 'notFound',
    path: '/:pathMatch(.*)*',
    kind: 'detail',
  },
];
