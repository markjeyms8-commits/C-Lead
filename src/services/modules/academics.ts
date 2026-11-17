import { z } from 'zod';
import { requireClient } from '@/services/supabase/client';
import {
  academicInput,
  academicPayload,
  type AcademicKind,
  type AcademicRecord,
} from '@/schemas/academics';
export type { AcademicKind, AcademicRecord } from '@/schemas/academics';
export async function listAcademic(
  kind: AcademicKind,
): Promise<AcademicRecord[]> {
  const records: AcademicRecord[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await requireClient()
      .from(kind)
      .select('*')
      .order('created_at')
      .order('id')
      .range(offset, offset + 99);
    if (error) throw error;
    records.push(...(data as AcademicRecord[]));
    if (data.length < 100) return records;
  }
}
export async function saveAcademic(
  kind: AcademicKind,
  id: string | null,
  input: z.infer<typeof academicInput>,
) {
  const payload: Record<string, string> = academicPayload(kind, input);
  const query = requireClient().from(kind);
  const { error } = await (
    id ? query.update(payload).eq('id', id) : query.insert(payload)
  )
    .select('id')
    .single();
  if (error) throw error;
}
export async function archiveAcademic(kind: AcademicKind, id: string) {
  const { error } = await requireClient()
    .from(kind)
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .single();
  if (error) throw error;
}
