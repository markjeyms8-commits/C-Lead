import { rpc } from './communication';
import { requireClient } from '@/services/supabase/client';
export interface SearchResult {
  id: string;
  kind: string;
  title: string;
  path: string;
}
export interface ReportSnapshot {
  kind: string;
  generated_at: string;
  officer: string;
  rows: Record<string, string | number | null>[];
}
export interface ReportFilters {
  term_id: string | null;
  subject_filter: string | null;
  event_filter: string | null;
  student_filter: string | null;
  date_from: string | null;
  date_to: string | null;
}
export interface AuditRecord {
  id: number;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
export interface Analytics {
  active_users: number;
  announcement_views: number;
  poll_ballots: number;
  task_assigned: number;
  task_completed: number;
  attendance: Record<string, number>;
  contributions: Record<string, number>;
}
export async function search(text: string, archived: boolean, page = 0) {
  return (await rpc('global_search', {
    search_text: text,
    include_archive: archived,
    page_offset: page * 20,
  })) as SearchResult[];
}
export async function report(
  kind: string,
  format: string,
  filters: ReportFilters,
) {
  return (await rpc('export_report', {
    report_kind: kind,
    export_format: format,
    ...filters,
  })) as ReportSnapshot;
}
export async function analytics() {
  return (await rpc('internal_analytics', {})) as Analytics;
}
export async function audit(page = 0, action = '') {
  let q = requireClient()
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id')
    .range(page * 20, page * 20 + 19);
  if (action) q = q.eq('action', action);
  const r = await q;
  if (r.error) throw r.error;
  return r.data as AuditRecord[];
}
export async function reportEvents(kind: string) {
  const table = kind === 'attendance' ? 'attendance_sessions' : 'contributions';
  const rows: { id: string; title: string }[] = [];
  for (let offset = 0; ; offset += 100) {
    const r = await requireClient()
      .from(table)
      .select('id,title')
      .order('id')
      .range(offset, offset + 99);
    if (r.error) throw r.error;
    rows.push(...r.data);
    if (r.data.length < 100) return rows;
  }
}
// Explicit string cells ensure spreadsheet input is never interpreted as formulas.
export async function reportBlob(
  snapshot: ReportSnapshot,
  format: 'pdf' | 'xlsx',
  labels: Record<string, string>,
  language = 'en',
) {
  const keys = [
    ...new Set(snapshot.rows.flatMap((row) => Object.keys(row))),
  ].filter((k) => k !== 'event_id');
  const date = (value: string) =>
    new Intl.DateTimeFormat(language === 'fil' ? 'fil-PH' : 'en-PH', {
      timeZone: 'Asia/Manila',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value)) + ' (Asia/Manila)';
  const rows = snapshot.rows.map((row) =>
    keys.map((k) =>
      k === 'status'
        ? (labels[String(row[k])] ?? String(row[k] ?? ''))
        : ['deadline', 'created_at', 'updated_at', 'occurred_at'].includes(k) &&
            row[k]
          ? date(String(row[k]))
          : String(row[k] ?? ''),
    ),
  );
  const summary =
    snapshot.kind === 'contributions'
      ? `${labels.paid}: ${snapshot.rows.filter((r) => r.status === 'paid').length}; ${labels.unpaid}: ${snapshot.rows.filter((r) => r.status === 'unpaid').length}; ${labels.collected}: PHP ${(snapshot.rows.reduce((n, r) => n + (r.status === 'paid' ? Number(r.amount_cent) : 0), 0) / 100).toFixed(2)}; ${labels.required}: PHP ${(snapshot.rows.reduce((n, r) => n + Number(r.amount_cent), 0) / 100).toFixed(2)}`
      : `${labels.records}: ${rows.length}`;
  const heading = `C-LEAD — ${labels[snapshot.kind] ?? snapshot.kind}`;
  const metadata = `${labels.officer}: ${snapshot.officer} | ${date(snapshot.generated_at)}`;
  if (format === 'xlsx') {
    const { default: write } = await import('write-excel-file/browser');
    const data = [
      [heading],
      [metadata],
      [summary],
      keys.map((k) => labels[k] ?? k),
      ...rows,
    ].map((row) => row.map((value) => ({ type: String, value })));
    return await write(data, {
      columns: keys.map(() => ({ width: 25 })),
    }).toBlob();
  }
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF();
  let y = 15;
  function line(value: string) {
    const lines = pdf.splitTextToSize(value, 180) as string[];
    for (const text of lines) {
      if (y > 280) {
        pdf.addPage();
        y = 15;
      }
      pdf.text(text, 15, y);
      y += 6;
    }
    y += 3;
  }
  pdf.setFontSize(11);
  line(heading);
  line(metadata);
  line(summary);
  for (let i = 0; i < rows.length; i++) {
    line(
      `${i + 1}. ` +
        keys.map((k, j) => `${labels[k] ?? k}: ${rows[i]![j]}`).join(' | '),
    );
  }
  if (!rows.length) line(labels.empty ?? '');
  return pdf.output('blob');
}
export function downloadReport(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
