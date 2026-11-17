import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { database, seed, asUser, userId, sessionId } from '../helpers/database';
let db: PGlite;
let created: string;
const op = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
beforeAll(async () => {
  db = await database();
  await seed(db, 1, 'president');
  await seed(db, 2, 'vice_president');
  await seed(db, 3, 'student');
  await seed(db, 4, 'secretary');
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe('audited account administration', () => {
  it('denies students and secretary; private operations remain inaccessible', async () => {
    for (const n of [3, 4]) {
      await expect(
        asUser(
          db,
          n,
          `select public.prepare_account('${op}','New','new_user','TEST-NEW')`,
        ),
      ).rejects.toThrow('Unauthorized');
      await expect(
        asUser(db, n, `select * from private.account_creations`),
      ).rejects.toThrow();
      await expect(
        asUser(
          db,
          n,
          `select public.prepare_account_reset('${userId(2)}','Test reason')`,
        ),
      ).rejects.toThrow('Unauthorized');
    }
  });
  it('reserves, resumes and completes account creation exactly once', async () => {
    await asUser(
      db,
      1,
      `select public.prepare_account('${op}','New','NEW_USER','TEST-NEW')`,
    );
    await asUser(
      db,
      2,
      `select public.prepare_account('${op}','New','new_user','TEST-NEW')`,
    );
    await expect(
      asUser(
        db,
        1,
        `select public.prepare_account('${op}','Other','new_user','TEST-NEW')`,
      ),
    ).rejects.toThrow('mismatch');
    const result = await db.query<{ user_id: string }>(
      `select * from public.account_creation_details('${op}','${userId(2)}','${sessionId(2)}')`,
    );
    created = result.rows[0]!.user_id;
    await db.exec(
      `insert into auth.users values('${created}');select public.finish_account_creation('${op}','${userId(2)}','${sessionId(2)}');select public.finish_account_creation('${op}','${userId(2)}','${sessionId(2)}');`,
    );
    expect(
      (await db.query(`select * from public.profiles where id='${created}'`))
        .rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          `select * from public.audit_logs where action='account_created' and target_id='${created}'`,
        )
      ).rows,
    ).toHaveLength(1);
  });
  it('detects database duplicates and masks numbers for ordinary members', async () => {
    await expect(
      asUser(
        db,
        1,
        `select public.prepare_account('bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb','Duplicate','new_user','DIFFERENT')`,
      ),
    ).rejects.toThrow();
    await expect(
      asUser(
        db,
        1,
        `select public.prepare_account('bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb','Duplicate','different','TEST-NEW')`,
      ),
    ).rejects.toThrow();
    const roster = await asUser(db, 3, 'select * from public.account_roster()');
    expect(roster.rows.find((r) => r.id === created)?.student_number).toBe(
      '••••EW',
    );
    expect(roster.rows.find((r) => r.id === userId(3))?.student_number).toBe(
      'TEST-3',
    );
  });
  it('edits, assigns/removes officers, deactivates/reactivates and audits without recording numbers', async () => {
    for (const [role, active] of [
      ['treasurer', true],
      ['student', false],
      ['student', true],
    ] as const)
      await asUser(
        db,
        2,
        `select public.edit_account('${created}','Updated','new_user','PRIVATE-UPDATED','${role}',${active},'Test correction')`,
      );
    expect(
      (
        await db.query(
          `select role,active from public.profiles where id='${created}'`,
        )
      ).rows[0],
    ).toEqual({ role: 'student', active: true });
    expect(
      JSON.stringify(
        (
          await db.query(
            `select * from public.audit_logs where target_id='${created}'`,
          )
        ).rows,
      ),
    ).not.toContain('PRIVATE-UPDATED');
    await expect(
      asUser(
        db,
        2,
        `select public.edit_account('${created}','Updated','new_user','PRIVATE-UPDATED','president',true,'Not allowed')`,
      ),
    ).rejects.toThrow('President');
    await expect(
      asUser(
        db,
        2,
        `select public.edit_account('${created}','Updated','new_user','PRIVATE-UPDATED','student',true,null)`,
      ),
    ).rejects.toThrow('Reason');
  });
  it('resets revoke sessions, resolve interrupted changes and preserve operation audits', async () => {
    await asUser(db, 3, 'select public.begin_password_change()');
    const lease = await db.query<{ id: string }>(
      `select public.claim_credential_write('${userId(3)}') id`,
    );
    await expect(
      asUser(
        db,
        1,
        `select public.prepare_account_reset('${userId(3)}','Recovery')`,
      ),
    ).rejects.toThrow('in progress');
    await db.exec(
      `select public.release_credential_write('${userId(3)}','${lease.rows[0]!.id}')`,
    );
    const prepared = await asUser(
      db,
      2,
      `select public.prepare_account_reset('${userId(3)}','Recovery') id`,
    );
    const id = prepared.rows[0]!.id;
    const claim = (
      await db.query<{ id: string }>(
        `select public.claim_credential_write('${userId(3)}') id`,
      )
    ).rows[0]!.id;
    await db.exec(
      `select public.set_password_fingerprint('${userId(3)}','${'a'.repeat(64)}','${claim}','${id}','reset')`,
    );
    await expect(
      db.exec(
        `select public.set_password_fingerprint('${userId(3)}','${'b'.repeat(64)}','00000000-0000-4000-a000-000000000099','${id}','reset')`,
      ),
    ).rejects.toThrow('expired');
    expect(
      (await asUser(db, 3, 'select public.is_active_session() active')).rows[0],
    ).toEqual({ active: false });
    expect(
      (await db.query(`select * from public.resolve_login('fictional_3')`))
        .rows,
    ).toHaveLength(0);
    await db.exec(
      `select public.finish_account_reset('${id}','${userId(2)}','${sessionId(2)}');select public.finish_account_reset('${id}','${userId(2)}','${sessionId(2)}')`,
    );
    expect(
      (await db.query(`select * from public.resolve_login('fictional_3')`))
        .rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          `select * from public.audit_logs where action='password_reset_completed' and target_id='${userId(3)}'`,
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          `select * from public.notifications where user_id='${userId(3)}' and category='security'`,
        )
      ).rows,
    ).toHaveLength(1);
  });
  it('service completion checks the live operator session', async () => {
    await expect(
      asUser(
        db,
        4,
        `select public.admin_revoke_sessions('${userId(1)}','Forbidden action')`,
      ),
    ).rejects.toThrow('Unauthorized');
    await asUser(
      db,
      1,
      `select public.admin_revoke_sessions('${userId(4)}','Test revocation')`,
    );
    expect(
      (await asUser(db, 4, 'select public.is_active_session() active')).rows[0],
    ).toEqual({ active: false });
    await db.exec(
      `update public.app_sessions set revoked_at=now() where id='${sessionId(2)}'`,
    );
    await expect(
      db.exec(
        `select public.account_creation_details('${op}','${userId(2)}','${sessionId(2)}')`,
      ),
    ).rejects.toThrow('Unauthorized');
  });
});
it('controlled President bootstrap is reserved, idempotent and cannot replace the President', async () => {
  const isolated = await database();
  try {
    const id = userId(90);
    const args = `'${id}','Fictional President','first_president','TEST-FIRST'`;
    await isolated.exec(
      `select public.reserve_president(${args});select public.reserve_president(${args});insert into auth.users values('${id}');select public.bootstrap_president(${args},'${id}@identity.c-lead.invalid');select public.bootstrap_president(${args},'${id}@identity.c-lead.invalid');`,
    );
    expect(
      (
        await isolated.query(
          `select * from public.profiles where role='president'`,
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await isolated.query(
          `select * from public.audit_logs where action='president_bootstrapped'`,
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      isolated.exec(
        `select public.reserve_president('${userId(91)}','Other','another','TEST-OTHER')`,
      ),
    ).rejects.toThrow('reserved');
  } finally {
    await isolated.close();
  }
}, 60000);
