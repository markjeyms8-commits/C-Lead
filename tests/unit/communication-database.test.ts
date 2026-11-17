import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { database, seed, asUser, userId, sessionId } from '../helpers/database';
let db: PGlite;
const year = '20000000-0000-4000-a000-000000000001',
  term = '20000000-0000-4000-a000-000000000002',
  subject = '20000000-0000-4000-a000-000000000003';
let official: string,
  discussion: string,
  root: string,
  reply: string,
  report: string;
const body = (text = 'Safe classroom text') =>
  JSON.stringify([{ type: 'paragraph', text }]).replaceAll("'", "''");
const create = (
  kind: string,
  state: string,
  title = 'Fictional post',
  time = 'now()',
  expiry = 'null',
  pinned = false,
) =>
  `select public.save_post(null,'${kind}','${term}','${title}','${body()}'::jsonb,'${state}',${time},${expiry},${pinned}) id`;
beforeAll(async () => {
  db = await database();
  for (const [n, role] of [
    [1, 'president'],
    [2, 'student'],
    [3, 'student'],
    [4, 'secretary'],
  ] as const)
    await seed(db, n, role);
  await db.exec(
    `insert into public.academic_years(id,name,starts_on,ends_on) values('${year}','Test year','2026-01-01','2027-12-31');insert into public.semesters(id,academic_year_id,name,starts_on,ends_on) values('${term}','${year}','Test term','2026-01-01','2027-01-01');insert into public.subjects(id,semester_id,code,name) values('${subject}','${term}','TEST','Test subject');`,
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe('communication authorization and lifecycle', () => {
  it('denies official publishing by students/secretary and rejects unsafe rich-text structures', async () => {
    for (const n of [2, 4])
      await expect(
        asUser(db, n, create('announcement', 'published')),
      ).rejects.toThrow();
    await expect(
      asUser(
        db,
        1,
        `select public.save_post(null,'announcement','${term}','Unsafe','[{"type":"paragraph","text":"Click","url":"javascript:alert(1)"}]','published',now(),null,false)`,
      ),
    ).rejects.toThrow();
    await expect(
      asUser(
        db,
        2,
        `insert into public.posts(semester_id,author_id,kind,title)values('${term}','${userId(2)}','announcement','Bypass')`,
      ),
    ).rejects.toThrow();
    official = String(
      (
        await asUser(
          db,
          1,
          create('announcement', 'published', 'Pinned', 'now()', 'null', true),
        )
      ).rows[0]!.id,
    );
  });
  it('keeps scheduled posts out of active feed and moves expired posts to archive with official priority', async () => {
    await asUser(
      db,
      1,
      create(
        'announcement',
        'published',
        'Scheduled',
        "now()+interval '1 day'",
      ),
    );
    await asUser(
      db,
      1,
      create(
        'announcement',
        'published',
        'Expired',
        "now()-interval '2 days'",
        "now()-interval '1 day'",
      ),
    );
    expect(
      (
        await asUser(
          db,
          2,
          `select title from public.communication_feed('active','all',0)`,
        )
      ).rows,
    ).toEqual([{ title: 'Pinned' }]);
    expect(
      (
        await asUser(
          db,
          2,
          `select title from public.communication_feed('archive','all',0)`,
        )
      ).rows,
    ).toEqual([{ title: 'Expired' }]);
  });
  it('requires review, records reasons and returns edited discussions to approval', async () => {
    discussion = String(
      (
        await asUser(
          db,
          2,
          create('discussion', 'pending', 'Student conversation', 'null'),
        )
      ).rows[0]!.id,
    );
    expect(
      (
        await asUser(
          db,
          3,
          `select id from public.posts where id='${discussion}'`,
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      asUser(
        db,
        4,
        `select public.review_discussion('${discussion}','approved','Good discussion')`,
      ),
    ).rejects.toThrow();
    await asUser(
      db,
      1,
      `select public.review_discussion('${discussion}','approved','Good discussion')`,
    );
    expect(
      (
        await asUser(
          db,
          3,
          `select kind from public.communication_feed('active','all',0)`,
        )
      ).rows,
    ).toEqual([{ kind: 'announcement' }, { kind: 'discussion' }]);
    await asUser(
      db,
      2,
      `select public.save_post('${discussion}','discussion','${term}','Edited','${body()}','pending',null,null,false)`,
    );
    expect(
      (
        await asUser(
          db,
          3,
          `select id from public.posts where id='${discussion}'`,
        )
      ).rows,
    ).toHaveLength(0);
    await asUser(
      db,
      1,
      `select public.review_discussion('${discussion}','rejected','Please revise')`,
    );
    expect(
      (
        await asUser(
          db,
          2,
          `select decision from public.discussion_decisions where post_id='${discussion}' order by created_at`,
        )
      ).rows,
    ).toHaveLength(2);
  });
  it('enforces one reply level, own editing and one reaction per item', async () => {
    root = String(
      (
        await asUser(
          db,
          2,
          `select public.save_comment(null,'${official}',null,'Root comment') id`,
        )
      ).rows[0]!.id,
    );
    reply = String(
      (
        await asUser(
          db,
          3,
          `select public.save_comment(null,'${official}','${root}','Reply comment') id`,
        )
      ).rows[0]!.id,
    );
    await expect(
      asUser(
        db,
        2,
        `select public.save_comment(null,'${official}','${reply}','Nested reply')`,
      ),
    ).rejects.toThrow('one reply');
    await expect(
      asUser(
        db,
        3,
        `select public.save_comment('${root}','${official}',null,'Hijack')`,
      ),
    ).rejects.toThrow();
    await asUser(
      db,
      2,
      `select public.save_comment('${root}','${official}',null,'Edited comment');select public.set_reaction('${official}',null,'like');select public.set_reaction('${official}',null,'support')`,
    );
    expect(
      (
        await asUser(
          db,
          3,
          `select reaction from public.reactions where post_id='${official}'`,
        )
      ).rows,
    ).toEqual([{ reaction: 'support' }]);
  });
  it('delivers student/group mentions once and respects category preferences', async () => {
    const group = '20000000-0000-4000-a000-000000000004';
    await db.exec(
      `insert into public.subject_groups(id,subject_id,creator_id,name,mention_handle) values('${group}','${subject}','${userId(2)}','Study group','study_team');insert into public.group_members(group_id,user_id)values('${group}','${userId(2)}'),('${group}','${userId(3)}');insert into public.notification_preferences(user_id,category,enabled) values('${userId(3)}','mentions',false);`,
    );
    await asUser(
      db,
      1,
      `select public.save_post(null,'announcement','${term}','Mentions','${body('@fictional_2 @group:study_team')}','published',now(),null,false)`,
    );
    expect(
      (
        await db.query(
          `select user_id from public.notifications where category='mentions'`,
        )
      ).rows,
    ).toEqual([{ user_id: userId(2) }]);
  });
  it('moderation requires authority/reasons and preserves an audit trail', async () => {
    report = String(
      (
        await asUser(
          db,
          2,
          `select public.report_content('${official}',null,'Test report') id`,
        )
      ).rows[0]!.id,
    );
    await expect(
      asUser(
        db,
        4,
        `select public.moderate_report('${report}','hidden','Reason')`,
      ),
    ).rejects.toThrow();
    await expect(
      asUser(db, 1, `select public.moderate_report('${report}','hidden','')`),
    ).rejects.toThrow();
    await asUser(
      db,
      1,
      `select public.moderate_report('${report}','hidden','Investigating report')`,
    );
    expect(
      (
        await asUser(
          db,
          3,
          `select id from public.posts where id='${official}'`,
        )
      ).rows,
    ).toHaveLength(0);
    await asUser(
      db,
      1,
      `select public.moderate_report('${report}','restored','Review complete')`,
    );
    await asUser(db, 2, `select public.delete_comment('${root}')`);
    expect(
      (
        await asUser(
          db,
          3,
          `select body from public.comments where id='${root}'`,
        )
      ).rows,
    ).toEqual([{ body: '' }]);
    expect(
      (
        await db.query(
          `select id from public.audit_logs where action='moderation_hidden'`,
        )
      ).rows,
    ).toHaveLength(1);
  });
  it('checks attachment limits/ownership and blocks final deletion until Storage metadata is finalized', async () => {
    await expect(
      asUser(
        db,
        2,
        `select public.reserve_attachment('${official}','test.pdf','application/pdf',5)`,
      ),
    ).rejects.toThrow();
    await expect(
      asUser(
        db,
        1,
        `select public.reserve_attachment('${official}','test.exe','application/pdf',5)`,
      ),
    ).rejects.toThrow();
    const files: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await asUser(
        db,
        1,
        `select (public.reserve_attachment('${official}','test${i}.pdf','application/pdf',5)).id`,
      );
      files.push(String(r.rows[0]!.id));
    }
    await expect(
      asUser(
        db,
        1,
        `select public.reserve_attachment('${official}','six.pdf','application/pdf',5)`,
      ),
    ).rejects.toThrow('Five');
    await db.exec(
      `select public.finish_attachment_upload('${files[0]}','${userId(1)}','${sessionId(1)}')`,
    );
    await expect(
      asUser(db, 2, `select public.attachment_access('${files[0]}','delete')`),
    ).rejects.toThrow();
    expect(
      (
        await asUser(
          db,
          2,
          `select (public.attachment_access('${files[0]}','read')).filename`,
        )
      ).rows,
    ).toEqual([{ filename: 'test0.pdf' }]);
    await expect(
      asUser(
        db,
        1,
        `select public.prepare_post_deletion('${official}','Test deletion',null)`,
      ),
    ).rejects.toThrow('Upload');
    await db.exec(
      `update public.post_attachments set created_at=now()-interval '3 minutes' where post_id='${official}'`,
    );
    await asUser(
      db,
      1,
      `select public.prepare_post_deletion('${official}','Test deletion',null)`,
    );
    await expect(
      db.exec(
        `select public.finish_post_deletion('${official}','${userId(1)}','${sessionId(1)}',null)`,
      ),
    ).rejects.toThrow('incomplete');
    for (const id of files)
      await db.exec(
        `select public.finish_attachment_delete('${id}','${userId(1)}')`,
      );
    await db.exec(
      `select public.finish_post_deletion('${official}','${userId(1)}','${sessionId(1)}',null)`,
    );
    await expect(
      asUser(
        db,
        1,
        `select public.moderate_report('${report}','restored','Cannot revive deleted content')`,
      ),
    ).rejects.toThrow('Removed content');
    expect(
      (
        await asUser(
          db,
          3,
          `select id from public.posts where id='${official}'`,
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `select id from public.post_attachments where post_id='${official}' and state='deleted'`,
        )
      ).rows,
    ).toHaveLength(5);
  });
  it('makes archived terms read-only and exposes no newly added writable tables', async () => {
    await db.exec(
      `update public.academic_years set archived_at=now() where id='${year}'`,
    );
    await expect(
      asUser(db, 1, create('announcement', 'published')),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          `select relname from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r' and not relrowsecurity`,
        )
      ).rows,
    ).toEqual([]);
  });
});
