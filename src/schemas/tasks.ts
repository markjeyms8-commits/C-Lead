import { z } from 'zod';
export const taskSchema = z
  .object({
    subject_id: z.uuid(),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(10000),
    deadline: z.string().datetime({ offset: true }),
    target_type: z.enum(['class', 'group', 'individual']),
    target_group_id: z.uuid().nullable(),
    target_user_id: z.uuid().nullable(),
    reminder_minutes: z.array(z.number().int().min(1).max(10080)).max(5),
    reason: z.string().trim().max(500),
  })
  .refine((v) =>
    v.target_type === 'class'
      ? !v.target_group_id && !v.target_user_id
      : v.target_type === 'group'
        ? !!v.target_group_id && !v.target_user_id
        : !v.target_group_id && !!v.target_user_id,
  );
export interface Task {
  id: string;
  subject_id: string;
  creator_id: string;
  title: string;
  description: string;
  deadline: string;
  target_type: 'class' | 'group' | 'individual';
  target_group_id: string | null;
  target_user_id: string | null;
  reminder_minutes: number[];
  status: 'active' | 'archived';
  created_at: string;
}
export interface TaskProgress {
  student_id: string;
  full_name: string;
  completed: boolean;
  overdue: boolean;
  locked: boolean;
  revoked_at: string | null;
}
