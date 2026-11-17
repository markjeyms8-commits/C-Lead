import { z } from 'zod';
export const amountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,7}(\.\d{1,2})?$/)
  .refine(
    (s) =>
      Math.round(Number(s) * 100) >= 1 &&
      Math.round(Number(s) * 100) <= 100000000,
  );
export const contributionSchema = z.object({
  semester_id: z.uuid(),
  title: z.string().trim().min(1).max(160),
  purpose: z.string().trim().min(1).max(5000),
  amount: z.string().pipe(amountSchema),
  deadline: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(500),
});
export interface Contribution {
  id: string;
  semester_id: string;
  creator_id: string;
  title: string;
  purpose: string;
  amount_cent: number;
  deadline: string;
  status: 'active' | 'archived';
  last_reminded_at: string | null;
  created_at: string;
}
export interface ContributionRecord {
  id: string;
  contribution_id: string;
  student_id: string;
  status: 'paid' | 'unpaid';
  updated_at: string;
  updated_by: string | null;
}
export interface ContributionSummary {
  members: number;
  paid_count: number;
  target_cent: number;
  collected_cent: number;
  outstanding_cent: number;
}
