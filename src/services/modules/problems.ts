import { requireClient } from '@/services/supabase/client';
import { rpc } from './communication';
import { z } from 'zod';
export const problemSchema = z
  .string()
  .trim()
  .min(10)
  .max(2000)
  .refine(
    (v) =>
      !/(bearer\s|eyJ[A-Za-z0-9_-]{10}|[0-9]{7,}|(password|student.?number|token)\s*[:=])/i.test(
        v,
      ),
  );
export interface ProblemReport {
  id: string;
  description: string;
  route: string;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
}
export async function problems(page = 0) {
  const r = await requireClient()
    .from('problem_reports')
    .select('id,description,route,created_at,resolved_at,resolution')
    .order('created_at', { ascending: false })
    .order('id')
    .range(page * 20, page * 20 + 19);
  if (r.error) throw r.error;
  return r.data as ProblemReport[];
}
export function submitProblem(description: string, route: string) {
  const ua = navigator.userAgent;
  const browser = /Edg/.test(ua)
    ? 'Edge'
    : /Firefox/.test(ua)
      ? 'Firefox'
      : /Chrome/.test(ua)
        ? 'Chrome'
        : /Safari/.test(ua)
          ? 'Safari'
          : 'Other';
  return rpc('report_problem', {
    problem_description: problemSchema.parse(description),
    problem_route: /^\/[a-zA-Z0-9/_-]{0,159}$/.test(route)
      ? route
      : '/report-problem',
    version: '0.1.0',
    device: /Android|iPhone|iPad/.test(ua) ? 'mobile' : 'desktop',
    browser,
  });
}
