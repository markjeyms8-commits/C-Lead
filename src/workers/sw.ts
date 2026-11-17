/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  precacheAndRoute,
  createHandlerBoundToURL,
} from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
  }),
);
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
function notificationPath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\r\n]/.test(value)
  )
    return '/notifications';
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin
      ? url.pathname + url.search + url.hash
      : '/notifications';
  } catch {
    return '/notifications';
  }
}
self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; path?: string; tag?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    /* Ignore invalid payload */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'C-LEAD', {
      body: data.body || '',
      icon: '/icon-192.png',
      tag: typeof data.tag === 'string' ? data.tag.slice(0, 80) : undefined,
      data: {
        path: notificationPath(data.path),
      },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.openWindow(
      new URL(
        notificationPath(event.notification.data?.path),
        self.location.origin,
      ).href,
    ),
  );
});
