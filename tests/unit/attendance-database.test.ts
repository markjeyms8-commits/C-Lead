import { beforeAll, afterAll, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { database, seed, asUser, userId } from '../helpers/database';
let db: PGlite, session: string, record: string;
const year = '20000000-0000-4000-a000-000000000001',
  term = '20000000-0000-4000-a000-000000000002';
beforeAll(async () => {
  db = await database();
  for (const [n, role] of [
    [1, 'secretary'],
    [2, 'student'],
    [3, 'president'],
    [4, 'treasurer'],
  ] as const)
    await seed(db, n, role);
  await db.exec(
    `insert into public.academic_years(id,name,starts_on,ends_on)values('${year}','Test','2026-01-01','2027-12-31');insert into public.semesters(id,academic_year_id,name,starts_on,ends_on)values('${term}','${year}','Test','2026-01-01','2027-01-01');`,
  );
}, 60000);
afterAll(async () => await db?.close());
it('restricts creation to attendance officers and prevents backdating around the edit window', async () => {
  const sql = `select public.create_attendance('${term}',null,'Class meeting','meeting',now()-interval '1 hour') id`;
  for (const n of [2, 4]) await expect(asUser(db, n, sql)).rejects.toThrow();
  await expect(asUser(db, 1, sql.replace('1 hour', '8 days'))).rejects.toThrow(
    'seven days',
  );
  session = String((await asUser(db, 1, sql)).rows[0]!.id);
  record = String(
    (
      await asUser(
        db,
        2,
        `select id from public.attendance_records where session_id='${session}'`,
      )
    ).rows[0]!.id,
  );
});
it('allows students only their attendance while authorized officers see the roster', async () => {
  expect(
    (await asUser(db, 2, `select * from public.attendance_records`)).rows,
  ).toHaveLength(1);
  expect(
    (await asUser(db, 4, `select * from public.attendance_records`)).rows,
  ).toHaveLength(1);
  expect(
    (await asUser(db, 1, `select * from public.attendance_records`)).rows,
  ).toHaveLength(4);
  await expect(
    asUser(db, 2, `update public.attendance_records set status='present'`),
  ).rejects.toThrow();
});
it('requires reasons and audits an officer change inside seven days', async () => {
  await expect(
    asUser(
      db,
      2,
      `select public.mark_attendance('${record}','present','I was there')`,
    ),
  ).rejects.toThrow();
  await expect(
    asUser(db, 1, `select public.mark_attendance('${record}','late','')`),
  ).rejects.toThrow();
  await asUser(
    db,
    1,
    `select public.mark_attendance('${record}','late','Arrived after roll call')`,
  );
  expect(
    (
      await asUser(
        db,
        2,
        `select status from public.attendance_records where id='${record}'`,
      )
    ).rows,
  ).toEqual([{ status: 'late' }]);
  expect(
    (
      await db.query(
        `select * from public.audit_logs where action='attendance_marked'`,
      )
    ).rows,
  ).toHaveLength(1);
});
it('allows a reasoned self-correction, denies classmates and preserves review decisions', async () => {
  await expect(
    asUser(
      db,
      4,
      `select public.request_attendance_correction('${record}','excused','Another student')`,
    ),
  ).rejects.toThrow();
  const id = String(
    (
      await asUser(
        db,
        2,
        `select public.request_attendance_correction('${record}','excused','Approved appointment') id`,
      )
    ).rows[0]!.id,
  );
  await expect(
    asUser(
      db,
      2,
      `select public.request_attendance_correction('${record}','present','Duplicate')`,
    ),
  ).rejects.toThrow();
  await expect(
    asUser(
      db,
      2,
      `select public.review_attendance_correction('${id}','approved','Approve myself')`,
    ),
  ).rejects.toThrow();
  await asUser(
    db,
    1,
    `select public.review_attendance_correction('${id}','approved','Appointment verified')`,
  );
  expect(
    (
      await asUser(
        db,
        2,
        `select status from public.attendance_records where id='${record}'`,
      )
    ).rows,
  ).toEqual([{ status: 'excused' }]);
  await expect(
    asUser(
      db,
      1,
      `select public.review_attendance_correction('${id}','rejected','Second decision')`,
    ),
  ).rejects.toThrow('Already');
  expect(
    (await asUser(db, 4, `select * from public.attendance_corrections`)).rows,
  ).toHaveLength(0);
});
it('queues old changes and requires explicit President/VP approval without mutating attendance first', async () => {
  await db.exec(
    `update public.attendance_sessions set occurred_at=now()-interval '8 days' where id='${session}'`,
  );
  expect(
    (
      await asUser(
        db,
        1,
        `select public.mark_attendance('${record}','present','Verified old register') result`,
      )
    ).rows,
  ).toEqual([{ result: 'pending' }]);
  expect(
    (
      await asUser(
        db,
        2,
        `select status from public.attendance_records where id='${record}'`,
      )
    ).rows,
  ).toEqual([{ status: 'excused' }]);
  const id = String(
    (
      await db.query<{ id: string }>(
        `select id from public.attendance_corrections where state='pending'`,
      )
    ).rows[0]!.id,
  );
  await expect(
    asUser(
      db,
      1,
      `select public.review_attendance_correction('${id}','approved','Secretary approval')`,
    ),
  ).rejects.toThrow('President');
  await asUser(
    db,
    3,
    `select public.review_attendance_correction('${id}','approved','Historical register verified')`,
  );
  expect(
    (
      await asUser(
        db,
        2,
        `select status from public.attendance_records where id='${record}'`,
      )
    ).rows,
  ).toEqual([{ status: 'present' }]);
});
it('rejects stale correction approval, allows reasoned rejection and emits preference-aware decisions', async () => {
  await db.exec(
    `insert into public.notification_preferences(user_id,category,enabled)values('${userId(2)}','attendance_corrections',false)`,
  );
  const before = (
    await db.query(
      `select id from public.notifications where user_id='${userId(2)}' and category='attendance_corrections'`,
    )
  ).rows.length;
  const id = String(
    (
      await asUser(
        db,
        2,
        `select public.request_attendance_correction('${record}','late','Correct historical time') id`,
      )
    ).rows[0]!.id,
  );
  await db.exec(
    `update public.attendance_records set status='absent' where id='${record}'`,
  );
  await expect(
    asUser(
      db,
      3,
      `select public.review_attendance_correction('${id}','approved','Review old record')`,
    ),
  ).rejects.toThrow('changed');
  await asUser(
    db,
    3,
    `select public.review_attendance_correction('${id}','rejected','Record changed; request again')`,
  );
  expect(
    (
      await db.query(
        `select id from public.notifications where user_id='${userId(2)}' and category='attendance_corrections'`,
      )
    ).rows,
  ).toHaveLength(before);
});
it('archives attendance without erasing records and denies later changes', async () => {
  await asUser(
    db,
    1,
    `select public.archive_attendance('${session}','Session finalized')`,
  );
  await expect(
    asUser(
      db,
      2,
      `select public.request_attendance_correction('${record}','present','Attempt after archive')`,
    ),
  ).rejects.toThrow();
  await expect(
    asUser(
      db,
      3,
      `select public.mark_attendance('${record}','present','Attempt after archive')`,
    ),
  ).rejects.toThrow();
  expect(
    (
      await asUser(
        db,
        2,
        `select id from public.attendance_records where id='${record}'`,
      )
    ).rows,
  ).toHaveLength(1);
});
