import { beforeAll, afterAll, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { database, seed, asUser, userId } from '../helpers/database';
let db: PGlite;
beforeAll(async () => {
  db = await database();
  for (const [n, r] of [
    [1, 'president'],
    [2, 'student'],
    [3, 'secretary'],
    [4, 'treasurer'],
  ] as const)
    await seed(db, n, r);
}, 60000);
afterAll(async () => await db?.close());
it('enforces independent export permissions and records successful requests only', async () => {
  await expect(
    asUser(db, 2, "select public.export_report('attendance','pdf')"),
  ).rejects.toThrow();
  await expect(
    asUser(db, 3, "select public.export_report('contributions','xlsx')"),
  ).rejects.toThrow();
  await expect(
    asUser(db, 4, "select public.export_report('attendance','pdf')"),
  ).rejects.toThrow();
  await asUser(db, 3, "select public.export_report('attendance','pdf')");
  await asUser(db, 4, "select public.export_report('contributions','xlsx')");
  expect(
    (
      await db.query(
        "select count(*)::int n from public.audit_logs where action='report_export'",
      )
    ).rows,
  ).toEqual([{ n: 2 }]);
  await expect(
    asUser(db, 1, "select public.export_report('attendance','csv')"),
  ).rejects.toThrow();
  await expect(
    asUser(
      db,
      1,
      "select public.export_report('attendance','pdf',null,null,null,null,'2026-02-02','2026-01-01')",
    ),
  ).rejects.toThrow();
});
it('searches visible names without interpreting wildcard characters and rejects unapproved sessions', async () => {
  expect(
    (await asUser(db, 2, "select * from public.global_search('Fictional')"))
      .rows,
  ).toHaveLength(4);
  expect(
    (await asUser(db, 2, "select * from public.global_search('%%')")).rows,
  ).toHaveLength(0);
  await expect(
    asUser(db, 2, "select * from public.global_search('x')"),
  ).rejects.toThrow();
  await db.exec(
    `update public.app_sessions set revoked_at=now() where user_id='${userId(2)}'`,
  );
  await expect(
    asUser(db, 2, "select * from public.global_search('Fictional')"),
  ).rejects.toThrow();
});
it('limits aggregate analytics and audit access to President and VP', async () => {
  await expect(
    asUser(db, 3, 'select public.internal_analytics()'),
  ).rejects.toThrow();
  const r = (await asUser(db, 1, 'select public.internal_analytics() data'))
    .rows[0]!.data as Record<string, unknown>;
  expect(r.active_users).toBe(4);
  expect(r.task_completed).toBe(0);
  expect(
    (await asUser(db, 4, 'select * from public.audit_logs')).rows,
  ).toHaveLength(0);
});

it('rejects null report discriminators without leaking contribution records', async () => {
  await expect(
    asUser(db, 3, "select public.export_report(null,'pdf')"),
  ).rejects.toThrow();
  await expect(
    asUser(db, 3, "select public.export_report('contributions',null)"),
  ).rejects.toThrow();
});
it('exports full contribution snapshots and applies attendance filters to actual records', async () => {
  const y = '90000000-0000-4000-a000-000000000001',
    term = '90000000-0000-4000-a000-000000000002',
    event = '90000000-0000-4000-a000-000000000003',
    fund = '90000000-0000-4000-a000-000000000004';
  await db.exec(
    `insert into public.academic_years(id,name,starts_on,ends_on)values('${y}','Fictional','2026-01-01','2027-12-31');insert into public.semesters(id,academic_year_id,name,starts_on,ends_on)values('${term}','${y}','Fictional term','2026-01-01','2027-01-01');insert into public.attendance_sessions(id,semester_id,title,kind,occurred_at,creator_id)values('${event}','${term}','Fictional meeting','meeting','2026-11-13T01:00:00Z','${userId(1)}');insert into public.attendance_records(session_id,student_id,status)values('${event}','${userId(2)}','present'),('${event}','${userId(3)}','late');insert into public.contributions(id,semester_id,creator_id,title,purpose,amount_cent,deadline)values('${fund}','${term}','${userId(1)}','Fictional fund','Test',12550,'2026-12-01');insert into public.contribution_records(contribution_id,student_id,status)values('${fund}','${userId(2)}','paid'),('${fund}','${userId(3)}','unpaid');`,
  );
  const attendance = (
    await asUser(
      db,
      3,
      `select public.export_report('attendance','pdf','${term}',null,'${event}','${userId(2)}','2026-11-13','2026-11-13') data`,
    )
  ).rows[0]!.data as { rows: Record<string, unknown>[] };
  expect(attendance.rows).toHaveLength(1);
  expect(attendance.rows[0]!.status).toBe('present');
  const contribution = (
    await asUser(
      db,
      4,
      `select public.export_report('contributions','xlsx','${term}') data`,
    )
  ).rows[0]!.data as { officer: string; rows: Record<string, unknown>[] };
  expect(contribution.rows).toHaveLength(2);
  expect(contribution.rows.map((r) => r.status).sort()).toEqual([
    'paid',
    'unpaid',
  ]);
  expect(contribution.rows[0]!.amount_cent).toBe(12550);
  expect(JSON.stringify(contribution)).not.toContain('student_number');
});
