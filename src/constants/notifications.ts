export const notificationCategories = [
  'announcements',
  'polls',
  'contributions',
  'discussions',
  'comments',
  'tasks',
  'attendance',
  'attendance_corrections',
  'groups',
  'reactions',
  'mentions',
  'discussion_decisions',
] as const;
export type NotificationCategory = (typeof notificationCategories)[number];
export type NotificationChoices = Record<NotificationCategory, boolean>;
export const defaultNotificationChoices = (): NotificationChoices =>
  Object.fromEntries(
    notificationCategories.map((category) => [category, true]),
  ) as NotificationChoices;
