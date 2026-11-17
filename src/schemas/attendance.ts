import { z } from 'zod';
export const attendanceStatus = z.enum([
  'present',
  'late',
  'absent',
  'excused',
]);
export const attendanceSchema = z
  .object({
    semester_id: z.uuid(),
    subject_id: z.uuid().nullable(),
    title: z.string().trim().min(1).max(160),
    kind: z.enum(['subject', 'meeting', 'seminar', 'event', 'activity']),
    occurred_at: z.string().datetime({ offset: true }),
  })
  .refine((v) =>
    v.kind === 'subject' ? !!v.subject_id : v.subject_id === null,
  );
export interface AttendanceSession {
  id: string;
  semester_id: string;
  subject_id: string | null;
  title: string;
  kind: 'subject' | 'meeting' | 'seminar' | 'event' | 'activity';
  occurred_at: string;
  archived_at: string | null;
}
export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  status: z.infer<typeof attendanceStatus>;
  updated_at: string;
}
export interface AttendanceCorrection {
  id: string;
  record_id: string;
  requester_id: string;
  previous_status: string;
  requested_status: string;
  reason: string;
  state: 'pending' | 'approved' | 'rejected';
  reviewer_id: string | null;
  decision_reason: string | null;
  created_at: string;
  decided_at: string | null;
}
