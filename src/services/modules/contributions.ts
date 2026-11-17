import { requireClient } from '@/services/supabase/client';
import { rpc } from './communication';
import {
  contributionSchema,
  type Contribution,
  type ContributionRecord,
  type ContributionSummary,
} from '@/schemas/contributions';
export async function listContributions(page = 0): Promise<Contribution[]> {
  const r = await requireClient()
    .from('contributions')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id')
    .range(page * 20, page * 20 + 19);
  if (r.error) throw r.error;
  return r.data as Contribution[];
}
export async function getContribution(id: string): Promise<Contribution> {
  const r = await requireClient()
    .from('contributions')
    .select('*')
    .eq('id', id)
    .single();
  if (r.error) throw r.error;
  return r.data as Contribution;
}
export async function contributionRecords(
  id: string,
): Promise<ContributionRecord[]> {
  const rows: ContributionRecord[] = [];
  for (let offset = 0; ; offset += 100) {
    const r = await requireClient()
      .from('contribution_records')
      .select('*')
      .eq('contribution_id', id)
      .order('id')
      .range(offset, offset + 99);
    if (r.error) throw r.error;
    rows.push(...(r.data as ContributionRecord[]));
    if (r.data.length < 100) return rows;
  }
}
export const contributionSummary = (id: string) =>
  rpc('contribution_summary', {
    target_contribution: id,
  }) as Promise<ContributionSummary>;
export async function saveContribution(id: string | null, input: unknown) {
  const v = contributionSchema.parse(input);
  return (await rpc('save_contribution', {
    target_contribution: id,
    term_id: v.semester_id,
    contribution_title: v.title,
    contribution_purpose: v.purpose,
    required_cent: Math.round(Number(v.amount) * 100),
    due_at: v.deadline,
    change_reason: v.reason || null,
  })) as string;
}
export const markContribution = (id: string, status: string, reason: string) =>
  rpc('mark_contribution', {
    target_record: id,
    new_status: status,
    change_reason: reason,
  });
