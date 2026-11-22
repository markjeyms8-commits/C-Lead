import { test, expect, type Page } from '@playwright/test';
import { Buffer } from 'node:buffer';
const userId = '00000000-0000-4000-a000-000000000001';
const sessionId = '10000000-0000-4000-a000-000000000001';
const secondSession = '20000000-0000-4000-a000-000000000001';
async function fixture(
  page: Page,
  initiallyOnboarded = false,
  role = 'student',
) {
  const state = {
    onboarded: initiallyOnboarded,
    role,
    active: true,
    locked: false,
    unavailable: false,
    language: 'en',
    theme: 'light',
    notifications: {} as Record<string, boolean>,
    passwordChanged: false,
    otherSession: true,
  };
  const user = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'private@identity.c-lead.invalid',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-11-13T00:00:00Z',
  };
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const access_token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, session_id: sessionId, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
  await page.routeWebSocket('wss://auth-fixture.invalid/**', (socket) =>
    socket.close(),
  );
  await page.route('https://auth-fixture.invalid/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const body = req.postDataJSON() as Record<string, unknown> | null;
    const send = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify(data),
      });
    if (req.method() === 'OPTIONS') return send({});
    if (path === '/functions/v1/username-login')
      return state.locked
        ? send(
            { error: 'Invalid credentials or locked', retry_after: 900 },
            401,
          )
        : send({
            session: { access_token, refresh_token: 'test-refresh-token' },
          });
    if (path === '/auth/v1/user') return send(user);
    if (path === '/auth/v1/logout') return send({});
    if (path === '/rest/v1/rpc/is_active_session')
      return state.unavailable
        ? send({ message: 'Temporary outage' }, 503)
        : send(state.active);
    if (path === '/rest/v1/rpc/communication_feed') return send([]);
    if (path === '/rest/v1/subject_groups') return send([]);
    if (path === '/rest/v1/profiles') {
      const profile = {
        id: userId,
        full_name: 'Test Student',
        username: 'test_student',
        role: state.role,
        active: state.active,
      };
      return send(
        req.headers()['accept']?.includes('vnd.pgrst.object')
          ? profile
          : [profile],
      );
    }
    if (path === '/rest/v1/policy_acceptances')
      return send(
        state.onboarded ? [{ policy: 'privacy' }, { policy: 'community' }] : [],
      );
    if (path === '/rest/v1/preferences')
      return send({
        language: state.language,
        theme: state.theme,
        tour_completed_at: state.onboarded ? '2026-11-13T00:00:00Z' : null,
      });
    if (path === '/rest/v1/notification_preferences')
      return send(
        Object.entries(state.notifications).map(([category, enabled]) => ({
          category,
          enabled,
        })),
      );
    if (path === '/rest/v1/rpc/complete_onboarding') {
      expect(body?.privacy_accepted).toBe(true);
      expect(body?.community_accepted).toBe(true);
      expect(body?.tour_completed).toBe(true);
      state.onboarded = true;
      state.language = String(body?.chosen_language);
      state.theme = String(body?.chosen_theme);
      state.notifications = body?.notification_choices as Record<
        string,
        boolean
      >;
      return send(null);
    }
    if (path === '/rest/v1/rpc/save_my_preferences') {
      state.language = String(body?.chosen_language);
      state.theme = String(body?.chosen_theme);
      state.notifications = body?.notification_choices as Record<
        string,
        boolean
      >;
      return send(null);
    }
    if (path === '/rest/v1/rpc/student_number_for') return send('TEST-0001');
    if (path === '/rest/v1/rpc/my_sessions')
      return send([
        {
          id: sessionId,
          device_label: 'Desktop · Chrome',
          created_at: '2026-11-13T00:00:00Z',
          is_current: true,
        },
        ...(state.otherSession
          ? [
              {
                id: secondSession,
                device_label: 'Android · Chrome',
                created_at: '2026-11-12T00:00:00Z',
                is_current: false,
              },
            ]
          : []),
      ]);
    if (path === '/rest/v1/rpc/revoke_my_session') {
      if (body?.target_session === sessionId) state.active = false;
      else state.otherSession = false;
      return send(null);
    }
    if (path === '/rest/v1/rpc/revoke_current_session') {
      state.active = false;
      return send(null);
    }
    if (path === '/functions/v1/change-password') {
      expect(String(body?.password).length).toBeGreaterThanOrEqual(12);
      state.passwordChanged = true;
      state.otherSession = false;
      return send({ success: true });
    }
    return send({ message: `Unexpected test request ${path}` }, 500);
  });
  return state;
}
async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill('test_student');
  await page
    .getByLabel('Password', { exact: true })
    .fill('temporary-test-number');
  await page.getByRole('button', { name: 'Sign in', exact: false }).click();
}
test('secretary creates, edits and archives an academic year', async ({
  page,
}) => {
  await fixture(page, true, 'secretary');
  const rows: Record<string, unknown>[] = [];
  await page.route(
    'https://auth-fixture.invalid/rest/v1/academic_years*',
    async (route) => {
      const request = route.request();
      if (request.method() === 'POST')
        rows.push({
          id: '00000000-0000-4000-a000-000000000010',
          archived_at: null,
          ...request.postDataJSON(),
        });
      if (request.method() === 'PATCH')
        Object.assign(rows[0]!, request.postDataJSON());
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          request.method() === 'GET' ? rows : { id: rows[0]?.id },
        ),
      });
    },
  );
  for (const table of ['semesters', 'subjects'])
    await page.route(
      `https://auth-fixture.invalid/rest/v1/${table}*`,
      (route) => route.fulfill({ contentType: 'application/json', body: '[]' }),
    );
  await signIn(page);
  await expect(page).toHaveURL(/home$/);
  await page.goto('/administration/terms');
  await page.getByLabel('Name', { exact: true }).fill('Test academic year');
  await page.getByLabel('Start date').fill('2026-06-01');
  await page.getByLabel('End date').fill('2027-04-01');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Test academic year', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Updated academic year');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Updated academic year' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page
    .locator('ion-alert')
    .getByRole('button', { name: 'Archive', exact: true })
    .click();
  await expect(
    page.getByText('Read-only: this record or its parent is archived.'),
  ).toBeVisible();
  expect(rows[0]?.archived_at).toBeTruthy();
});
test('first login saves policy acceptance, category choices and optional-password onboarding', async ({
  page,
}) => {
  const state = await fixture(page);
  await signIn(page);
  await expect(page).toHaveURL(/onboarding$/);
  await expect(
    page.getByRole('button', { name: 'Enter my classroom' }),
  ).toBeDisabled();
  await page.getByLabel('I accept the Privacy Notice').check();
  await page.getByLabel('I accept the Community Guidelines').check();
  await page.getByLabel('I have read Ci’s tour', { exact: false }).check();
  await page
    .getByRole('checkbox', { name: 'Reactions', exact: true })
    .uncheck();
  await page.getByRole('button', { name: 'Enter my classroom' }).click();
  await expect(page).toHaveURL(/home$/);
  expect(state.notifications.reactions).toBe(false);
  expect(state.passwordChanged).toBe(false);
  await page.reload();
  await expect(page).toHaveURL(/home$/);
  await expect(
    page.getByRole('heading', { name: 'Hello, Section C!' }),
  ).toBeVisible();
});
test('lockout prevents resubmission and displays server retry interval', async ({
  page,
}) => {
  const state = await fixture(page);
  state.locked = true;
  await signIn(page);
  await expect(page.getByText(/Try again in \d+ seconds/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: false }),
  ).toBeDisabled();
});
test('preferences persist and security notices cannot be disabled', async ({
  page,
}) => {
  const state = await fixture(page, true);
  await signIn(page);
  await expect(page).toHaveURL(/home$/);
  await page.goto('/settings/notifications');
  await page.getByRole('checkbox', { name: 'Tasks', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Your preferences are saved.' }),
  ).toBeVisible();
  expect(state.notifications.tasks).toBe(false);
  await page.reload();
  await expect(
    page.getByRole('checkbox', { name: 'Tasks', exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Security', exact: true }),
  ).toHaveCount(0);
  await page.goto('/settings/preferences');
  await page
    .getByRole('combobox', { name: 'Theme', exact: true })
    .selectOption('dark');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(state.theme).toBe('dark');
  await page.goto('/home');
  await page.getByRole('button', { name: 'Theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => state.theme).toBe('light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
test('owned devices can be revoked and password can be changed', async ({
  page,
}) => {
  const state = await fixture(page, true);
  await signIn(page);
  await expect(page).toHaveURL(/home$/);
  await page.goto('/settings/sessions');
  await page
    .locator('li')
    .filter({ hasText: 'Android · Chrome' })
    .getByRole('button', { name: 'End session' })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'End session' })
    .click();
  await expect(page.getByText('Android · Chrome', { exact: true })).toHaveCount(
    0,
  );
  expect(state.otherSession).toBe(false);
  await page.goto('/settings/password');
  await page.getByLabel('Password', { exact: true }).fill('new-test-password');
  await page.getByLabel('Confirm new password').fill('new-test-password');
  await page
    .getByRole('button', { name: 'Change password', exact: true })
    .click();
  await expect(
    page.getByText('Your password has changed.', { exact: false }),
  ).toBeVisible();
  expect(state.passwordChanged).toBe(true);
});
test('role guards, revocation and outage handling keep authentication boundaries', async ({
  page,
}) => {
  const state = await fixture(page, true);
  await signIn(page);
  await expect(page).toHaveURL(/home$/);
  await page.goto('/administration');
  await expect(page).toHaveURL(/forbidden$/);
  state.unavailable = true;
  await page.goto('/settings/sessions');
  await expect(page).toHaveURL(/login$/);
  await expect(
    page.getByText('We could not verify your session.', { exact: false }),
  ).toBeVisible();
  state.unavailable = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page).toHaveURL(/home$/);
  state.active = false;
  await page.goto('/profile');
  await expect(page).toHaveURL(/login$/);
  await expect(
    page.getByText('Your session has ended', { exact: false }),
  ).toBeVisible();
});
test('mobile browser requires installation after onboarding', async ({
  browser,
}) => {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await fixture(page, true);
  await signIn(page);
  await expect(page).toHaveURL(/install$/);
  await expect(
    page.getByText('Mobile access requires installation.', { exact: false }),
  ).toBeVisible();
  await context.close();
});
test('administrator creates, edits, resets and imports CSV/XLSX with a reviewed result', async ({
  page,
}) => {
  await fixture(page, true, 'vice_president');
  const roster: Array<Record<string, unknown>> = [];
  let reset = false;
  let revoked = false;
  await page.route(
    'https://auth-fixture.invalid/rest/v1/rpc/account_roster*',
    (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(roster),
      }),
  );
  await page.route(
    'https://auth-fixture.invalid/rest/v1/rpc/pending_account_creations',
    (route) => route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  await page.route(
    'https://auth-fixture.invalid/functions/v1/admin-accounts',
    async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'create')
        roster.push({
          id: `00000000-0000-4000-a000-${String(roster.length + 10).padStart(12, '0')}`,
          full_name: body.full_name,
          username: body.username,
          student_number: body.student_number,
          role: 'student',
          active: true,
        });
      else reset = true;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, user_id: roster.at(-1)?.id }),
      });
    },
  );
  await page.route(
    'https://auth-fixture.invalid/rest/v1/rpc/admin_revoke_sessions',
    async (route) => {
      revoked = true;
      await route.fulfill({ contentType: 'application/json', body: 'null' });
    },
  );
  await page.route(
    'https://auth-fixture.invalid/rest/v1/rpc/edit_account',
    async (route) => {
      const b = route.request().postDataJSON();
      Object.assign(
        roster.find((r) => r.id === b.target_user)!,
        {
          full_name: b.official_name,
          username: b.login_username,
          student_number: b.official_number,
          role: b.assigned_role,
          active: b.is_active,
        },
      );
      await route.fulfill({ contentType: 'application/json', body: 'null' });
    },
  );
  await signIn(page);
  await expect(page).toHaveURL(/home$/);
  await page.goto('/administration');
  await page
    .getByLabel('Official name', { exact: true })
    .fill('Fictional Manual');
  await page.getByLabel('Username', { exact: true }).fill('manual_student');
  await page.getByLabel('Student number', { exact: true }).fill('000123');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page
    .locator('ion-alert')
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  await expect(
    page.getByText('Fictional Manual', { exact: true }),
  ).toBeVisible();
  expect(roster[0]?.student_number).toBe('000123');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByLabel('Reason for change or reset')
    .fill('Fictional role assignment');
  await page.getByLabel('Role', { exact: true }).selectOption('secretary');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page
    .locator('ion-alert')
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  await expect.poll(() => roster[0]?.role).toBe('secretary');
  for (const enabled of [false, true]) {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page
      .getByLabel('Reason for change or reset')
      .fill('Fictional status change');
    await page.getByLabel('Active', { exact: true }).setChecked(enabled);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page
      .locator('ion-alert')
      .getByRole('button', { name: 'Confirm', exact: true })
      .click();
    await expect.poll(() => roster[0]?.active).toBe(enabled);
  }

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Reason for change or reset').fill('Fictional reset');
  await page
    .getByRole('button', {
      name: 'Reset password / recover interrupted change',
    })
    .click();
  await page
    .locator('ion-alert')
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  await expect.poll(() => reset).toBe(true);
  await page
    .getByRole('button', { name: 'Revoke all sessions', exact: true })
    .click();
  await page
    .locator('ion-alert')
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  await expect.poll(() => revoked).toBe(true);

  await page.getByLabel('Roster file').setInputFiles({
    name: 'fictional.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'full_name,username,student_number\nFictional Duplicate,manual_student,000999\nFictional CSV,csv_student,000234',
    ),
  });
  await expect(
    page.getByText('Duplicate username', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Import / retry valid rows' }).click();
  await page
    .locator('ion-alert')
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  await expect(page.getByText('1 of 2 rows created.')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download results CSV' }).click();
  expect((await download).suggestedFilename()).toBe(
    'c-lead-import-results.csv',
  );
  const { default: write } = await import('write-excel-file/node');
  const buffer = await write(
    [
      ['full_name', 'username', 'student_number'],
      ['Fictional Excel', 'excel_student', '000345'],
    ].map((row) => row.map((value) => ({ type: String, value }))),
  ).toBuffer();
  await page.getByLabel('Roster file').setInputFiles({
    name: 'fictional.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
  await expect(
    page.getByRole('cell', { name: '000345', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Import / retry valid rows' }).click();
  await page
    .locator('ion-alert')
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  await expect(page.getByText('1 of 1 rows created.')).toBeVisible();
  await page.goto('/members');
  await page.getByLabel('Search members').fill('Excel');
  await expect(
    page.getByText('Fictional Excel', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Fictional Manual', { exact: true })).toHaveCount(
    0,
  );
});
async function communicationFixture(page: Page) {
  const postId = '30000000-0000-4000-a000-000000000001',
    term = '20000000-0000-4000-a000-000000000002',
    year = '20000000-0000-4000-a000-000000000001';
  const state = {
    post: null as Record<string, unknown> | null,
    comments: [] as Record<string, unknown>[],
    reactions: [] as Record<string, unknown>[],
    files: [] as Record<string, unknown>[],
    reports: [] as Record<string, unknown>[],
    decisions: [] as Record<string, unknown>[],
  };
  await page.route('https://auth-fixture.invalid/rest/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const b = req.postDataJSON();
    const send = (value: unknown) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(value),
      });
    if (path.endsWith('/academic_years'))
      return send([{ id: year, name: 'Test year', archived_at: null }]);
    if (path.endsWith('/semesters'))
      return send([
        {
          id: term,
          academic_year_id: year,
          name: 'Test semester',
          archived_at: null,
        },
      ]);
    if (path.endsWith('/rpc/save_post')) {
      state.post = {
        id: postId,
        semester_id: b.term_id,
        author_id: userId,
        kind: b.post_kind,
        title: b.post_title,
        body: b.content,
        state: b.desired_state,
        pinned: b.is_pinned,
        publish_at:
          b.desired_state === 'published'
            ? (b.publish_time ?? new Date().toISOString())
            : null,
        expires_at: b.expiry_time,
        edited_at: null,
        hidden_at: null,
        deletion_requested_at: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
      };
      return send(postId);
    }
    if (path.endsWith('/rpc/communication_feed'))
      return send(
        state.post &&
          !state.post.deleted_at &&
          !state.post.hidden_at &&
          (b.feed_mode !== 'review' || state.post.state === 'pending')
          ? [state.post]
          : [],
      );
    if (path.endsWith('/posts')) return send(state.post);
    if (path.endsWith('/rpc/post_permissions'))
      return send({
        readable: true,
        editable: !state.post?.deleted_at,
        interactable:
          ['published', 'approved'].includes(String(state.post?.state)) &&
          !state.post?.hidden_at,
      });
    if (path.endsWith('/comments')) return send(state.comments);
    if (path.endsWith('/reactions')) return send(state.reactions);
    if (path.endsWith('/discussion_decisions')) return send(state.decisions);
    if (path.endsWith('/post_attachments')) return send(state.files);
    if (path.endsWith('/content_reports')) return send(state.reports);
    if (path.endsWith('/rpc/record_announcement_view')) return send(null);
    if (path.endsWith('/rpc/save_comment')) {
      const id =
        '40000000-0000-4000-a000-' +
        String(state.comments.length + 1).padStart(12, '0');
      state.comments.push({
        id,
        post_id: postId,
        author_id: userId,
        parent_id: b.parent_comment,
        body: b.comment_body,
        edited_at: null,
        hidden_at: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
      });
      return send(id);
    }
    if (path.endsWith('/rpc/set_reaction')) {
      state.reactions = state.reactions.filter(
        (r) => r.comment_id !== b.target_comment,
      );
      if (b.chosen_reaction)
        state.reactions.push({
          id: 'reaction',
          post_id: postId,
          comment_id: b.target_comment,
          user_id: userId,
          reaction: b.chosen_reaction,
        });
      return send(null);
    }
    if (path.endsWith('/rpc/report_content')) {
      state.reports.push({
        id: '50000000-0000-4000-a000-000000000001',
        post_id: postId,
        comment_id: b.target_comment,
        reporter_id: userId,
        reason: b.report_reason,
        state: 'pending',
        created_at: new Date().toISOString(),
      });
      return send(state.reports.at(-1)?.id);
    }
    if (path.endsWith('/rpc/moderate_report')) {
      Object.assign(state.reports[0]!, {
        state: b.decision,
        decision_reason: b.moderation_reason,
      });
      state.post!.hidden_at =
        b.decision === 'hidden' ? new Date().toISOString() : null;
      return send(null);
    }
    if (path.endsWith('/rpc/review_discussion')) {
      state.post!.state = b.decision;
      state.post!.publish_at =
        b.decision === 'approved' ? new Date().toISOString() : null;
      state.decisions.push({
        id: 'decision',
        post_id: postId,
        reviewer_id: userId,
        decision: b.decision,
        reason: b.decision_reason,
        created_at: new Date().toISOString(),
      });
      return send(null);
    }
    return route.fallback();
  });
  await page.route(
    'https://auth-fixture.invalid/functions/v1/attachments',
    async (route) => {
      const req = route.request();
      if (req.headers()['x-clead-action'] === 'upload') {
        state.files.push({
          id: '60000000-0000-4000-a000-000000000001',
          post_id: postId,
          uploader_id: userId,
          filename: decodeURIComponent(req.headers()['x-clead-filename']!),
          mime_type: 'application/pdf',
          byte_size: 20,
          state: 'ready',
        });
        return route.fulfill({
          contentType: 'application/json',
          body: '{"success":true}',
        });
      }
      const body = req.postDataJSON();
      if (body.action === 'link')
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            url: 'https://auth-fixture.invalid/storage/v1/object/sign/attachments/fictional.pdf?token=temporary',
          }),
        });
      if (body.action === 'remove_post') {
        state.post!.deleted_at = new Date().toISOString();
        state.files = [];
        if (state.reports[0]) state.reports[0].state = 'removed';
      }
      if (body.action === 'delete')
        state.files = state.files.filter((f) => f.id !== body.attachment_id);
      return route.fulfill({
        contentType: 'application/json',
        body: '{"success":true}',
      });
    },
  );
  return { state, postId, term };
}
test('official publishing, comments, reactions, private files and moderation are connected', async ({
  page,
}) => {
  await fixture(page, true, 'president');
  const { state, term } = await communicationFixture(page);
  await signIn(page);
  await expect(page).toHaveURL(/home$/);
  await page.goto('/announcements/new');
  await page
    .getByLabel('Title', { exact: true })
    .fill('Fictional classroom announcement');
  await page.getByLabel('Semester', { exact: true }).selectOption(term);
  await page
    .getByLabel('Text block 1', { exact: true })
    .fill('Safe <script> text, never executable.');
  await page.getByLabel('Bold', { exact: true }).check();
  await page.getByLabel('Save as').selectOption('published');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Fictional classroom announcement',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Safe <script> text, never executable.', { exact: true }),
  ).toBeVisible();
  expect(await page.locator('.rich-content script').count()).toBe(0);
  await page.getByLabel('Comment text').fill('Fictional comment');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText('Fictional comment', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Like (0)', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: 'Like (1)', exact: true }).first(),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Add attachments').setInputFiles({
    name: 'fictional.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7 fictional'),
  });
  await expect(page.getByText('fictional.pdf', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Get temporary link' }).click();
  await expect(
    page.getByRole('link', { name: 'Open file (link expires shortly)' }),
  ).toHaveAttribute('href', /\/object\/sign\/.*token=/);
  await page
    .getByRole('button', { name: 'Report', exact: true })
    .first()
    .click();
  await page
    .getByLabel('Reason', { exact: true })
    .fill('Fictional moderation report');
  await page
    .locator('form')
    .filter({ has: page.getByLabel('Reason', { exact: true }) })
    .getByRole('button', { name: 'Report', exact: true })
    .click();
  await expect.poll(() => state.reports.length).toBe(1);
  await page.goto('/moderation');
  await page
    .getByLabel('Reason', { exact: true })
    .fill('Fictional review decision');
  await page
    .getByRole('button', { name: 'Hidden by moderation', exact: true })
    .click();
  await expect.poll(() => state.post?.hidden_at).toBeTruthy();
  await page.getByLabel('View', { exact: true }).selectOption('all');
  await page
    .getByLabel('Reason', { exact: true })
    .fill('Fictional removal decision');
  await page.getByRole('button', { name: 'Removed', exact: true }).click();
  await page
    .locator('ion-alert')
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect.poll(() => state.post?.deleted_at).toBeTruthy();
  expect(state.files).toHaveLength(0);
});
test('discussion submission stays read-only until an officer records a decision', async ({
  page,
}) => {
  const identity = await fixture(page, true, 'student');
  const { state, term, postId } = await communicationFixture(page);
  await signIn(page);
  await expect(page).toHaveURL(/home$/);
  await page.goto('/discussions/new');
  await page
    .getByLabel('Title', { exact: true })
    .fill('Fictional student discussion');
  await page.getByLabel('Semester', { exact: true }).selectOption(term);
  await page
    .getByLabel('Text block 1', { exact: true })
    .fill('A classroom discussion for review.');
  await page.getByLabel('Save as').selectOption('pending');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText(
      'This content is read-only or no longer open for interaction.',
    ),
  ).toBeVisible();
  expect(state.post?.state).toBe('pending');
  identity.role = 'president';
  await page.goto('/discussions/review');
  await page
    .getByLabel('Reason', { exact: true })
    .fill('Fictional approved discussion');
  await page.getByRole('button', { name: 'Approved', exact: true }).click();
  await expect.poll(() => state.post?.state).toBe('approved');
  identity.role = 'student';
  await page.goto(`/announcements/${postId}`);
  await expect(page.getByLabel('Comment text')).toBeVisible();
  await expect(
    page.getByText('Fictional approved discussion', { exact: false }),
  ).toBeVisible();
});
async function workFixture(page: Page) {
  const subject = '20000000-0000-4000-a000-000000000003',
    groupId = '70000000-0000-4000-a000-000000000001',
    pollId = '70000000-0000-4000-a000-000000000002',
    taskId = '70000000-0000-4000-a000-000000000003';
  const state = {
    groups: [] as Record<string, unknown>[],
    members: [] as Record<string, unknown>[],
    poll: null as Record<string, unknown> | null,
    options: [] as Record<string, unknown>[],
    vote: [] as string[],
    task: null as Record<string, unknown> | null,
    complete: false,
  };
  await page.route('https://auth-fixture.invalid/rest/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname,
      b = req.postDataJSON();
    const send = (v: unknown) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(v),
      });
    if (path.endsWith('/subjects'))
      return send([
        {
          id: subject,
          semester_id: '20000000-0000-4000-a000-000000000002',
          code: 'TEST',
          name: 'Fictional subject',
          archived_at: null,
        },
      ]);
    if (path.endsWith('/subject_groups')) return send(state.groups);
    if (path.endsWith('/group_members')) return send(state.members);
    if (path.endsWith('/rpc/save_group')) {
      state.groups = [
        {
          id: groupId,
          name: b.group_name,
          subject_id: b.group_subject,
          creator_id: userId,
          mention_handle: 'fictional-team',
          archived_at: null,
        },
      ];
      state.members = b.members.map((user_id: string) => ({
        group_id: groupId,
        user_id,
      }));
      return send(groupId);
    }
    if (path.endsWith('/rpc/moderate_group')) {
      state.groups[0]!.archived_at = new Date().toISOString();
      return send(null);
    }
    if (path.endsWith('/rpc/create_poll')) {
      state.poll = {
        id: pollId,
        semester_id: b.term_id,
        question: b.poll_question,
        multiple_choice: b.multiple,
        anonymous: b.is_anonymous,
        deadline: b.closes_at,
        result_visibility: b.visibility,
        allow_changes: b.can_change,
        closed_at: null,
      };
      state.options = b.labels.map((label: string, i: number) => ({
        id: `80000000-0000-4000-a000-${String(i + 1).padStart(12, '0')}`,
        poll_id: pollId,
        label,
        position: i,
      }));
      return send(pollId);
    }
    if (path.endsWith('/polls'))
      return send(
        req.headers()['accept']?.includes('vnd.pgrst.object')
          ? state.poll
          : state.poll
            ? [state.poll]
            : [],
      );
    if (path.endsWith('/poll_options')) return send(state.options);
    if (path.endsWith('/rpc/my_poll_vote')) return send(state.vote);
    if (path.endsWith('/rpc/vote_poll')) {
      state.vote = b.selected_options;
      return send(null);
    }
    if (path.endsWith('/rpc/poll_results'))
      return send({
        participants: state.vote.length ? 1 : 0,
        options: state.options.map((o) => ({
          ...o,
          votes: state.vote.includes(String(o.id)) ? 1 : 0,
          voters: null,
        })),
      });
    if (path.endsWith('/rpc/save_task')) {
      state.task = {
        id: taskId,
        subject_id: b.task_subject,
        creator_id: userId,
        title: b.task_title,
        description: b.task_description,
        deadline: b.due_at,
        target_type: b.audience,
        target_group_id: b.group_target,
        target_user_id: b.user_target,
        reminder_minutes: b.reminders,
        status: 'active',
      };
      return send(taskId);
    }
    if (path.endsWith('/tasks'))
      return send(
        req.headers()['accept']?.includes('vnd.pgrst.object')
          ? state.task
          : state.task
            ? [state.task]
            : [],
      );
    if (path.endsWith('/rpc/task_progress'))
      return send([
        {
          student_id: userId,
          full_name: 'Test Student',
          completed: state.complete,
          overdue: false,
          locked: state.task?.status === 'archived',
          revoked_at: null,
        },
      ]);
    if (path.endsWith('/rpc/set_task_completion')) {
      state.complete = b.is_complete;
      return send(null);
    }
    if (path.endsWith('/rpc/archive_task')) {
      state.task!.status = 'archived';
      return send(null);
    }
    return route.fallback();
  });
  return { state, subject, groupId, pollId, taskId };
}
test('subject groups save membership, allow edits and archive with a reason', async ({
  page,
}) => {
  const identity = await fixture(page, true, 'student');
  await communicationFixture(page);
  const { state, subject, groupId } = await workFixture(page);
  await signIn(page);
  await expect(page).toHaveURL(/home$/);
  await page.goto('/groups/new');
  await page
    .getByLabel('Group name', { exact: true })
    .fill('Fictional study group');
  await page.getByLabel('Subject', { exact: true }).selectOption(subject);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Fictional study group' }),
  ).toBeVisible();
  expect(state.members).toHaveLength(1);
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await page
    .getByLabel('Group name', { exact: true })
    .fill('Updated fictional group');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Updated fictional group' }),
  ).toBeVisible();
  identity.role = 'president';
  await page.goto(`/groups/${groupId}`);
  await page
    .getByRole('button', { name: 'Archive or remove group', exact: true })
    .click();
  await page
    .getByLabel('Reason', { exact: true })
    .fill('Fictional project completed');
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page
    .locator('ion-alert')
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  await expect.poll(() => state.groups[0]?.archived_at).toBeTruthy();
});
test('anonymous poll shows disclosure, accepts a vote and displays aggregate results', async ({
  page,
}) => {
  const identity = await fixture(page, true, 'president');
  const { term } = await communicationFixture(page);
  const { state, pollId } = await workFixture(page);
  await signIn(page);
  await expect(page).toHaveURL(/home$/);
  await page.goto('/polls/new');
  await page
    .getByLabel('Question', { exact: true })
    .fill('Fictional activity preference');
  await page.getByLabel('Semester', { exact: true }).selectOption(term);
  await page.getByLabel('Options', { exact: true }).fill('Reading\nPractice');
  await page
    .getByLabel('Voting deadline', { exact: true })
    .fill('2030-01-01T12:00');
  await page.getByLabel('Result visibility').selectOption('always');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Fictional activity preference' }),
  ).toBeVisible();
  identity.role = 'student';
  await page.goto(`/polls/${pollId}`);
  await expect(
    page.getByText('Anonymous voting: results do not reveal your identity.'),
  ).toBeVisible();
  await page.getByLabel('Reading', { exact: true }).check();
  await page.getByRole('button', { name: 'Save vote' }).click();
  await expect.poll(() => state.vote.length).toBe(1);
  await page.getByRole('button', { name: 'View results' }).click();
  await expect(
    page.getByText('Participants: 1', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save vote' })).toBeDisabled();
});
test('secretary assigns a task and an assigned student changes completion before archival', async ({
  page,
}) => {
  const identity = await fixture(page, true, 'secretary');
  await communicationFixture(page);
  const { state, subject, taskId } = await workFixture(page);
  await signIn(page);
  await expect(page).toHaveURL(/home$/);
  await page.goto('/tasks/new');
  await page
    .getByLabel('Title', { exact: true })
    .fill('Fictional classroom task');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Read the classroom material.');
  await page.getByLabel('Subject', { exact: true }).selectOption(subject);
  await page.getByLabel('Deadline', { exact: true }).fill('2030-01-01T12:00');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Fictional classroom task' }),
  ).toBeVisible();
  identity.role = 'student';
  await page.goto(`/tasks/${taskId}`);
  await page
    .getByRole('button', { name: 'Mark complete', exact: true })
    .click();
  await expect.poll(() => state.complete).toBe(true);
  await page
    .getByRole('button', { name: 'Mark incomplete', exact: true })
    .click();
  await expect.poll(() => state.complete).toBe(false);
  identity.role = 'secretary';
  await page.goto(`/tasks/${taskId}`);
  await page
    .getByLabel('Reason', { exact: true })
    .fill('Fictional task completed');
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page
    .locator('ion-alert')
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  await expect.poll(() => state.task?.status).toBe('archived');
  await expect(
    page.getByRole('button', { name: 'Mark complete', exact: true }),
  ).toBeDisabled();
});
test('attendance marking and student correction review are connected with reasons', async ({
  page,
}) => {
  const identity = await fixture(page, true, 'secretary');
  const { term } = await communicationFixture(page);
  const sessionId = '90000000-0000-4000-a000-000000000001',
    recordId = '90000000-0000-4000-a000-000000000002';
  const state = {
    session: null as Record<string, unknown> | null,
    status: 'absent',
    corrections: [] as Record<string, unknown>[],
  };
  await page.route('https://auth-fixture.invalid/rest/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname,
      b = req.postDataJSON();
    const send = (v: unknown) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(v),
      });
    if (path.endsWith('/subjects')) return send([]);
    if (path.endsWith('/attendance_sessions'))
      return send(state.session ? [state.session] : []);
    if (path.endsWith('/attendance_records'))
      return send(
        state.session
          ? [
              {
                id: recordId,
                session_id: sessionId,
                student_id: userId,
                status: state.status,
                updated_at: new Date().toISOString(),
              },
            ]
          : [],
      );
    if (path.endsWith('/attendance_corrections'))
      return send(state.corrections);
    if (path.endsWith('/rpc/create_attendance')) {
      state.session = {
        id: sessionId,
        semester_id: b.term_id,
        subject_id: null,
        title: b.session_title,
        kind: b.session_kind,
        occurred_at: b.session_time,
        archived_at: null,
      };
      return send(sessionId);
    }
    if (path.endsWith('/rpc/mark_attendance')) {
      state.status = b.new_status;
      return send('saved');
    }
    if (path.endsWith('/rpc/request_attendance_correction')) {
      state.corrections.push({
        id: 'correction',
        record_id: recordId,
        requester_id: userId,
        previous_status: state.status,
        requested_status: b.new_status,
        reason: b.change_reason,
        state: 'pending',
        created_at: new Date().toISOString(),
      });
      return send('correction');
    }
    if (path.endsWith('/rpc/review_attendance_correction')) {
      Object.assign(state.corrections[0]!, {
        state: b.decision,
        decision_reason: b.review_reason,
      });
      if (b.decision === 'approved')
        state.status = String(state.corrections[0]!.requested_status);
      return send(null);
    }
    return route.fallback();
  });
  await signIn(page);
  await expect(page).toHaveURL(/home$/);
  await page.goto('/attendance/new');
  await page
    .getByLabel('Title', { exact: true })
    .fill('Fictional class meeting');
  await page.getByLabel('Semester', { exact: true }).selectOption(term);
  await page
    .getByLabel('Session date and time', { exact: true })
    .fill(new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Fictional class meeting' }),
  ).toBeVisible();
  await page
    .getByLabel('Requested status', { exact: true })
    .selectOption('present');
  await page
    .getByLabel('Reason', { exact: true })
    .first()
    .fill('Verified at roll call');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => state.status).toBe('present');
  identity.role = 'student';
  await page.goto(`/attendance/sessions/${sessionId}`);
  await page
    .getByLabel('Requested status', { exact: true })
    .selectOption('late');
  await page
    .getByLabel('Reason', { exact: true })
    .fill('Arrived after the bell');
  await page
    .getByRole('button', { name: 'Request correction', exact: true })
    .click();
  await expect.poll(() => state.corrections.length).toBe(1);
  expect(state.status).toBe('present');
  identity.role = 'secretary';
  await page.goto('/attendance/review');
  await page
    .getByLabel('Reason', { exact: true })
    .fill('Arrival time verified');
  await page.getByRole('button', { name: 'Approved', exact: true }).click();
  await expect.poll(() => state.status).toBe('late');
  await expect(page.getByText('No pending corrections.')).toBeVisible();
});
test('treasurer records Paid or Unpaid while the student sees only their status and totals', async ({
  page,
}) => {
  const identity = await fixture(page, true, 'treasurer');
  const { term } = await communicationFixture(page);
  const id = 'a0000000-0000-4000-a000-000000000001',
    record = 'a0000000-0000-4000-a000-000000000002';
  const state = {
    item: null as Record<string, unknown> | null,
    status: 'unpaid',
    reminded: false,
  };
  await page.route('https://auth-fixture.invalid/rest/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname,
      b = req.postDataJSON();
    const send = (v: unknown) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(v),
      });
    if (path.endsWith('/contributions'))
      return send(
        req.headers()['accept']?.includes('vnd.pgrst.object')
          ? state.item
          : state.item
            ? [state.item]
            : [],
      );
    if (path.endsWith('/contribution_records'))
      return send([
        {
          id: record,
          contribution_id: id,
          student_id: userId,
          status: state.status,
          updated_at: new Date().toISOString(),
        },
      ]);
    if (path.endsWith('/rpc/contribution_summary'))
      return send({
        members: 1,
        paid_count: state.status === 'paid' ? 1 : 0,
        target_cent: 15000,
        collected_cent: state.status === 'paid' ? 15000 : 0,
        outstanding_cent: state.status === 'paid' ? 0 : 15000,
      });
    if (path.endsWith('/rpc/save_contribution')) {
      state.item = {
        id,
        semester_id: b.term_id,
        creator_id: userId,
        title: b.contribution_title,
        purpose: b.contribution_purpose,
        amount_cent: b.required_cent,
        deadline: b.due_at,
        status: 'active',
        last_reminded_at: null,
      };
      return send(id);
    }
    if (path.endsWith('/rpc/mark_contribution')) {
      state.status = b.new_status;
      return send(null);
    }
    if (path.endsWith('/rpc/remind_contribution')) {
      state.reminded = true;
      state.item!.last_reminded_at = new Date().toISOString();
      return send(1);
    }
    return route.fallback();
  });
  await signIn(page);
  await expect(page).toHaveURL(/home$/);
  await page.goto('/contributions/new');
  await page
    .getByLabel('Title', { exact: true })
    .fill('Fictional printing fund');
  await page.getByLabel('Semester', { exact: true }).selectOption(term);
  await page
    .getByLabel('Purpose', { exact: true })
    .fill('Classroom practice materials');
  await page
    .getByLabel('Required amount (PHP)', { exact: true })
    .fill('150.00');
  await page.getByLabel('Deadline', { exact: true }).fill('2030-01-01T12:00');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Fictional printing fund' }),
  ).toBeVisible();
  await page
    .locator('article')
    .getByLabel('Payment status', { exact: true })
    .selectOption('paid');
  await page
    .locator('article')
    .getByLabel('Reason', { exact: true })
    .fill('Fictional payment verified');
  await page
    .locator('article')
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect.poll(() => state.status).toBe('paid');
  identity.role = 'student';
  await page.goto(`/contributions/${id}`);
  await expect(page.getByText('Paid', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Anonymous totals' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Partial', { exact: true })).toHaveCount(0);
});
test('calendar event creation and notification read/deep-link flows are functional', async ({
  page,
}) => {
  await fixture(page, true, 'president');
  const { term } = await communicationFixture(page);
  const id = 'b0000000-0000-4000-a000-000000000001';
  let event: Record<string, unknown> | null = null;
  let read = false;
  await page.route('https://auth-fixture.invalid/rest/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname,
      b = req.postDataJSON();
    const send = (v: unknown) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(v),
      });
    if (path.endsWith('/rpc/save_calendar_event')) {
      event = {
        id,
        semester_id: b.term_id,
        title: b.event_title,
        description: b.event_description,
        starts_at: b.start_time,
        ends_at: b.end_time,
        archived_at: null,
      };
      return send(id);
    }
    if (path.endsWith('/calendar_events')) return send(event);
    if (path.endsWith('/rpc/calendar_feed'))
      return send(
        event
          ? [{ ...event, kind: 'event', path: `/calendar/events/${id}` }]
          : [],
      );
    if (path.endsWith('/notifications')) {
      if (req.method() === 'PATCH') {
        read = true;
        return send(null);
      }
      return send([
        {
          id: 'notice',
          category: 'announcements',
          title: 'Fictional event notice',
          body: 'Open the class event.',
          path: `/calendar/events/${id}`,
          read_at: read ? new Date().toISOString() : null,
          created_at: new Date().toISOString(),
        },
      ]);
    }
    return route.fallback();
  });
  await signIn(page);
  await expect(page).toHaveURL(/home$/);
  await page.goto('/calendar/events/new');
  await page
    .getByLabel('Title', { exact: true })
    .fill('Fictional class workshop');
  await page.getByLabel('Semester', { exact: true }).selectOption(term);
  await page
    .getByLabel('Description', { exact: true })
    .fill('Workshop for the fictional test class.');
  await page.getByLabel('Starts', { exact: true }).fill('2030-02-10T09:00');
  await page.getByLabel('Ends', { exact: true }).fill('2030-02-10T10:00');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Fictional class workshop' }),
  ).toBeVisible();
  await page.goto('/calendar');
  await page.getByLabel('Month', { exact: true }).fill('2030-02');
  await expect(
    page.getByRole('link', { name: 'Fictional class workshop' }),
  ).toBeVisible();
  await page.getByLabel('View', { exact: true }).selectOption('agenda');
  await expect(
    page.getByRole('link', { name: 'Fictional class workshop' }),
  ).toBeVisible();
  await page.goto('/notifications');
  await page.getByRole('button', { name: 'Mark read', exact: true }).click();
  await expect.poll(() => read).toBe(true);
  await page
    .getByRole('button', { name: 'Open notification', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/calendar/events/${id}$`));
});
test('push opt-in and opt-out persist the current device subscription through authorized RPCs', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let subscription: PushSubscription | null = null;
    const fakeRegistration = {
      pushManager: {
        getSubscription: async () => subscription,
        subscribe: async (options: PushSubscriptionOptionsInit) => {
          subscription = {
            endpoint: 'https://fcm.googleapis.com/fcm/send/fictional-browser',
            options: { applicationServerKey: options.applicationServerKey },
            toJSON: () => ({
              endpoint: 'https://fcm.googleapis.com/fcm/send/fictional-browser',
              keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) },
            }),
            unsubscribe: async () => {
              subscription = null;
              return true;
            },
          } as unknown as PushSubscription;
          return subscription;
        },
      },
    };
    Object.defineProperty(navigator.serviceWorker, 'ready', {
      get: () => Promise.resolve(fakeRegistration),
    });
    Object.defineProperty(navigator.serviceWorker, 'getRegistration', {
      value: async () => fakeRegistration,
    });
    Object.defineProperty(Notification, 'requestPermission', {
      value: async () => 'granted',
    });
  });
  await fixture(page, true);
  let enabled = false;
  await page.route('https://auth-fixture.invalid/rest/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const send = (v: unknown) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(v),
      });
    if (path.endsWith('/notifications')) return send([]);
    if (path.endsWith('/rpc/my_push_enabled')) return send(enabled);
    if (path.endsWith('/rpc/register_push')) {
      expect(req.postDataJSON().push_endpoint).toContain('fictional-browser');
      enabled = true;
      return send('subscription');
    }
    if (path.endsWith('/rpc/disable_push')) {
      enabled = false;
      return send(null);
    }
    return route.fallback();
  });
  await signIn(page);
  await expect(page).toHaveURL(/home$/);
  await page.goto('/notifications');
  await page.getByRole('button', { name: 'Enable push', exact: true }).click();
  await expect(
    page.getByText('Push is enabled for this device and session.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(enabled).toBe(true);
  await page.getByRole('button', { name: 'Disable push', exact: true }).click();
  await expect(
    page.getByText('Push is disabled for this session.', { exact: true }),
  ).toBeVisible();
  expect(enabled).toBe(false);
});

test('authorized reports download PDF and Excel, search links work and analytics render', async ({
  page,
}) => {
  await fixture(page, true, 'president');
  await communicationFixture(page);
  let exports = 0;
  await page.route('https://auth-fixture.invalid/rest/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (v: unknown) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(v),
      });
    if (
      path.endsWith('/attendance_sessions') ||
      path.endsWith('/contributions')
    )
      return send([]);
    if (path.endsWith('/rpc/export_report')) {
      exports++;
      const b = route.request().postDataJSON();
      expect(b.report_kind).toBe('contributions');
      return send({
        kind: 'contributions',
        generated_at: '2026-11-13T00:00:00Z',
        officer: 'Fictional President',
        rows: [
          {
            event: 'Fictional fund',
            student: '=UNTRUSTED()',
            status: 'paid',
            amount_cent: 15000,
            deadline: '2026-12-01T00:00:00Z',
          },
        ],
      });
    }
    if (path.endsWith('/rpc/global_search'))
      return send([
        {
          id: userId,
          kind: 'member',
          title: 'Fictional Member',
          path: '/members?search=fictional',
        },
      ]);
    if (path.endsWith('/rpc/internal_analytics'))
      return send({
        active_users: 4,
        announcement_views: 3,
        poll_ballots: 2,
        task_assigned: 4,
        task_completed: 1,
        attendance: { present: 2 },
        contributions: { paid: 15000, unpaid: 10000 },
      });
    return route.fallback();
  });
  await signIn(page);
  await expect(page).toHaveURL(/home$/);
  await page.goto('/reports/contributions');
  for (const format of ['pdf', 'xlsx']) {
    await page.getByLabel('File format').selectOption(format);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Generate and download' }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(
      new RegExp('\\.' + format + '$'),
    );
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    expect(bytes.length).toBeGreaterThan(100);
    if (format === 'xlsx') {
      const { readSheet } = await import('read-excel-file/node');
      const cells = await readSheet(bytes);
      expect(cells.flat()).toContain('=UNTRUSTED()');
      expect(cells.flat()).toContain('Paid');
    } else {
      expect(bytes.toString('latin1')).toContain('Fictional President');
      expect(bytes.toString('latin1')).toContain('Fictional fund');
    }
    expect(bytes.subarray(0, format === 'pdf' ? 4 : 2).toString()).toBe(
      format === 'pdf' ? '%PDF' : 'PK',
    );
  }
  expect(exports).toBe(2);
  await page.goto('/search');
  await page.getByLabel('Search accessible records').fill('fictional');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page
    .getByRole('link', { name: 'Fictional Member', exact: true })
    .click();
  await expect(page.getByLabel('Search members')).toHaveValue('fictional');
  await page.goto('/analytics');
  await expect(
    page.getByText('Active accounts', { exact: true }),
  ).toBeVisible();
});

test('offline copies are read-only, session-scoped and removable without a network', async ({
  page,
  context,
}) => {
  await fixture(page, true);
  await page.route(
    'https://auth-fixture.invalid/rest/v1/rpc/communication_feed',
    (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'offline-post',
            kind: 'announcement',
            state: 'published',
            title: 'Fictional saved notice',
            body: [{ type: 'paragraph', text: 'Saved class message.' }],
            publish_at: new Date().toISOString(),
            pinned: false,
          },
        ]),
      }),
  );
  await signIn(page);
  await expect(
    page.getByRole('heading', { name: 'Fictional saved notice' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('clead-offline-v1') || '{}')
            .announcements?.length,
      ),
    )
    .toBe(1);
  await context.setOffline(true);
  await page
    .locator('.offline')
    .getByRole('link', { name: 'Saved offline records' })
    .click();
  await expect(page).toHaveURL(/offline$/);
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await skip.focus();
  await skip.press('Enter');
  await expect(
    page.locator('main#main').filter({ has: page.locator('.cached-text') }),
  ).toBeFocused();
  await expect(
    page.locator('.cached-text').filter({ hasText: 'Saved class message.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove saved copies' }).click();
  expect(
    await page.evaluate(() => localStorage.getItem('clead-offline-v1')),
  ).toBeNull();
  await context.setOffline(false);
});
test('problem reporting sends only explicit description and minimal context', async ({
  page,
}) => {
  await fixture(page, true);
  const rows: Record<string, unknown>[] = [];
  await page.route('https://auth-fixture.invalid/rest/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (v: unknown) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(v),
      });
    if (path.endsWith('/problem_reports')) return send(rows);
    if (path.endsWith('/rpc/report_problem')) {
      const b = route.request().postDataJSON();
      expect(Object.keys(b).sort()).toEqual([
        'browser',
        'device',
        'problem_description',
        'problem_route',
        'version',
      ]);
      expect(b.problem_route).toBe('/calendar');
      rows.push({
        id: 'report',
        description: b.problem_description,
        route: b.problem_route,
        created_at: new Date().toISOString(),
        resolved_at: null,
        resolution: null,
      });
      return send('report');
    }
    return route.fallback();
  });
  await signIn(page);
  await page.goto('/report-problem?from=/calendar');
  await page
    .getByLabel('Problem description')
    .fill('The calendar did not load after I changed the month.');
  await page.getByRole('button', { name: 'Send problem report' }).click();
  await expect(
    page.getByText('Problem report submitted.', { exact: true }),
  ).toBeVisible();
  expect(rows).toHaveLength(1);
});

test('report, search, calendar and problem pages support responsive themes and accessibility', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await fixture(page, true, 'president');
  await communicationFixture(page);
  await page.route('https://auth-fixture.invalid/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (
      [
        '/attendance_sessions',
        '/contributions',
        '/problem_reports',
        '/rpc/calendar_feed',
      ].some((x) => path.endsWith(x))
    )
      return route.fulfill({ contentType: 'application/json', body: '[]' });
    return route.fallback();
  });
  await signIn(page);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of [
      '/reports/attendance',
      '/search',
      '/calendar',
      '/report-problem',
    ]) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      for (const theme of ['light', 'dark']) {
        await page.evaluate(
          (theme) => (document.documentElement.dataset.theme = theme),
          theme,
        );
        const scan = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(scan.violations).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
        ).toBe(false);
      }
      if (path === '/calendar')
        await page.screenshot({
          path: info.outputPath(`calendar-${width}-dark.png`),
          fullPage: true,
        });
    }
  }
});

test('agreed classroom screens remain accessible on mobile in both themes', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await fixture(page, true, 'president');
  await communicationFixture(page);
  await page.route('https://auth-fixture.invalid/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (data: unknown) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(data),
      });
    if (path.endsWith('/rpc/account_roster'))
      return send([
        {
          id: userId,
          full_name: 'Test Student',
          username: 'test_student',
          student_number: 'TEST-0001',
          role: 'president',
          active: true,
        },
      ]);
    if (
      [
        '/tasks',
        '/task_assignments',
        '/attendance_sessions',
        '/notifications',
        '/rpc/calendar_feed',
      ].some((s) => path.endsWith(s))
    )
      return send([]);
    return route.fallback();
  });
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    '/home',
    '/announcements',
    '/tasks',
    '/members',
    '/attendance',
    '/profile',
    '/notifications',
    '/announcements/new',
  ]) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('main img.ci')).toBeVisible();
    expect(
      await page
        .locator('main img.ci')
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(path.replaceAll('/', '-') + '-' + theme + '.png'),
        fullPage: true,
      });
    }
  }
});
