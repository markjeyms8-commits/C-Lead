import type { RichBlock } from '@/schemas/communication';
export type PostState =
  'draft' | 'pending' | 'approved' | 'rejected' | 'published' | 'archived';
export interface Post {
  id: string;
  semester_id: string;
  author_id: string;
  kind: 'announcement' | 'discussion';
  title: string;
  body: RichBlock[];
  state: PostState;
  pinned: boolean;
  publish_at: string | null;
  expires_at: string | null;
  edited_at: string | null;
  hidden_at: string | null;
  deletion_requested_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  edited_at: string | null;
  hidden_at: string | null;
  deleted_at: string | null;
  created_at: string;
}
export type ReactionName =
  'like' | 'love' | 'laugh' | 'surprised' | 'sad' | 'support';
export interface Reaction {
  id: string;
  post_id: string;
  comment_id: string | null;
  user_id: string;
  reaction: ReactionName;
}
export interface ContentReport {
  id: string;
  post_id: string;
  comment_id: string | null;
  reporter_id: string;
  reason: string;
  state: string;
  moderator_id: string | null;
  decision_reason: string | null;
  created_at: string;
}
export interface Decision {
  id: string;
  post_id: string;
  reviewer_id: string;
  decision: string;
  reason: string;
  created_at: string;
}
