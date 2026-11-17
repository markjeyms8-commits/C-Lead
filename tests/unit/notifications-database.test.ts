import { beforeAll, afterAll, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { database, seed, asUser, userId, sessionId } from '../helpers/database';
let db: PGlite, task: string, post: string, subscription: string;
const year = '20000000-0000-4000-a000-000000000001',
  term = '20000000-0000-4000-a000-000000000002',
  subject = '20000000-0000-4000-a000-000000000003',
  endpoint = 'https://fcm.googleapis.com/fcm/send/fictional';
beforeAll(async () => {
  db = await database();
  for (const [n, role] of [
    [1, 'president'],
    [2, 'student'],
    [3, 'student'],
  ] as const)
    await seed(db, n, role);
  await db.exec(
    `insert into public.academic_years(id,name,starts_on,ends_on)values('${year}','Test','2026-01-01','2027-12-31');insert into public.semesters(id,academic_year_id,name,starts_on,ends_on)values('${term}','${year}','Test','2026-01-01','2027-01-01');insert into public.subjects(id,semester_id,code,name)values('${subject}','${term}','TEST','Test');insert into public.preferences(user_id,language)values('${userId(2)}','fil')on conflict(user_id)do update set language='fil';`,
  );
}, 60000);
afterAll(async () => await db?.close());
it('combines only authorized calendar records and validates calendar range', async () => {
  task = String(
    (
      await asUser(
        db,
        1,
        `select public.save_task(null,'${subject}','Private task','Text',now()+interval '30 minutes','individual',null,'${userId(2)}',array[60],null) id`,
      )
    ).rows[0]!.id,
  );
  await asUser(
    db,
    1,
    `select public.save_calendar_event(null,'${term}','Class event','Text',now()+interval '2 hours',now()+interval '3 hours',null)`,
  );
  expect(
    (
      await asUser(
        db,
        2,
        `select kind from public.calendar_feed(now(),now()+interval '1 day') order by kind`,
      )
    ).rows,
  ).toEqual([{ kind: 'event' }, { kind: 'task' }]);
  expect(
    (
      await asUser(
        db,
        3,
        `select kind from public.calendar_feed(now(),now()+interval '1 day')`,
      )
    ).rows,
  ).toEqual([{ kind: 'event' }]);
  await expect(
    asUser(
      db,
      2,
      `select * from public.calendar_feed(now(),now()+interval '100 days')`,
    ),
  ).rejects.toThrow();
});
it('dispatches scheduled announcements and due reminders once using recipient language', async () => {
  post = String(
    (
      await asUser(
        db,
        1,
        `select public.save_post(null,'announcement','${term}','Scheduled title','[{"type":"paragraph","text":"Test"}]','published',now()+interval '1 hour',null,false) id`,
      )
    ).rows[0]!.id,
  );
  await db.exec(
    `update public.posts set publish_at=now()-interval '1 minute' where id='${post}';select public.process_due_notifications();`,
  );
  const before = (await db.query(`select id from public.notifications`)).rows
    .length;
  await db.exec(`select public.process_due_notifications()`);
  expect(
    (await db.query(`select id from public.notifications`)).rows,
  ).toHaveLength(before);
  expect(
    (
      await db.query(
        `select title,body from public.notifications where user_id='${userId(2)}' and category='announcements' and path='/announcements/${post}'`,
      )
    ).rows,
  ).toEqual([{ title: 'Bagong anunsyo', body: 'Scheduled title' }]);
  expect(
    (
      await db.query(
        `select id from public.notifications where user_id='${userId(2)}' and category='tasks' and title='Paparating na takdang oras'`,
      )
    ).rows,
  ).toHaveLength(1);
  await expect(
    asUser(db, 1, `select public.process_due_notifications()`),
  ).rejects.toThrow();
});
it('validates push endpoints and keeps endpoint keys private', async () => {
  await expect(
    asUser(
      db,
      2,
      `select public.register_push('https://127.0.0.1/private','${'A'.repeat(87)}','${'B'.repeat(22)}')`,
    ),
  ).rejects.toThrow();
  subscription = String(
    (
      await asUser(
        db,
        2,
        `select public.register_push('${endpoint}','${'A'.repeat(87)}','${'B'.repeat(22)}') id`,
      )
    ).rows[0]!.id,
  );
  expect(
    (
      await asUser(
        db,
        2,
        `select public.my_push_enabled('${endpoint}') enabled`,
      )
    ).rows,
  ).toEqual([{ enabled: true }]);
  expect(
    (
      await asUser(
        db,
        3,
        `select public.my_push_enabled('${endpoint}') enabled`,
      )
    ).rows,
  ).toEqual([{ enabled: false }]);
  await expect(
    asUser(db, 1, `select * from private.push_subscriptions`),
  ).rejects.toThrow();
  await expect(
    asUser(db, 1, `select * from public.claim_push_jobs(10)`),
  ).rejects.toThrow();
});
it('leases push work, returns generic copy, retries and ignores stale acknowledgements', async () => {
  await db.exec(
    `select private.notify_recipient('${userId(2)}','tasks','Secret title','Lihim na pamagat','Private details','Pribadong detalye','/tasks/${task}')`,
  );
  const first = (
    await db.query<{
      job_id: string;
      claim_id: string;
      body: string;
      path: string;
    }>(`select * from public.claim_push_jobs(10)`)
  ).rows[0]!;
  expect(first.body).toBe('Buksan ang C-LEAD para sa bagong abiso.');
  expect(first.path).toBe('/notifications');
  expect(
    (await db.query(`select * from public.claim_push_jobs(10)`)).rows,
  ).toHaveLength(0);
  await db.exec(
    `select public.finish_push_job('${first.job_id}','${first.claim_id}','retry');update private.push_jobs set next_attempt_at=now()-interval '1 minute' where id='${first.job_id}'`,
  );
  const second = (
    await db.query<{ job_id: string; claim_id: string }>(
      `select * from public.claim_push_jobs(10)`,
    )
  ).rows[0]!;
  expect(second.claim_id).not.toBe(first.claim_id);
  await db.exec(
    `select public.finish_push_job('${first.job_id}','${first.claim_id}','delivered')`,
  );
  expect(
    (
      await db.query(
        `select state from private.push_jobs where id='${first.job_id}'`,
      )
    ).rows,
  ).toEqual([{ state: 'sending' }]);
  await db.exec(
    `select public.finish_push_job('${second.job_id}','${second.claim_id}','delivered')`,
  );
});
it('rechecks disabled notification preferences before sending queued push', async () => {
  await db.exec(
    `select private.notify_recipient('${userId(2)}','tasks','Title','Pamagat','Body','Nilalaman','/tasks/${task}');insert into public.notification_preferences(user_id,category,enabled)values('${userId(2)}','tasks',false)`,
  );
  expect(
    (await db.query(`select * from public.claim_push_jobs(10)`)).rows,
  ).toHaveLength(0);
  expect(
    (await db.query(`select id from private.push_jobs where state='skipped'`))
      .rows,
  ).toHaveLength(1);
});
it('disables invalid subscriptions without deleting notification or audit history', async () => {
  await db.exec(
    `select private.notify_recipient('${userId(2)}','security','Security','Seguridad','Body','Nilalaman','/settings/sessions')`,
  );
  const job = (
    await db.query<{ job_id: string; claim_id: string }>(
      `select * from public.claim_push_jobs(10)`,
    )
  ).rows[0]!;
  await db.exec(
    `select public.finish_push_job('${job.job_id}','${job.claim_id}','invalid')`,
  );
  expect(
    (
      await asUser(
        db,
        2,
        `select public.my_push_enabled('${endpoint}') enabled`,
      )
    ).rows,
  ).toEqual([{ enabled: false }]);
  expect(
    (
      await db.query(
        `select id from private.push_subscriptions where id='${subscription}' and disabled_at is not null`,
      )
    ).rows,
  ).toHaveLength(1);
});
it('suppresses queued jobs when their approved device session is revoked', async () => {
  await asUser(
    db,
    2,
    `select public.register_push('${endpoint}','${'A'.repeat(87)}','${'B'.repeat(22)}')`,
  );
  await db.exec(
    `select private.notify_recipient('${userId(2)}','security','Security','Seguridad','Body','Nilalaman','/settings/sessions');update public.app_sessions set revoked_at=now() where id='${sessionId(2)}'`,
  );
  expect(
    (await db.query(`select * from public.claim_push_jobs(10)`)).rows,
  ).toHaveLength(0);
});
