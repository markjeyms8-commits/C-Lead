import { z } from 'zod';
export const eventSchema = z
  .object({
    semester_id: z.uuid(),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(5000),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
    reason: z.string().trim().max(500),
  })
  .refine((v) => Date.parse(v.ends_at) > Date.parse(v.starts_at));
export interface CalendarItem {
  id: string;
  kind: 'task' | 'poll' | 'contribution' | 'announcement' | 'event';
  title: string;
  starts_at: string;
  ends_at: string;
  path: string;
}
export interface CalendarEvent {
  id: string;
  semester_id: string;
  creator_id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  archived_at: string | null;
}
export const manilaDay = (date: string | number) =>
  new Date(new Date(date).getTime() + 8 * 3600000).toISOString().slice(0, 10);
export function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month');
  const [year, value] = month.split('-').map(Number);
  if (!year || !value || value > 12) throw new Error('month');
  return {
    start: new Date(Date.UTC(year, value - 1, 1) - 8 * 3600000).toISOString(),
    end: new Date(Date.UTC(year, value, 1) - 8 * 3600000).toISOString(),
  };
}
