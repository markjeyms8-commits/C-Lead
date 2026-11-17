import { requireClient } from '@/services/supabase/client';
import { rpc } from './communication';
export interface Notice {
  id: string;
  category: string;
  title: string;
  body: string;
  path: string;
  read_at: string | null;
  created_at: string;
}
export function safeInternalPath(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return value.startsWith('/') &&
      !value.startsWith('//') &&
      !/[\\\r\n]/.test(value) &&
      url.origin === window.location.origin
      ? url.pathname + url.search + url.hash
      : '/notifications';
  } catch {
    return '/notifications';
  }
}
export async function notices(page = 0, unread = false): Promise<Notice[]> {
  let q = requireClient()
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id')
    .range(page * 20, page * 20 + 19);
  if (unread) q = q.is('read_at', null);
  const r = await q;
  if (r.error) throw r.error;
  return r.data as Notice[];
}
export async function markNotice(id: string) {
  const r = await requireClient()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (r.error) throw r.error;
}
export async function markAllNotices() {
  const r = await requireClient()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (r.error) throw r.error;
}
export const vapidPublicKey =
  typeof import.meta.env.VITE_VAPID_PUBLIC_KEY === 'string' &&
  /^[A-Za-z0-9_-]{87}$/.test(import.meta.env.VITE_VAPID_PUBLIC_KEY)
    ? import.meta.env.VITE_VAPID_PUBLIC_KEY
    : null;
export const pushSupported = () =>
  typeof Notification !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window;
export async function pushEnabled() {
  if (!pushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription
    ? ((await rpc('my_push_enabled', {
        push_endpoint: subscription.endpoint,
      })) as boolean)
    : false;
}
function publicKeyBytes(value: string) {
  const raw = atob(value.replaceAll('-', '+').replaceAll('_', '/') + '=');
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export async function enablePush() {
  if (!pushSupported() || !vapidPublicKey) throw new Error('Unavailable');
  if ((await Notification.requestPermission()) !== 'granted')
    throw new Error('Permission denied');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Service worker unavailable')),
        10000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
  const key = publicKeyBytes(vapidPublicKey);
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const existing = subscription.options.applicationServerKey;
    if (
      !existing ||
      existing.byteLength !== key.byteLength ||
      Array.from(new Uint8Array(existing)).some((v, i) => key[i] !== v)
    ) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  const created = !subscription;
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });
  try {
    const json = subscription.toJSON();
    await rpc('register_push', {
      push_endpoint: subscription.endpoint,
      push_p256dh: json.keys?.p256dh,
      push_auth: json.keys?.auth,
    });
  } catch (error) {
    if (created) await subscription.unsubscribe();
    throw error;
  }
}
export async function disablePush() {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await rpc('disable_push', { push_endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
export function watchNotices(refresh: () => void) {
  const client = requireClient();
  const channel = client
    .channel('notice-center-' + crypto.randomUUID())
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications' },
      refresh,
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
