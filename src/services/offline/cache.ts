import { z } from 'zod';
const item = z.object({
  id: z.string().max(100),
  title: z.string().max(500),
  text: z.string().max(20100),
  date: z.string().max(50),
});
const bundle = z.object({
  owner: z.string(),
  session: z.string(),
  savedAt: z.number(),
  announcements: z.array(item).max(30),
  tasks: z.array(item).max(30),
  attendance: z.array(item).max(30),
});
export type OfflineItem = z.infer<typeof item>;
export type OfflineBundle = z.infer<typeof bundle>;
export const cacheKey = 'clead-offline-v1';
let scope: { owner: string; session: string } | null = null;
export function sessionIdentity(token: string) {
  try {
    return JSON.parse(
      atob(token.split('.')[1]!.replaceAll('-', '+').replaceAll('_', '/')),
    ).session_id as string;
  } catch {
    return '';
  }
}
export function clearOffline() {
  scope = null;
  try {
    localStorage.removeItem(cacheKey);
  } catch {
    /* Storage may be unavailable in private browsing. */
  }
}
export function openOfflineScope(owner: string, session: string) {
  try {
    const prior = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (prior && (prior.owner !== owner || prior.session !== session))
      clearOffline();
  } catch {
    clearOffline();
  }
  scope = { owner, session };
}
export function readOffline(
  owner: string,
  session: string,
  now = Date.now(),
): OfflineBundle | null {
  try {
    const value = bundle.safeParse(
      JSON.parse(localStorage.getItem(cacheKey) || 'null'),
    );
    if (
      !value.success ||
      value.data.owner !== owner ||
      value.data.session !== session ||
      now - value.data.savedAt > 86400000 ||
      value.data.savedAt > now + 60000
    )
      return null;
    return value.data;
  } catch {
    return null;
  }
}
export function cacheRecent(
  kind: 'announcements' | 'tasks' | 'attendance',
  items: OfflineItem[],
) {
  if (!scope || !navigator.onLine) return;
  try {
    const old = readOffline(scope.owner, scope.session);
    const next: OfflineBundle = old ?? {
      ...scope,
      savedAt: Date.now(),
      announcements: [],
      tasks: [],
      attendance: [],
    };
    next[kind] = items.map((v) => item.parse(v)).slice(0, 30);
    localStorage.setItem(cacheKey, JSON.stringify(next));
  } catch {
    /* Offline storage must never fail the online workflow. */
  }
}
export function offlineOwner() {
  return scope?.owner ?? null;
}
