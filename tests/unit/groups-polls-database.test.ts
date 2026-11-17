import { beforeAll, afterAll, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { database, seed, asUser, userId } from '../helpers/database';
let db: PGlite;
const year = '20000000-0000-4000-a000-000000000001',
  term = '20000000-0000-4000-a000-000000000002',
  subject = '20000000-0000-4000-a000-000000000003';
let group: string, poll: string, option: string, second: string;
beforeAll(async () => {
  db = await database();
  for (const [n, role] of [
    [1, 'president'],
    [2, 'student'],
    [3, 'student'],
    [4, 'secretary'],
    [5, 'treasurer'],
  ] as const)
    await seed(db, n, role);
  await db.exec(
    `insert into public.academic_years(id,name,starts_on,ends_on)values('${year}','Test','2026-01-01','2027-12-31');insert into public.semesters(id,academic_year_id,name,starts_on,ends_on)values('${term}','${year}','Test','2026-01-01','2027-01-01');insert into public.subjects(id,semester_id,code,name)values('${subject}','${term}','TEST','Test');`,
  );
}, 60000);
afterAll(async () => await db?.close());
it('lets a student create a roster-based subject group and blocks another creator', async () => {
  group = String(
    (
      await asUser(
        db,
        2,
        `select public.save_group(null,'Study team','${subject}',array['${userId(2)}','${userId(3)}']::uuid[],null) id`,
      )
    ).rows[0]!.id,
  );
  await expect(
    asUser(
      db,
      3,
      `select public.save_group('${group}','Hijack','${subject}','{}',null)`,
    ),
  ).rejects.toThrow();
  expect(
    (
      await asUser(
        db,
        3,
        `select * from public.group_members where group_id='${group}'`,
      )
    ).rows,
  ).toHaveLength(2);
});
it('requires officer override reasons and preserves membership history', async () => {
  await expect(
    asUser(
      db,
      4,
      `select public.save_group('${group}','Study team','${subject}','{}',null)`,
    ),
  ).rejects.toThrow('reason');
  await expect(
    asUser(
      db,
      4,
      `select public.save_group('${group}','Renamed','${subject}','{}','Correct roster')`,
    ),
  ).rejects.toThrow('membership only');
  await asUser(
    db,
    4,
    `select public.save_group('${group}','Study team','${subject}',array['${userId(2)}']::uuid[],'Correct roster')`,
  );
  expect(
    (
      await db.query(
        `select * from public.group_membership_history where group_id='${group}'`,
      )
    ).rows,
  ).toHaveLength(3);
  expect(
    (
      await db.query(
        `select * from public.audit_logs where action='group_overridden'`,
      )
    ).rows,
  ).toHaveLength(1);
});
it('archives groups without destroying historical membership and prevents creator changes afterward', async () => {
  await expect(
    asUser(
      db,
      2,
      `select public.moderate_group('${group}','remove','Erase history')`,
    ),
  ).rejects.toThrow();
  await asUser(
    db,
    1,
    `select public.moderate_group('${group}','archive','Completed project')`,
  );
  await expect(
    asUser(
      db,
      2,
      `select public.save_group('${group}','Study team','${subject}','{}',null)`,
    ),
  ).rejects.toThrow();
  expect(
    (
      await db.query(
        `select * from public.group_members where group_id='${group}'`,
      )
    ).rows,
  ).toHaveLength(1);
});
it('restricts poll creation and validates duplicate options', async () => {
  const sql = `select public.create_poll('${term}','Choose',array['One','Two'],false,true,now()+interval '1 day','after_vote',true) id`;
  await expect(asUser(db, 2, sql)).rejects.toThrow();
  await expect(
    asUser(db, 1, sql.replace("'Two'", "' one '")),
  ).rejects.toThrow();
  poll = String((await asUser(db, 1, sql)).rows[0]!.id);
  const options = await db.query<{ id: string }>(
    `select id from public.poll_options where poll_id='${poll}' order by position`,
  );
  option = options.rows[0]!.id;
  second = options.rows[1]!.id;
});
it('enforces single choice, exact option ownership and result visibility', async () => {
  await expect(
    asUser(db, 2, `select public.poll_results('${poll}')`),
  ).rejects.toThrow('Vote before');
  await expect(
    asUser(
      db,
      2,
      `select public.vote_poll('${poll}',array['${option}','${second}']::uuid[])`,
    ),
  ).rejects.toThrow();
  await expect(
    asUser(
      db,
      2,
      `select public.vote_poll('${poll}',array['${group}']::uuid[])`,
    ),
  ).rejects.toThrow();
  await asUser(
    db,
    2,
    `select public.vote_poll('${poll}',array['${option}']::uuid[])`,
  );
  await asUser(
    db,
    2,
    `select public.vote_poll('${poll}',array['${second}']::uuid[])`,
  );
  expect(
    (
      await db.query(
        `select * from private.poll_ballots where poll_id='${poll}'`,
      )
    ).rows,
  ).toHaveLength(1);
  const results = (
    await asUser(db, 2, `select public.poll_results('${poll}') r`)
  ).rows[0]!.r as {
    participants: number;
    options: { votes: number; voters: unknown }[];
  };
  expect(results.participants).toBe(1);
  expect(results.options.map((o) => o.votes)).toEqual([0, 1]);
  expect(results.options.every((o) => o.voters === null)).toBe(true);
  await expect(
    asUser(db, 1, `select * from private.poll_ballots`),
  ).rejects.toThrow();
});
it('locks voting at server deadlines and forbids changes when configured', async () => {
  await db.exec(
    `update public.polls set allow_changes=false where id='${poll}'`,
  );
  await expect(
    asUser(
      db,
      2,
      `select public.vote_poll('${poll}',array['${option}']::uuid[])`,
    ),
  ).rejects.toThrow('disabled');
  await db.exec(
    `update public.polls set deadline=now()-interval '1 second' where id='${poll}'`,
  );
  await expect(
    asUser(
      db,
      3,
      `select public.vote_poll('${poll}',array['${option}']::uuid[])`,
    ),
  ).rejects.toThrow('closed');
  expect(
    (await asUser(db, 3, `select public.poll_results('${poll}')`)).rows,
  ).toHaveLength(1);
});
it('only exposes named voters when the chosen visibility rule permits results', async () => {
  const id = String(
    (
      await asUser(
        db,
        1,
        `select public.create_poll('${term}','Named poll',array['A','B'],true,false,now()+interval '1 day','after_close',false) id`,
      )
    ).rows[0]!.id,
  );
  const options = await db.query<{ id: string }>(
    `select id from public.poll_options where poll_id='${id}'`,
  );
  await asUser(
    db,
    3,
    `select public.vote_poll('${id}',array['${options.rows[0]!.id}']::uuid[])`,
  );
  await expect(
    asUser(db, 1, `select public.poll_results('${id}')`),
  ).rejects.toThrow();
  await asUser(db, 1, `select public.close_poll('${id}','Voting completed')`);
  const r = (await asUser(db, 2, `select public.poll_results('${id}') r`))
    .rows[0]!.r;
  expect(JSON.stringify(r)).toContain(userId(3));
});
