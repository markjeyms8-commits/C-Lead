import { requireClient } from '@/services/supabase/client';
import { rpc } from './communication';
import {
  eventSchema,
  monthRange,
  type CalendarItem,
  type CalendarEvent,
} from '@/schemas/calendar';
export async function calendarFeed(month: string): Promise<CalendarItem[]> {
  const range = monthRange(month),
    rows: CalendarItem[] = [];
  for (let offset = 0; ; offset += 100) {
    const r = await requireClient()
      .rpc('calendar_feed', { range_start: range.start, range_end: range.end })
      .range(offset, offset + 99);
    if (r.error) throw r.error;
    rows.push(...(r.data as CalendarItem[]));
    if (r.data.length < 100) return rows;
  }
}
export async function calendarEvent(id: string): Promise<CalendarEvent> {
  const r = await requireClient()
    .from('calendar_events')
    .select('*')
    .eq('id', id)
    .single();
  if (r.error) throw r.error;
  return r.data as CalendarEvent;
}
export async function saveEvent(id: string | null, input: unknown) {
  const v = eventSchema.parse(input);
  return (await rpc('save_calendar_event', {
    target_event: id,
    term_id: v.semester_id,
    event_title: v.title,
    event_description: v.description,
    start_time: v.starts_at,
    end_time: v.ends_at,
    change_reason: v.reason || null,
  })) as string;
}
