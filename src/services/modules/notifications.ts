import { requireClient } from '@/services/supabase/client';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
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
export const nativeAndroidPush =
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
export const pushConfigured = () => nativeAndroidPush || !!vapidPublicKey;
export const pushSupported = () =>
  nativeAndroidPush ||
  (typeof Notification !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window);
export async function pushEnabled() {
  if (nativeAndroidPush)
    return (await rpc('my_native_push_enabled', {})) as boolean;
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
  if (nativeAndroidPush) {
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive !== 'granted')
      permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') throw new Error('Permission denied');
    const token = await nativeRegistrationToken();
    await rpc('register_native_push', { device_token: token });
    return;
  }
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
  if (nativeAndroidPush) {
    await rpc('disable_native_push', {});
    return;
  }
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await rpc('disable_push', { push_endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
function nativeRegistrationToken() {
  return new Promise<string>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    let registration: Awaited<ReturnType<typeof PushNotifications.addListener>>;
    let registrationError: Awaited<
      ReturnType<typeof PushNotifications.addListener>
    >;
    const finish = async (error?: Error, token?: string) => {
      clearTimeout(timeout);
      await Promise.allSettled([
        registration?.remove(),
        registrationError?.remove(),
      ]);
      if (error) reject(error);
      else if (token) resolve(token);
      else reject(new Error('Push registration failed'));
    };
    void (async () => {
      registration = await PushNotifications.addListener(
        'registration',
        ({ value }) => void finish(undefined, value),
      );
      registrationError = await PushNotifications.addListener(
        'registrationError',
        () => void finish(new Error('Push registration failed')),
      );
      timeout = setTimeout(
        () => void finish(new Error('Push registration timed out')),
        15000,
      );
      try {
        await PushNotifications.register();
      } catch {
        await finish(new Error('Push registration failed'));
      }
    })().catch(() => void finish(new Error('Push registration failed')));
  });
}
export async function refreshNativePushIfEnabled() {
  if (!nativeAndroidPush) return;
  if (!(await pushEnabled())) return;
  const permission = await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted') return;
  const token = await nativeRegistrationToken();
  await rpc('register_native_push', { device_token: token });
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
