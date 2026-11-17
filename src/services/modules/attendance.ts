import { cacheRecent, offlineOwner } from '@/services/offline/cache';
import { requireClient } from '@/services/supabase/client';
import { rpc } from './communication';
import {
  attendanceSchema,
  type AttendanceSession,
  type AttendanceRecord,
  type AttendanceCorrection,
} from '@/schemas/attendance';
export async function attendanceRows<T>(
  table:
    'attendance_sessions' | 'attendance_records' | 'attendance_corrections',
  column?: string,
  value?: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 100) {
    let q = requireClient()
      .from(table)
      .select('*')
      .order('id')
      .range(offset, offset + 99);
    if (column && value) q = q.eq(column, value);
    const r = await q;
    if (r.error) throw r.error;
    rows.push(...(r.data as T[]));
    if (r.data.length < 100) return rows;
  }
}
export const attendanceSessions = () =>
  attendanceRows<AttendanceSession>('attendance_sessions');
export async function attendanceRecords(session?: string) {
  const rows = await attendanceRows<AttendanceRecord>(
    'attendance_records',
    session ? 'session_id' : undefined,
    session,
  );
  cacheRecent(
    'attendance',
    rows
      .filter((r) => r.student_id === offlineOwner())
      .map((r) => ({
        id: r.id,
        title: '',
        text: r.status,
        date: r.updated_at,
      })),
  );
  return rows;
}
export const attendanceCorrections = () =>
  attendanceRows<AttendanceCorrection>('attendance_corrections');
export async function createAttendance(input: unknown) {
  const v = attendanceSchema.parse(input);
  return (await rpc('create_attendance', {
    term_id: v.semester_id,
    session_subject: v.subject_id,
    session_title: v.title,
    session_kind: v.kind,
    session_time: v.occurred_at,
  })) as string;
}
export const markAttendance = (id: string, status: string, reason: string) =>
  rpc('mark_attendance', {
    target_record: id,
    new_status: status,
    change_reason: reason,
  });
export const requestCorrection = (id: string, status: string, reason: string) =>
  rpc('request_attendance_correction', {
    target_record: id,
    new_status: status,
    change_reason: reason,
  });
export const reviewCorrection = (
  id: string,
  decision: string,
  reason: string,
) =>
  rpc('review_attendance_correction', {
    correction_id: id,
    decision,
    review_reason: reason,
  });
