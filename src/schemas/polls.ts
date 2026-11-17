import { z } from 'zod';
export const pollSchema = z.object({
  semester_id: z.uuid(),
  question: z.string().trim().min(1).max(500),
  options: z
    .array(z.string().trim().min(1).max(200))
    .min(2)
    .max(10)
    .refine((v) => new Set(v.map((s) => s.toLowerCase())).size === v.length),
  multiple_choice: z.boolean(),
  anonymous: z.boolean(),
  deadline: z.string().datetime({ offset: true }),
  result_visibility: z.enum(['always', 'after_vote', 'after_close']),
  allow_changes: z.boolean(),
});
export interface Poll {
  id: string;
  semester_id: string;
  creator_id: string;
  question: string;
  multiple_choice: boolean;
  anonymous: boolean;
  deadline: string;
  result_visibility: 'always' | 'after_vote' | 'after_close';
  allow_changes: boolean;
  closed_at: string | null;
  created_at: string;
}
export interface PollOption {
  id: string;
  poll_id: string;
  label: string;
  position: number;
}
export interface PollResults {
  participants: number;
  options: {
    id: string;
    label: string;
    votes: number;
    voters: { id: string; name: string }[] | null;
  }[];
}
