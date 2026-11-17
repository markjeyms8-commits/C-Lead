import { beforeAll, afterAll, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { database, seed, asUser, userId, sessionId } from '../helpers/database';
let db: PGlite, task: string;
const year = '20000000-0000-4000-a000-000000000001',
  term = '20000000-0000-4000-a000-000000000002',
  subject = '20000000-0000-4000-a000-000000000003';
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
const create = (
  target = 'null',
  audience = 'individual',
  group = 'null',
  person = `'${userId(2)}'`,
  reason = 'null',
) =>
  `select public.save_task(${target},'${subject}','Class task','Description',now()+interval '1 day','${audience}',${group},${person},array[60],${reason}) id`;
it('allows only task managers and limits task visibility to assigned users', async () => {
  for (const n of [2, 5])
    await expect(asUser(db, n, create())).rejects.toThrow();
  task = String((await asUser(db, 4, create())).rows[0]!.id);
  expect(
    (await asUser(db, 2, `select id from public.tasks where id='${task}'`))
      .rows,
  ).toHaveLength(1);
  expect(
    (await asUser(db, 3, `select id from public.tasks where id='${task}'`))
      .rows,
  ).toHaveLength(0);
  await expect(
    asUser(db, 3, `select public.task_progress('${task}')`),
  ).rejects.toThrow();
});
it('allows only the assigned user to change completion before the server deadline', async () => {
  await expect(
    asUser(db, 3, `select public.set_task_completion('${task}',true)`),
  ).rejects.toThrow();
  await expect(
    asUser(db, 4, `select public.set_task_completion('${task}',true)`),
  ).rejects.toThrow();
  await asUser(
    db,
    2,
    `select public.set_task_completion('${task}',true);select public.set_task_completion('${task}',false)`,
  );
  expect(
    (
      await asUser(
        db,
        2,
        `select completed from public.task_progress('${task}')`,
      )
    ).rows,
  ).toEqual([{ completed: false }]);
  await db.exec(
    `update public.tasks set deadline=now()-interval '1 second' where id='${task}'`,
  );
  await expect(
    asUser(db, 2, `select public.set_task_completion('${task}',true)`),
  ).rejects.toThrow('locked');
  expect(
    (
      await asUser(
        db,
        2,
        `select overdue,locked from public.task_progress('${task}')`,
      )
    ).rows,
  ).toEqual([{ overdue: true, locked: true }]);
});
it('requires an edit reason and retains completion history when retargeting', async () => {
  await expect(asUser(db, 4, create(`'${task}'`))).rejects.toThrow('reason');
  await asUser(
    db,
    4,
    create(
      `'${task}'`,
      'individual',
      'null',
      `'${userId(3)}'`,
      "'Correct assignment'",
    ),
  );
  expect(
    (await asUser(db, 2, `select id from public.tasks where id='${task}'`))
      .rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        `select * from public.task_completions where task_id='${task}' and student_id='${userId(2)}'`,
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await asUser(
        db,
        4,
        `select student_id from public.task_progress('${task}')`,
      )
    ).rows,
  ).toHaveLength(2);
});
it('snapshots group membership and enforces matching task subjects', async () => {
  const group = String(
    (
      await asUser(
        db,
        2,
        `select public.save_group(null,'Study','${subject}',array['${userId(2)}']::uuid[],null) id`,
      )
    ).rows[0]!.id,
  );
  const id = String(
    (await asUser(db, 4, create('null', 'group', `'${group}'`, 'null')))
      .rows[0]!.id,
  );
  await asUser(
    db,
    2,
    `select public.save_group('${group}','Study','${subject}',array['${userId(3)}']::uuid[],null)`,
  );
  expect(
    (await asUser(db, 2, `select id from public.tasks where id='${id}'`)).rows,
  ).toHaveLength(1);
  expect(
    (await asUser(db, 3, `select id from public.tasks where id='${id}'`)).rows,
  ).toHaveLength(0);
});
it('authorizes private task files through the assignment and blocks archived writes', async () => {
  await expect(
    asUser(
      db,
      3,
      `select public.reserve_task_attachment('${task}','Test.pdf','application/pdf',20)`,
    ),
  ).rejects.toThrow();
  const file = String(
    (
      await asUser(
        db,
        4,
        `select (public.reserve_task_attachment('${task}','Test.pdf','application/pdf',20)).id`,
      )
    ).rows[0]!.id,
  );
  await db.exec(
    `select public.finish_task_attachment_upload('${file}','${userId(4)}','${sessionId(4)}')`,
  );
  await expect(
    asUser(db, 2, `select public.task_attachment_access('${file}','read')`),
  ).rejects.toThrow();
  expect(
    (
      await asUser(
        db,
        3,
        `select (public.task_attachment_access('${file}','read')).id`,
      )
    ).rows,
  ).toHaveLength(1);
  await expect(
    asUser(db, 3, `select public.task_attachment_access('${file}','delete')`),
  ).rejects.toThrow();
  await asUser(db, 4, `select public.archive_task('${task}','Term complete')`);
  await expect(
    asUser(db, 3, `select public.set_task_completion('${task}',true)`),
  ).rejects.toThrow();
  await expect(
    asUser(
      db,
      4,
      `select public.reserve_task_attachment('${task}','Other.pdf','application/pdf',20)`,
    ),
  ).rejects.toThrow();
  expect(
    (
      await asUser(
        db,
        3,
        `select (public.task_attachment_access('${file}','read')).id`,
      )
    ).rows,
  ).toHaveLength(1);
});
