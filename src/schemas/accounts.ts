import { z } from 'zod';
export const accountSchema = z.object({
  full_name: z.string().trim().min(1).max(160),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,40}$/),
  student_number: z.string().trim().min(3).max(40),
});
export type AccountInput = z.infer<typeof accountSchema>;
export interface ImportRow {
  row: number;
  input: AccountInput;
  errors: string[];
  operation_id: string;
  status: 'ready' | 'invalid' | 'created' | 'failed';
}
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  let closed = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += c;
      continue;
    }
    if (c === '"') {
      if (value || closed) throw new Error('csv');
      quoted = true;
      continue;
    }
    if (c === ',' || c === '\n' || c === '\r') {
      row.push(value);
      value = '';
      closed = false;
      if (c !== ',') {
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
        if (c === '\r' && text[i + 1] === '\n') i++;
      }
      continue;
    }
    if (closed) throw new Error('csv');
    value += c;
  }
  if (quoted) throw new Error('csv');
  row.push(value);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
export function previewRoster(
  rows: unknown[][],
  existing: AccountInput[],
  newId: () => string = () => crypto.randomUUID(),
): ImportRow[] {
  const header = rows[0];
  if (
    !header ||
    header.length !== 3 ||
    header.join(',') !== 'full_name,username,student_number' ||
    rows.length < 2 ||
    rows.length > 51
  )
    throw new Error('headers');
  const usernames = new Set(existing.map((r) => r.username.toLowerCase()));
  const numbers = new Set(existing.map((r) => r.student_number));
  const parsed = rows.slice(1).map((row, index) => {
    const input = {
      full_name: typeof row[0] === 'string' ? row[0].trim() : '',
      username: typeof row[1] === 'string' ? row[1].trim().toLowerCase() : '',
      student_number: typeof row[2] === 'string' ? row[2].trim() : '',
    };
    const errors: string[] = [];
    const valid = accountSchema.safeParse(input);
    if (row.length !== 3 || !valid.success) errors.push('invalidRow');
    if (usernames.has(input.username)) errors.push('duplicateUsername');
    if (numbers.has(input.student_number)) errors.push('duplicateNumber');
    return {
      row: index + 2,
      input,
      errors,
      operation_id: newId(),
      status: 'ready' as ImportRow['status'],
    };
  });
  for (const row of parsed) {
    if (
      parsed.filter((r) => r.input.username === row.input.username).length >
        1 &&
      !row.errors.includes('duplicateUsername')
    )
      row.errors.push('duplicateUsername');
    if (
      parsed.filter((r) => r.input.student_number === row.input.student_number)
        .length > 1 &&
      !row.errors.includes('duplicateNumber')
    )
      row.errors.push('duplicateNumber');
    row.status = row.errors.length ? 'invalid' : 'ready';
  }
  return parsed;
}
export function importResultsCsv(rows: ImportRow[]): string {
  const cell = (value: unknown) => {
    let text = String(value);
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [
    ['row', 'username', 'status', 'issues'],
    ...rows.map((r) => [r.row, r.input.username, r.status, r.errors.join(';')]),
  ]
    .map((row) => row.map(cell).join(','))
    .join('\r\n');
}
