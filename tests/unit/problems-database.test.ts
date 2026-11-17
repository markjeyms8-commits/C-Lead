import { beforeAll, afterAll, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { database, seed, asUser } from '../helpers/database';
let db: PGlite, id: string;
beforeAll(async () => {
  db = await database();
  await seed(db, 1, 'president');
  await seed(db, 2, 'student');
  await seed(db, 3, 'student');
}, 60000);
afterAll(async () => await db?.close());
it('accepts explicit descriptions and limits report visibility', async () => {
  id = String(
    (
      await asUser(
        db,
        2,
        "select public.report_problem('The calendar failed to load.','/calendar','0.1.0','desktop','Chrome') id",
      )
    ).rows[0]!.id,
  );
  expect(
    (await asUser(db, 3, 'select * from public.problem_reports')).rows,
  ).toHaveLength(0);
  expect(
    (await asUser(db, 1, 'select * from public.problem_reports')).rows,
  ).toHaveLength(1);
  await expect(
    asUser(db, 2, `select public.resolve_problem('${id}','Fixed issue')`),
  ).rejects.toThrow();
  await asUser(
    db,
    1,
    `select public.resolve_problem('${id}','Verified the fix')`,
  );
  expect(
    (await asUser(db, 2, 'select resolution from public.problem_reports'))
      .rows[0]!.resolution,
  ).toBe('Verified the fix');
});
it('rejects sensitive values, query strings, direct writes and excessive submissions', async () => {
  await expect(
    asUser(
      db,
      2,
      "select public.report_problem('password: secret','/home','0.1.0','desktop','Chrome')",
    ),
  ).rejects.toThrow();
  await expect(
    asUser(
      db,
      2,
      "select public.report_problem('Page failed to load','/home?token=secret','0.1.0','desktop','Chrome')",
    ),
  ).rejects.toThrow();
  await expect(
    asUser(db, 2, 'delete from public.problem_reports'),
  ).rejects.toThrow();
  for (let n = 0; n < 2; n++)
    await asUser(
      db,
      2,
      "select public.report_problem('Page failed to load','/home','0.1.0','desktop','Chrome')",
    );
  await expect(
    asUser(
      db,
      2,
      "select public.report_problem('Page failed again','/home','0.1.0','desktop','Chrome')",
    ),
  ).rejects.toThrow();
});
