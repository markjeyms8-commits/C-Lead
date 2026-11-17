import { requireClient } from '@/services/supabase/client';
import {
  defaultNotificationChoices,
  notificationCategories,
} from '@/constants/notifications';
import type { AccountPreferences, DeviceSession } from '@/types/account';
export async function loadAccount() {
  const client = requireClient();
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) return null;
  const active = await client.rpc('is_active_session');
  if (active.error) throw active.error;
  if (!active.data) return { session, invalid: true as const };
  const [profile, policies, preferences, choices] = await Promise.all([
    client
      .from('profiles')
      .select('id,full_name,username,role,active')
      .eq('id', session.user.id)
      .single(),
    client
      .from('policy_acceptances')
      .select('policy')
      .eq('user_id', session.user.id)
      .eq('version', '1.0'),
    client
      .from('preferences')
      .select('language,theme,tour_completed_at')
      .eq('user_id', session.user.id)
      .maybeSingle(),
    client
      .from('notification_preferences')
      .select('category,enabled')
      .eq('user_id', session.user.id),
  ]);
  for (const result of [profile, policies, preferences, choices])
    if (result.error) throw result.error;
  const notifications = defaultNotificationChoices();
  for (const row of choices.data ?? [])
    if (notificationCategories.includes(row.category))
      notifications[row.category as keyof typeof notifications] = row.enabled;
  const settings: AccountPreferences = {
    language: preferences.data?.language ?? 'en',
    theme: preferences.data?.theme ?? 'light',
    tour_completed_at: preferences.data?.tour_completed_at ?? null,
    notifications,
  };
  return {
    session,
    invalid: false as const,
    profile: profile.data,
    settings,
    onboarded:
      !!settings.tour_completed_at &&
      ['privacy', 'community'].every((policy) =>
        policies.data?.some((row) => row.policy === policy),
      ),
  };
}
export async function savePreferences(settings: AccountPreferences) {
  if (!navigator.onLine) throw new Error('offline');
  const { error } = await requireClient().rpc('save_my_preferences', {
    chosen_language: settings.language,
    chosen_theme: settings.theme,
    notification_choices: settings.notifications,
  });
  if (error) throw error;
}
export async function listSessions(): Promise<DeviceSession[]> {
  const { data, error } = await requireClient().rpc('my_sessions');
  if (error) throw error;
  return data ?? [];
}
export async function revokeSession(id: string) {
  if (!navigator.onLine) throw new Error('offline');
  const { error } = await requireClient().rpc('revoke_my_session', {
    target_session: id,
  });
  if (error) throw error;
}
export async function loadStudentNumber(id: string): Promise<string> {
  const { data, error } = await requireClient().rpc('student_number_for', {
    student_id: id,
  });
  if (error) throw error;
  return data ?? '';
}
