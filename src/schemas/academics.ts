import { z } from 'zod';
export type AcademicKind = 'academic_years' | 'semesters' | 'subjects';
export interface AcademicRecord {
  id: string;
  name: string;
  archived_at: string | null;
  starts_on?: string;
  ends_on?: string;
  academic_year_id?: string;
  semester_id?: string;
  code?: string;
}
export const academicInput = z.object({
  name: z.string().trim().min(1).max(160),
  starts_on: z.string(),
  ends_on: z.string(),
  parent: z.string(),
  code: z.string().trim().max(30),
});
export function academicPayload(
  kind: AcademicKind,
  input: z.infer<typeof academicInput>,
): Record<string, string> {
  const parsed = academicInput.parse(input);
  if (kind === 'subjects')
    return {
      name: parsed.name,
      code: z.string().min(1).parse(parsed.code),
      semester_id: z.uuid().parse(parsed.parent),
    };
  const dates = z
    .object({ starts_on: z.iso.date(), ends_on: z.iso.date() })
    .refine((v) => v.ends_on > v.starts_on)
    .parse(parsed);
  return {
    name: z.string().max(80).parse(parsed.name),
    ...dates,
    ...(kind === 'semesters'
      ? { academic_year_id: z.uuid().parse(parsed.parent) }
      : {}),
  };
}
