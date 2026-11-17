import { requireClient } from '@/services/supabase/client';
import { rpc } from './communication';
import {
  groupSchema,
  type SubjectGroup,
  type GroupMembership,
} from '@/schemas/groups';
export async function groupRows<T>(
  table: 'subject_groups' | 'group_members' | 'group_membership_history',
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 100) {
    let query = requireClient()
      .from(table)
      .select('*')
      .order('created_at')
      .range(offset, offset + 99);
    query =
      table === 'group_members'
        ? query.order('group_id').order('user_id')
        : query.order('id');
    const r = await query;
    if (r.error) throw r.error;
    rows.push(...(r.data as T[]));
    if (r.data.length < 100) return rows;
  }
}
export const listGroups = () => groupRows<SubjectGroup>('subject_groups');
export const listMemberships = () =>
  groupRows<GroupMembership>('group_members');
export async function saveGroup(id: string | null, input: unknown) {
  const v = groupSchema.parse(input);
  return (await rpc('save_group', {
    target_group: id,
    group_name: v.name,
    group_subject: v.subject_id,
    members: v.members,
    change_reason: v.reason || null,
  })) as string;
}
export async function moderateGroup(
  id: string,
  decision: string,
  reason: string,
) {
  return rpc('moderate_group', {
    target_group: id,
    decision,
    change_reason: reason,
  });
}
