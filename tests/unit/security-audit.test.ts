import { beforeAll, afterAll, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { database } from '../helpers/database';
let db: PGlite;
beforeAll(async () => {
  db = await database();
}, 60000);
afterAll(async () => await db?.close());
it('enables RLS on every application table and exposes no public RPC to anonymous callers', async () => {
  const tables = await db.query(
    "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')and c.relkind='r'and not c.relrowsecurity",
  );
  expect(tables.rows).toEqual([]);
  const functions = await db.query(
    "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon',p.oid,'execute')",
  );
  expect(functions.rows).toEqual([]);
});
it('keeps sensitive domain writes behind checked RPCs and private tables inaccessible', async () => {
  const direct = await db.query(
    "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private'and c.relkind='r'and (has_table_privilege('authenticated',c.oid,'select')or has_table_privilege('authenticated',c.oid,'insert')or has_table_privilege('authenticated',c.oid,'update')or has_table_privilege('authenticated',c.oid,'delete'))",
  );
  expect(direct.rows).toEqual([]);
  for (const table of [
    'profiles',
    'posts',
    'tasks',
    'polls',
    'attendance_records',
    'contribution_records',
    'problem_reports',
    'audit_logs',
  ]) {
    expect(
      (
        await db.query(
          `select has_table_privilege('authenticated','public.${table}','insert,update,delete') allowed`,
        )
      ).rows,
    ).toEqual([{ allowed: false }]);
  }
});
