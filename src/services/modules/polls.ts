import { requireClient } from '@/services/supabase/client';
import { rpc } from './communication';
import {
  pollSchema,
  type Poll,
  type PollOption,
  type PollResults,
} from '@/schemas/polls';
export async function listPolls(page = 0): Promise<Poll[]> {
  const r = await requireClient()
    .from('polls')
    .select('*')
    .order('created_at', { ascending: false })
    .range(page * 20, page * 20 + 19);
  if (r.error) throw r.error;
  return r.data as Poll[];
}
export async function getPoll(id: string): Promise<Poll> {
  const r = await requireClient()
    .from('polls')
    .select('*')
    .eq('id', id)
    .single();
  if (r.error) throw r.error;
  return r.data as Poll;
}
export async function pollOptions(id: string): Promise<PollOption[]> {
  const r = await requireClient()
    .from('poll_options')
    .select('*')
    .eq('poll_id', id)
    .order('position');
  if (r.error) throw r.error;
  return r.data as PollOption[];
}
export const myVote = (id: string) =>
  rpc('my_poll_vote', { target_poll: id }) as Promise<string[]>;
export const pollResults = (id: string) =>
  rpc('poll_results', { target_poll: id }) as Promise<PollResults>;
export const vote = (id: string, choices: string[]) =>
  rpc('vote_poll', { target_poll: id, selected_options: choices });
export async function createPoll(input: unknown) {
  const p = pollSchema.parse(input);
  return (await rpc('create_poll', {
    term_id: p.semester_id,
    poll_question: p.question,
    labels: p.options,
    multiple: p.multiple_choice,
    is_anonymous: p.anonymous,
    closes_at: p.deadline,
    visibility: p.result_visibility,
    can_change: p.allow_changes,
  })) as string;
}
