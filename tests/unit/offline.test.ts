import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  cacheRecent,
  readOffline,
  openOfflineScope,
  clearOffline,
  cacheKey,
} from '../../src/services/offline/cache';
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
  vi.stubGlobal('navigator', { onLine: true });
  clearOffline();
});
afterEach(() => vi.unstubAllGlobals());
it('isolates recent copies by account and session and purges on account changes', () => {
  openOfflineScope('a', 'session-a');
  cacheRecent('tasks', [{ id: 'task', title: 'Mine', text: 'Text', date: '' }]);
  expect(readOffline('a', 'session-a')?.tasks).toHaveLength(1);
  expect(readOffline('b', 'session-a')).toBeNull();
  expect(readOffline('a', 'session-b')).toBeNull();
  openOfflineScope('b', 'session-b');
  expect(values.has(cacheKey)).toBe(false);
});
it('expires snapshots, rejects malformed storage, and never queues offline writes', () => {
  openOfflineScope('a', 's');
  cacheRecent('announcements', [
    { id: '1', title: 'Title', text: 'Text', date: '' },
  ]);
  expect(readOffline('a', 's', Date.now() + 86400001)).toBeNull();
  vi.stubGlobal('navigator', { onLine: false });
  cacheRecent('tasks', [{ id: '2', title: 'Offline', text: 'Text', date: '' }]);
  expect(readOffline('a', 's')?.tasks).toHaveLength(0);
  values.set(cacheKey, 'invalid');
  expect(readOffline('a', 's')).toBeNull();
  clearOffline();
  expect(values.size).toBe(0);
});
it('preserves the full supported announcement text rather than a truncated excerpt', () => {
  openOfflineScope('a', 'session-a');
  const text = 'x'.repeat(20000) + '\n'.repeat(49);
  cacheRecent('announcements', [
    { id: 'post', title: 'Long notice', text, date: '' },
  ]);
  expect(readOffline('a', 'session-a')?.announcements[0]?.text).toBe(text);
});
