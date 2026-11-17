import { handleAdminAccounts } from './admin-accounts/handler.ts';
import { handleUsernameLogin } from './username-login/handler.ts';
import { handlePasswordChange } from './change-password/handler.ts';
import { passwordDigest, readBody } from './_shared/auth.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value {
  if (!value) throw new Error(message);
}
const username = 'test_student';
const userId = '00000000-0000-4000-a000-000000000001';
const sessionId = '10000000-0000-4000-a000-000000000001';
const token = `${btoa('{}')}.${btoa(JSON.stringify({ sub: userId, session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;
const user = {
  id: userId,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'private@identity.c-lead.invalid',
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const request = (body: unknown, authorized = false) =>
  new Request('http://localhost/function', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:5173',
      ...(authorized ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
async function withApi(
  run: (
    calls: Array<{ path: string; body: Record<string, unknown> }>,
  ) => Promise<void>,
  replies: Record<string, unknown>,
) {
  const original = globalThis.fetch;
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  const names = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'LOGIN_PASSWORD_PEPPER',
    'ALLOWED_ORIGIN',
  ];
  const old = names.map((name) => Deno.env.get(name));
  const values = [
    'http://localhost:54321',
    'test-public-key',
    'test-server-key',
    'test-only-password-pepper-over-32-characters',
    'http://localhost:5173',
  ];
  names.forEach((name, i) => Deno.env.set(name, values[i]));
  globalThis.fetch = async (input, init) => {
    const path = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    ).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ path, body });
    if (path.endsWith('/claim_credential_write'))
      return new Response(
        JSON.stringify('00000000-0000-4000-a000-000000000009'),
        { headers: { 'Content-Type': 'application/json' } },
      );
    if (path.endsWith('/set_password_fingerprint'))
      return new Response('null', {
        headers: { 'Content-Type': 'application/json' },
      });
    if (path.endsWith('/release_credential_write'))
      return new Response('null', {
        headers: { 'Content-Type': 'application/json' },
      });
    if (!(path in replies)) throw new Error(`Unexpected API call: ${path}`);
    const reply = replies[path];
    const custom = reply as { __status?: number; __body?: unknown };
    return new Response(JSON.stringify(custom?.__body ?? reply), {
      status: custom?.__status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
    names.forEach((name, i) =>
      old[i] === undefined
        ? Deno.env.delete(name)
        : Deno.env.set(name, old[i]!),
    );
  }
}
Deno.test(
  'login transforms the password and approves the exact Auth session',
  async () => {
    await withApi(
      async (calls) => {
        const response = await handleUsernameLogin(
          request({ username: ' TEST_STUDENT ', password: 'temporary-number' }),
        );
        assert(response.status === 200);
        const result = await response.json();
        assert(result.session.access_token === token);
        const auth = calls.find((call) => call.path === '/auth/v1/token')!;
        assert(
          auth.body.password === (await passwordDigest('temporary-number')),
        );
        assert(auth.body.password !== 'temporary-number');
        assert(auth.body.email === 'private@identity.c-lead.invalid');
        const approval = calls.find((call) =>
          call.path.endsWith('approve_login'),
        )!;
        assert(approval.body.auth_session === sessionId);
        assert(approval.body.expected_generation === 2);
        assert(!JSON.stringify(result).includes('internal_email'));
      },
      {
        '/rest/v1/rpc/begin_login': 'lease',
        '/rest/v1/rpc/resolve_login': [
          {
            user_id: userId,
            internal_email: 'private@identity.c-lead.invalid',
            credential_generation: 2,
          },
        ],
        '/auth/v1/token': {
          access_token: token,
          refresh_token: 'test-refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user,
        },
        '/rest/v1/rpc/approve_login': true,
      },
    );
  },
);
Deno.test(
  'lockout returns retry interval without contacting Auth',
  async () => {
    await withApi(
      async (calls) => {
        const response = await handleUsernameLogin(
          request({ username, password: 'wrong' }),
        );
        assert(response.status === 401);
        assert((await response.json()).retry_after === 900);
        assert(!calls.some((call) => call.path.includes('/auth/')));
      },
      {
        '/rest/v1/rpc/begin_login': null,
        '/rest/v1/rpc/login_retry_after': 900,
      },
    );
  },
);
Deno.test(
  'password change authenticates, revokes first, transforms password and completes audit',
  async () => {
    await withApi(
      async (calls) => {
        const response = await handlePasswordChange(
          request({ password: 'a-long-new-password' }, true),
        );
        assert(response.status === 200);
        const paths = calls.map((call) => call.path);
        assert(
          paths.indexOf('/rest/v1/rpc/begin_password_change') <
            paths.indexOf(`/auth/v1/admin/users/${userId}`),
        );
        assert(
          paths.indexOf('/rest/v1/rpc/finish_password_change') <
            paths.indexOf('/rest/v1/rpc/release_credential_write'),
        );
        assert(paths.at(-1) === '/rest/v1/rpc/release_credential_write');
        assert(
          calls.find((call) => call.path.includes('/admin/users/'))!.body
            .password === (await passwordDigest('a-long-new-password')),
        );
      },
      {
        '/auth/v1/user': user,
        '/rest/v1/rpc/is_active_session': true,
        '/rest/v1/rpc/begin_password_change': 'operation',
        ['/auth/v1/admin/users/' + userId]: user,
        '/rest/v1/rpc/finish_password_change': null,
      },
    );
  },
);
Deno.test('revoked session cannot change a password', async () => {
  await withApi(
    async (calls) => {
      assert(
        (
          await handlePasswordChange(
            request({ password: 'a-long-new-password' }, true),
          )
        ).status === 401,
      );
      assert(!calls.some((call) => call.path.includes('/admin/')));
    },
    { '/auth/v1/user': user, '/rest/v1/rpc/is_active_session': false },
  );
});
Deno.test(
  'invalid origins and oversized streamed bodies are rejected',
  async () => {
    await withApi(async (calls) => {
      const req = new Request('http://localhost/function', {
        method: 'POST',
        headers: { Origin: 'https://untrusted.invalid' },
        body: '{}',
      });
      assert((await handleUsernameLogin(req)).status === 403);
      assert(calls.length === 0);
      let rejected = false;
      try {
        await readBody(
          new Request('http://localhost', {
            method: 'POST',
            body: 'x'.repeat(5000),
          }),
        );
      } catch {
        rejected = true;
      }
      assert(rejected);
    }, {});
  },
);
Deno.test(
  'account creation checks caller RPC authorization, transforms the temporary password and commits the reserved identity',
  async () => {
    const target = '00000000-0000-4000-a000-000000000099';
    const operation = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    await withApi(
      async (calls) => {
        const reply = await handleAdminAccounts(
          request(
            {
              action: 'create',
              operation_id: operation,
              full_name: 'Fictional New',
              username: 'fictional_new',
              student_number: 'TEST-NEW',
            },
            true,
          ),
        );
        assert(reply.status === 200);
        const create = calls.find((c) => c.path === '/auth/v1/admin/users');
        assert(create?.body.password === (await passwordDigest('TEST-NEW')));
        assert(create?.body.id === target);
        assert(calls.some((c) => c.path.endsWith('/finish_account_creation')));
      },
      {
        '/auth/v1/user': user,
        '/rest/v1/rpc/my_sessions': [{ id: sessionId, is_current: true }],
        '/rest/v1/rpc/prepare_account': operation,
        '/rest/v1/rpc/account_creation_details': [
          {
            user_id: target,
            full_name: 'Fictional New',
            username: 'fictional_new',
            student_number: 'TEST-NEW',
            completed: false,
          },
        ],
        [`/auth/v1/admin/users/${target}`]: {
          __status: 404,
          __body: { code: 'user_not_found', message: 'Not found' },
        },
        '/auth/v1/admin/users': { ...user, id: target },
        '/rest/v1/rpc/finish_account_creation': target,
      },
    );
  },
);
Deno.test(
  'account creation retry verifies Auth operation ownership before committing',
  async () => {
    const operation = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    await withApi(
      async (calls) => {
        const reply = await handleAdminAccounts(
          request(
            {
              action: 'create',
              operation_id: operation,
              full_name: 'Fictional',
              username: 'fictional',
              student_number: 'TEST-NEW',
            },
            true,
          ),
        );
        assert(reply.status === 400);
        assert(!calls.some((c) => c.path.endsWith('/finish_account_creation')));
      },
      {
        '/auth/v1/user': user,
        '/rest/v1/rpc/my_sessions': [{ id: sessionId, is_current: true }],
        '/rest/v1/rpc/prepare_account': operation,
        '/rest/v1/rpc/account_creation_details': [
          { user_id: userId, student_number: 'TEST-NEW', completed: false },
        ],
        [`/auth/v1/admin/users/${userId}`]: user,
      },
    );
  },
);
Deno.test(
  'administrative reset uses only the database student number and completes the recovery audit',
  async () => {
    const operation = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    await withApi(
      async (calls) => {
        const reply = await handleAdminAccounts(
          request(
            {
              action: 'reset',
              user_id: userId,
              reason: 'Test recovery',
              student_number: 'ATTACKER-VALUE',
            },
            true,
          ),
        );
        assert(reply.status === 200);
        assert(
          calls.find((c) => c.path === `/auth/v1/admin/users/${userId}`)?.body
            .password === (await passwordDigest('TEST-PRIVATE')),
        );
        assert(calls.some((c) => c.path.endsWith('/finish_account_reset')));
      },
      {
        '/auth/v1/user': user,
        '/rest/v1/rpc/my_sessions': [{ id: sessionId, is_current: true }],
        '/rest/v1/rpc/prepare_account_reset': operation,
        '/rest/v1/rpc/account_reset_details': [
          { user_id: userId, student_number: 'TEST-PRIVATE', completed: false },
        ],
        [`/auth/v1/admin/users/${userId}`]: user,
        '/rest/v1/rpc/finish_account_reset': null,
      },
    );
  },
);
Deno.test(
  'unapproved caller cannot reach administrative Auth operations',
  async () => {
    await withApi(
      async (calls) => {
        const reply = await handleAdminAccounts(
          request(
            { action: 'reset', user_id: userId, reason: 'Forbidden' },
            true,
          ),
        );
        assert(reply.status === 401);
        assert(!calls.some((c) => c.path.includes('/admin/')));
      },
      { '/auth/v1/user': user, '/rest/v1/rpc/my_sessions': [] },
    );
  },
);
Deno.test(
  'stale Auth credentials cannot revive a password superseded by a reset',
  async () => {
    await withApi(
      async (calls) => {
        const reply = await handleUsernameLogin(
          request({ username, password: 'old-password' }),
        );
        assert(reply.status === 401);
        assert(!calls.some((c) => c.path === '/auth/v1/token'));
        assert(
          calls.find((c) => c.path.endsWith('/finish_login'))?.body
            .successful === false,
        );
      },
      {
        '/rest/v1/rpc/begin_login': 'lease',
        '/rest/v1/rpc/resolve_login': [
          {
            user_id: userId,
            internal_email: user.email,
            credential_generation: 4,
            password_fingerprint: 'f'.repeat(64),
          },
        ],
        '/rest/v1/rpc/finish_login': true,
        '/rest/v1/rpc/login_retry_after': 0,
      },
    );
  },
);
