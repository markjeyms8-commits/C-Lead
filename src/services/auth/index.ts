import { requireClient } from '@/services/supabase/client';
import { loginSchema, passwordSchema } from '@/schemas/auth';
import type { NotificationChoices } from '@/constants/notifications';
export class LoginError extends Error {
  constructor(public retryAfter = 0) {
    super('auth.failed');
  }
}
export async function login(input: unknown) {
  const data = loginSchema.parse(input);
  const client = requireClient();
  const { data: response, error } = await client.functions.invoke(
    'username-login',
    { body: data },
  );
  if (error || !response?.session) {
    let retryAfter = 0;
    if (error && 'context' in error && error.context instanceof Response) {
      try {
        const body = await error.context.json();
        retryAfter = Math.min(900, Math.max(0, Number(body.retry_after) || 0));
      } catch {
        /* Generic error without credentials. */
      }
    }
    throw new LoginError(retryAfter);
  }
  const { error: sessionError } = await client.auth.setSession(
    response.session,
  );
  if (sessionError) throw new Error('auth.failed');
}
export async function changePassword(password: string) {
  passwordSchema.parse(password);
  if (!navigator.onLine) throw new Error('offline');
  const { error } = await requireClient().functions.invoke('change-password', {
    body: { password },
  });
  if (error) throw new Error('auth.failed');
}
export async function acceptPolicies(
  language: string,
  theme: string,
  notifications: NotificationChoices,
) {
  const { error } = await requireClient().rpc('complete_onboarding', {
    chosen_language: language,
    chosen_theme: theme,
    notification_choices: notifications,
    privacy_accepted: true,
    community_accepted: true,
    tour_completed: true,
  });
  if (error) throw error;
}
