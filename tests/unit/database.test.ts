import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL engine, with minimal stand-ins for Supabase-owned auth/storage schemas.
// This verifies migration SQL/RLS, not the GoTrue, Storage or PostgREST services.
const db = new PGlite();
const student = '00000000-0000-4000-a000-000000000001';
const president = '00000000-0000-4000-a000-000000000002';
const secretary = '00000000-0000-4000-a000-000000000003';
const treasurer = '00000000-0000-4000-a000-000000000004';
const vice = '00000000-0000-4000-a000-000000000005';
const sessionId = (id: string) => id.replace('00000000-', '10000000-');
async function asUser(id: string, sql: string) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claims','${JSON.stringify({ sub: id, session_id: sessionId(id) })}',false);`,
  );
  try {
    return await db.query(sql);
  } finally {
    await db.exec('reset role');
  }
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid references auth.users);
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
 grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const file of [
    '202611130001_identity_foundation.sql',
    '202611130002_academic_content_foundation.sql',
    '202611130003_auth_onboarding.sql',
    '202611130004_hosted_verification.sql',
    '202611130005_account_administration.sql',
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  const roles = [
    [student, 'student'],
    [president, 'president'],
    [secretary, 'secretary'],
    [treasurer, 'treasurer'],
    [vice, 'vice_president'],
  ];
  for (const [id, role] of roles)
    await db.exec(
      `insert into auth.users values('${id}');insert into public.profiles(id,full_name,username,role) values('${id}','Test Person','test_${role}','${role}');insert into private.identities values('${id}','${role}@identity.c-lead.invalid','SN-${role}');insert into auth.sessions values('${sessionId(id!)}','${id}');insert into public.app_sessions(id,user_id) values('${sessionId(id!)}','${id}');`,
    );
}, 60000);
afterAll(async () => {
  await db.close();
});
describe('PostgreSQL security foundation', () => {
  it('hosted fixtures serialize runs, reject clients and retain audit referents', async () => {
    const run = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const id = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
    const ref = 'abcdefghijklmnopqrst';
    await expect(
      asUser(
        student,
        `select public.reserve_hosted_test('${run}','${ref}','${id}')`,
      ),
    ).rejects.toThrow();
    await db.exec(
      `select public.reserve_hosted_test('${run}','${ref}','${id}')`,
    );
    await expect(
      db.exec(
        `select public.reserve_hosted_test('cccccccc-cccc-4ccc-accc-cccccccccccc','${ref}','dddddddd-dddd-4ddd-addd-dddddddddddd')`,
      ),
    ).rejects.toThrow();
    await db.exec(
      `insert into auth.users values('${id}'); select public.provision_hosted_test('${run}','${ref}')`,
    );
    await expect(
      db.exec(
        `select public.retire_hosted_test('${run}','zzzzzzzzzzzzzzzzzzzz')`,
      ),
    ).rejects.toThrow();
    await db.exec(
      `select public.retire_hosted_test('${run}','${ref}'); select public.retire_hosted_test('${run}','${ref}',true); select public.retire_hosted_test('${run}','${ref}',true)`,
    );
    expect(
      (await db.query(`select active from public.profiles where id='${id}'`))
        .rows,
    ).toEqual([{ active: false }]);
    expect(
      (
        await db.query(
          `select id from public.audit_logs where target_id='${id}' and action='hosted_test_retired'`,
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          `select user_id from private.identities where user_id='${id}'`,
        )
      ).rows,
    ).toHaveLength(1);
  });
  it('migrations execute and all exposed tables enable RLS', async () => {
    const result = await db.query<{ relname: string }>(
      `select relname from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r' and not relrowsecurity`,
    );
    expect(result.rows).toEqual([]);
  });
  it('students see roster but cannot query private identities or edit roles', async () => {
    expect(
      (await asUser(student, 'select * from public.profiles')).rows,
    ).toHaveLength(5);
    await expect(
      asUser(student, 'select * from private.identities'),
    ).rejects.toThrow();
    await expect(
      asUser(
        student,
        `update public.profiles set role='president' where id='${student}'`,
      ),
    ).rejects.toThrow();
  });
  it('full student numbers are limited to self and operational admins', async () => {
    const own = await asUser(
      student,
      `select public.student_number_for('${student}') as value`,
    );
    expect(own.rows[0]).toEqual({ value: 'SN-student' });
    for (const role of [secretary, treasurer]) {
      const result = await asUser(
        role,
        `select public.student_number_for('${student}') as value`,
      );
      expect(result.rows[0]).toEqual({ value: '••••nt' });
    }
    for (const role of [president, vice]) {
      expect(
        (
          await asUser(
            role,
            `select public.student_number_for('${student}') as value`,
          )
        ).rows[0],
      ).toEqual({ value: 'SN-student' });
    }
  });
  it('ordinary users cannot read or forge audits', async () => {
    expect(
      (await asUser(student, 'select * from public.audit_logs')).rows,
    ).toHaveLength(0);
    await expect(
      asUser(
        student,
        `insert into public.audit_logs(action,target_type) values('fake','fake')`,
      ),
    ).rejects.toThrow();
    expect(
      (await asUser(president, 'select * from public.audit_logs')).rows.length,
    ).toBeGreaterThan(0);
    await expect(db.exec('delete from public.audit_logs')).rejects.toThrow(
      'append-only',
    );
  });
  it('validates onboarding and prevents policy-version forgery', async () => {
    await expect(
      asUser(
        student,
        `select public.complete_onboarding('invalid','light','{}',true,true,true)`,
      ),
    ).rejects.toThrow();
    expect(
      (await asUser(student, 'select * from public.policy_acceptances')).rows,
    ).toHaveLength(0);
    await asUser(
      student,
      `select public.complete_onboarding('fil','dark','{"tasks":false}',true,true,true)`,
    );
    expect(
      (await asUser(student, 'select * from public.policy_acceptances')).rows,
    ).toHaveLength(2);
    await expect(
      asUser(
        student,
        `insert into public.policy_acceptances values('${student}','privacy','fake',now())`,
      ),
    ).rejects.toThrow();
  });
  it('academic writes require academic officers and archived years lock', async () => {
    const sql = `insert into public.academic_years(name,starts_on,ends_on) values('2026','2026-01-01','2026-12-31')`;
    await expect(asUser(treasurer, sql)).rejects.toThrow();
    await asUser(secretary, sql);
    await asUser(
      secretary,
      `update public.academic_years set archived_at=now() where name='2026'`,
    );
    await asUser(
      secretary,
      `update public.academic_years set name='changed' where name='2026'`,
    );
    expect(
      (await db.query(`select name from public.academic_years`)).rows[0],
    ).toEqual({ name: '2026' });
  });
  it('locks after five failures and serializes concurrent attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const begin = await db.query<{ token: string }>(
        `select public.begin_login('lockout_test') as token`,
      );
      const token = begin.rows[0]!.token;
      expect(token).toBeTruthy();
      expect(
        (await db.query(`select public.begin_login('lockout_test') as token`))
          .rows[0],
      ).toEqual({ token: null });
      await db.query(`select public.finish_login('lockout_test',$1,false)`, [
        token,
      ]);
    }
    expect(
      (await db.query(`select public.begin_login('lockout_test') as token`))
        .rows[0],
    ).toEqual({ token: null });
    await db.exec(
      `update private.login_attempts set locked_until=now()-interval '1 second' where username='lockout_test'`,
    );
    const next = await db.query<{ token: string }>(
      `select public.begin_login('lockout_test') as token`,
    );
    expect(next.rows[0]!.token).toBeTruthy();
    await db.query(`select public.finish_login('lockout_test',$1,true)`, [
      next.rows[0]!.token,
    ]);
    expect(
      (
        await db.query(
          `select failures from private.login_attempts where username='lockout_test'`,
        )
      ).rows[0],
    ).toEqual({ failures: 0 });
  });
  it('denies direct counter manipulation', async () => {
    await expect(
      asUser(student, `select public.begin_login('test_student')`),
    ).rejects.toThrow();
  });
  it('requires explicit policy/tour acceptance and validates notification preferences atomically', async () => {
    await expect(
      asUser(
        secretary,
        `select public.complete_onboarding('en','light','{}',false,true,true)`,
      ),
    ).rejects.toThrow('Acceptance');
    await expect(
      asUser(
        secretary,
        `select public.complete_onboarding('en','light','{}',true,true,false)`,
      ),
    ).rejects.toThrow('Acceptance');
    await expect(
      asUser(
        student,
        `select public.save_my_preferences('en','light','{"security":false}')`,
      ),
    ).rejects.toThrow();
    await expect(
      asUser(
        student,
        `select public.save_my_preferences('en','light','{"tasks":"yes"}')`,
      ),
    ).rejects.toThrow();
    expect(
      (await asUser(student, `select language,theme from public.preferences`))
        .rows,
    ).toEqual([{ language: 'fil', theme: 'dark' }]);
    expect(
      (
        await asUser(
          student,
          `select category,enabled from public.notification_preferences`,
        )
      ).rows,
    ).toEqual([{ category: 'tasks', enabled: false }]);
    expect(
      (await asUser(secretary, `select * from public.notification_preferences`))
        .rows,
    ).toEqual([]);
    await expect(
      asUser(
        student,
        `insert into public.notification_preferences values('${secretary}','tasks',false,now())`,
      ),
    ).rejects.toThrow();
    expect(
      (
        await asUser(
          student,
          `select tour_completed_at is not null as complete from public.preferences`,
        )
      ).rows[0],
    ).toEqual({ complete: true });
  });
  it('lists and revokes only owned sessions with an audit entry', async () => {
    const other = '20000000-0000-4000-a000-000000000003';
    await db.exec(
      `insert into auth.sessions values('${other}','${secretary}');insert into public.app_sessions(id,user_id) values('${other}','${secretary}')`,
    );
    expect(
      (await asUser(secretary, `select * from public.my_sessions()`)).rows,
    ).toHaveLength(2);
    await expect(
      asUser(student, `select public.revoke_my_session('${other}')`),
    ).rejects.toThrow('Session unavailable');
    await asUser(secretary, `select public.revoke_my_session('${other}')`);
    expect(
      (await asUser(secretary, `select * from public.my_sessions()`)).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          `select action from public.audit_logs where target_id='${other}'`,
        )
      ).rows,
    ).toEqual([{ action: 'session_revoked' }]);
  });
  it('blocks stale password logins and resumes interrupted password changes', async () => {
    const other = '30000000-0000-4000-a000-000000000002';
    await db.exec(
      `insert into auth.sessions values('${other}','${president}');insert into public.app_sessions(id,user_id) values('${other}','${president}')`,
    );
    const lease = (
      await db.query<{ token: string }>(
        `select public.begin_login('test_president') as token`,
      )
    ).rows[0]!.token;
    const operation = (
      await asUser(president, `select public.begin_password_change() as id`)
    ).rows[0] as { id: string };
    expect(
      (await asUser(president, `select public.begin_password_change() as id`))
        .rows[0],
    ).toEqual(operation);
    expect(
      (await asUser(president, `select * from public.my_sessions()`)).rows,
    ).toHaveLength(1);
    expect(
      (await db.query(`select * from public.resolve_login('test_president')`))
        .rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `select public.approve_login('test_president',$1,'${other}',0,'Test') as approved`,
          [lease],
        )
      ).rows[0],
    ).toEqual({ approved: false });
    await db.query(`select public.finish_password_change($1,'${president}')`, [
      operation.id,
    ]);
    await db.query(`select public.finish_password_change($1,'${president}')`, [
      operation.id,
    ]);
    expect(
      (
        await db.query(
          `select action from public.audit_logs where action='password_changed' and actor_id='${president}'`,
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          `select category from public.notifications where user_id='${president}'`,
        )
      ).rows,
    ).toEqual([{ category: 'security' }]);
    expect(
      (
        await db.query(
          `select credential_generation from public.resolve_login('test_president')`,
        )
      ).rows[0],
    ).toEqual({ credential_generation: 1 });
    await expect(
      asUser(
        student,
        `select public.finish_password_change('${operation.id}','${president}')`,
      ),
    ).rejects.toThrow();
  });
  it('does not expose first-President provisioning to clients or allow replacing a roster', async () => {
    await expect(
      asUser(
        student,
        `select public.bootstrap_president('${student}','Name','username','number','internal@example.invalid')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `select public.bootstrap_president('${student}','Name','username','number','internal@example.invalid')`,
      ),
    ).rejects.toThrow('empty roster');
  });
  it('deactivation and application revocation deny existing JWTs', async () => {
    await db.exec(
      `update public.profiles set active=false where id='${treasurer}'`,
    );
    expect(
      (await asUser(treasurer, 'select * from public.profiles')).rows,
    ).toHaveLength(0);
    await db.exec(
      `update public.profiles set active=true where id='${treasurer}'`,
    );
    expect(
      (await asUser(treasurer, 'select * from public.profiles')).rows,
    ).toHaveLength(0);
    await asUser(student, 'select public.revoke_current_session()');
    expect(
      (await asUser(student, 'select * from public.profiles')).rows,
    ).toHaveLength(0);
  });
});
