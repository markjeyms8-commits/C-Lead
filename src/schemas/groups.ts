import { z } from 'zod';
export const groupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  subject_id: z.uuid(),
  members: z.array(z.uuid()).max(50),
  reason: z.string().trim().max(500),
});
export interface SubjectGroup {
  id: string;
  name: string;
  subject_id: string;
  creator_id: string;
  mention_handle: string;
  archived_at: string | null;
  created_at: string;
}
export interface GroupMembership {
  group_id: string;
  user_id: string;
}
