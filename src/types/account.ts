import type { NotificationChoices } from '@/constants/notifications';
export interface AccountPreferences {
  language: 'en' | 'fil';
  theme: 'light' | 'dark';
  tour_completed_at: string | null;
  notifications: NotificationChoices;
}
export interface DeviceSession {
  id: string;
  device_label: string;
  created_at: string;
  is_current: boolean;
}
