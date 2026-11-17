import { beforeAll, afterAll, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { database, seed, asUser, userId } from '../helpers/database';
let db: PGlite, contribution: string, record: string;
const year = '20000000-0000-4000-a000-000000000001',
  term = '20000000-0000-4000-a000-000000000002';
beforeAll(async () => {
  db = await database();
  for (const [n, role] of [
    [1, 'treasurer'],
    [2, 'student'],
    [3, 'student'],
    [4, 'secretary'],
    [5, 'president'],
  ] as const)
    await seed(db, n, role);
  await db.exec(
    `insert into public.academic_years(id,name,starts_on,ends_on)values('${year}','Test','2026-01-01','2027-12-31');insert into public.semesters(id,academic_year_id,name,starts_on,ends_on)values('${term}','${year}','Test','2026-01-01','2027-01-01');`,
  );
}, 60000);
afterAll(async () => await db?.close());
const save = (id = 'null', amount = 15000, reason = 'null') =>
  `select public.save_contribution(${id},'${term}','Class materials','Printed materials',${amount},now()+interval '1 day',${reason}) id`;
it('allows finance officers to create and denies students and secretary', async () => {
  for (const n of [2, 4]) await expect(asUser(db, n, save())).rejects.toThrow();
  await expect(asUser(db, 1, save('null', 0))).rejects.toThrow();
  contribution = String((await asUser(db, 1, save())).rows[0]!.id);
  record = String(
    (
      await asUser(
        db,
        2,
        `select id from public.contribution_records where contribution_id='${contribution}'`,
      )
    ).rows[0]!.id,
  );
});
it('shows only own payment status to students and anonymous aggregate totals', async () => {
  expect(
    (await asUser(db, 2, `select * from public.contribution_records`)).rows,
  ).toHaveLength(1);
  expect(
    (await asUser(db, 4, `select * from public.contribution_records`)).rows,
  ).toHaveLength(1);
  expect(
    (await asUser(db, 1, `select * from public.contribution_records`)).rows,
  ).toHaveLength(5);
  const summary = (
    await asUser(
      db,
      2,
      `select public.contribution_summary('${contribution}') s`,
    )
  ).rows[0]!.s;
  expect(summary).toEqual({
    members: 5,
    paid_count: 0,
    target_cent: 75000,
    collected_cent: 0,
    outstanding_cent: 75000,
  });
  expect(JSON.stringify(summary)).not.toContain(userId(3));
});
it('denies self-payment and Partial, and requires an audited officer reason', async () => {
  await expect(
    asUser(
      db,
      2,
      `select public.mark_contribution('${record}','paid','Pay myself')`,
    ),
  ).rejects.toThrow();
  await expect(
    asUser(
      db,
      4,
      `select public.mark_contribution('${record}','paid','Secretary attempt')`,
    ),
  ).rejects.toThrow();
  await expect(
    asUser(
      db,
      1,
      `select public.mark_contribution('${record}','partial','Partial amount')`,
    ),
  ).rejects.toThrow();
  await expect(
    asUser(db, 1, `select public.mark_contribution('${record}','paid','')`),
  ).rejects.toThrow();
  await asUser(
    db,
    1,
    `select public.mark_contribution('${record}','paid','Payment verified')`,
  );
  expect(
    (await asUser(db, 2, `select status from public.contribution_records`))
      .rows,
  ).toEqual([{ status: 'paid' }]);
  const summary = (
    await asUser(
      db,
      3,
      `select public.contribution_summary('${contribution}') s`,
    )
  ).rows[0]!.s;
  expect(summary).toEqual({
    members: 5,
    paid_count: 1,
    target_cent: 75000,
    collected_cent: 15000,
    outstanding_cent: 60000,
  });
  expect(
    (
      await db.query(
        `select id from public.audit_logs where action='payment_status_changed'`,
      )
    ).rows,
  ).toHaveLength(1);
});
it('prevents amount changes while paid records exist and preserves roster on edits', async () => {
  await expect(
    asUser(db, 1, save(`'${contribution}'`, 20000, "'Amount changed'")),
  ).rejects.toThrow('locked');
  await expect(
    asUser(db, 1, save(`'${contribution}'`, 15000)),
  ).rejects.toThrow();
  await asUser(db, 1, save(`'${contribution}'`, 15000, "'Clarified purpose'"));
  expect(
    (
      await db.query(
        `select id from public.contribution_records where contribution_id='${contribution}'`,
      )
    ).rows,
  ).toHaveLength(5);
});
it('reminds only unpaid active recipients, respects preferences and throttles repeats', async () => {
  await db.exec(
    `insert into public.notification_preferences(user_id,category,enabled)values('${userId(3)}','contributions',false)`,
  );
  const before = (
    await db.query(
      `select id from public.notifications where category='contributions' and user_id in ('${userId(2)}','${userId(3)}')`,
    )
  ).rows.length;
  await expect(
    asUser(
      db,
      2,
      `select public.remind_contribution('${contribution}','Student attempt')`,
    ),
  ).rejects.toThrow();
  await asUser(
    db,
    1,
    `select public.remind_contribution('${contribution}','Deadline approaching')`,
  );
  expect(
    (
      await db.query(
        `select id from public.notifications where category='contributions' and user_id in ('${userId(2)}','${userId(3)}')`,
      )
    ).rows,
  ).toHaveLength(before);
  await expect(
    asUser(
      db,
      5,
      `select public.remind_contribution('${contribution}','Repeat reminder')`,
    ),
  ).rejects.toThrow('24 hours');
});
it('preserves archived records and locks further payment changes', async () => {
  await asUser(
    db,
    5,
    `select public.archive_contribution('${contribution}','Collection closed')`,
  );
  await expect(
    asUser(
      db,
      1,
      `select public.mark_contribution('${record}','unpaid','Attempt after archive')`,
    ),
  ).rejects.toThrow();
  await expect(
    asUser(db, 1, save(`'${contribution}'`, 15000, "'Attempt after archive'")),
  ).rejects.toThrow();
  expect(
    (
      await asUser(
        db,
        2,
        `select public.contribution_summary('${contribution}')`,
      )
    ).rows,
  ).toHaveLength(1);
});
