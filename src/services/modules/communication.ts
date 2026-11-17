import { cacheRecent } from '@/services/offline/cache';
import { requireClient } from '@/services/supabase/client';
import type {
  Post,
  Comment,
  Reaction,
  ContentReport,
  Decision,
  ReactionName,
} from '@/types/communication';
import {
  postSchema,
  commentSchema,
  moderationReason,
} from '@/schemas/communication';
export type FeedMode = 'active' | 'archive' | 'mine' | 'review';
export async function feed(
  mode: FeedMode,
  kind: string,
  page: number,
): Promise<Post[]> {
  const r = await requireClient().rpc('communication_feed', {
    feed_mode: mode,
    post_kind: kind,
    page_offset: page * 20,
  });
  if (r.error) throw r.error;
  if (mode === 'active' && page === 0 && kind !== 'discussion') {
    cacheRecent(
      'announcements',
      (r.data as Post[])
        .filter(
          (p) =>
            p.kind === 'announcement' &&
            p.state === 'published' &&
            (!p.publish_at || Date.parse(p.publish_at) <= Date.now()),
        )
        .map((p) => ({
          id: p.id,
          title: p.title,
          text: p.body.map((b) => b.text).join('\n'),
          date: p.publish_at ?? '',
        })),
    );
  }
  return r.data as Post[];
}
export async function postDetail(id: string): Promise<Post> {
  const r = await requireClient()
    .from('posts')
    .select('*')
    .eq('id', id)
    .single();
  if (r.error) throw r.error;
  return r.data as Post;
}
async function allRows<T>(table: string, postId?: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 100) {
    let query = requireClient()
      .from(table)
      .select('*')
      .order('created_at')
      .order('id')
      .range(offset, offset + 99);
    if (postId) query = query.eq('post_id', postId);
    const result = await query;
    if (result.error) throw result.error;
    rows.push(...(result.data as T[]));
    if (result.data.length < 100) return rows;
  }
}
export async function postComments(id: string): Promise<Comment[]> {
  return allRows<Comment>('comments', id);
}
export async function postReactions(id: string): Promise<Reaction[]> {
  return allRows<Reaction>('reactions', id);
}
export async function postDecisions(id: string): Promise<Decision[]> {
  return allRows<Decision>('discussion_decisions', id);
}
export async function rpc(name: string, args: Record<string, unknown>) {
  const r = await requireClient().rpc(name, args);
  if (r.error) throw r.error;
  return r.data;
}
export async function savePost(
  post: Pick<
    Post,
    | 'title'
    | 'semester_id'
    | 'body'
    | 'kind'
    | 'state'
    | 'publish_at'
    | 'expires_at'
    | 'pinned'
  >,
  id: string | null,
) {
  postSchema.parse(post);
  return (await rpc('save_post', {
    target_post: id,
    post_kind: post.kind,
    term_id: post.semester_id,
    post_title: post.title,
    content: post.body,
    desired_state: post.state,
    publish_time: post.publish_at,
    expiry_time: post.expires_at,
    is_pinned: post.pinned,
  })) as string;
}
export async function saveComment(
  postId: string,
  id: string | null,
  parent: string | null,
  body: string,
) {
  return (await rpc('save_comment', {
    target_comment: id,
    target_post: postId,
    parent_comment: parent,
    comment_body: commentSchema.parse(body),
  })) as string;
}
export async function react(
  postId: string,
  commentId: string | null,
  reaction: ReactionName | null,
) {
  await rpc('set_reaction', {
    target_post: postId,
    target_comment: commentId,
    chosen_reaction: reaction,
  });
}
export async function report(
  postId: string,
  commentId: string | null,
  reason: string,
) {
  await rpc('report_content', {
    target_post: postId,
    target_comment: commentId,
    report_reason: moderationReason.parse(reason),
  });
}
export async function review(postId: string, decision: string, reason: string) {
  await rpc('review_discussion', {
    target_post: postId,
    decision,
    decision_reason: moderationReason.parse(reason),
  });
}
export async function reports(): Promise<ContentReport[]> {
  return (await allRows<ContentReport>('content_reports')).reverse();
}
export async function moderate(id: string, decision: string, reason: string) {
  await rpc('moderate_report', {
    report_id: id,
    decision,
    moderation_reason: moderationReason.parse(reason),
  });
}
export function watchCommunication(refresh: () => void) {
  const client = requireClient();
  const channel = client.channel(`communication-${crypto.randomUUID()}`);
  for (const table of ['posts', 'comments', 'reactions', 'content_reports'])
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      refresh,
    );
  channel.subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
export const dateManila = (value: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value));
export const fromManila = (value: string) =>
  value ? new Date(`${value}:00+08:00`).toISOString() : null;
export const toManila = (value: string | null) =>
  value
    ? new Date(new Date(value).getTime() + 8 * 3600000)
        .toISOString()
        .slice(0, 16)
    : '';
export async function mentionChoices() {
  const client = requireClient();
  const people = await client
    .from('profiles')
    .select('id,full_name,username')
    .eq('active', true)
    .order('full_name');
  if (people.error) throw people.error;
  const groups = await client
    .from('subject_groups')
    .select('id,name,mention_handle')
    .is('archived_at', null)
    .is('deleted_at', null)
    .order('name');
  if (groups.error) throw groups.error;
  return {
    people: people.data as {
      id: string;
      full_name: string;
      username: string;
    }[],
    groups: groups.data as {
      id: string;
      name: string;
      mention_handle: string;
    }[],
  };
}
