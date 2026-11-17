import { handleAttachments } from './attachments/handler.ts';
import { validateFile } from './_shared/files.ts';
function assert(value: unknown, message = 'Assertion failed'): asserts value {
  if (!value) throw new Error(message);
}
const userId = '00000000-0000-4000-a000-000000000001',
  sessionId = '10000000-0000-4000-a000-000000000001',
  fileId = '20000000-0000-4000-a000-000000000001',
  postId = '30000000-0000-4000-a000-000000000001';
const file = {
  id: fileId,
  post_id: postId,
  storage_path: `${postId}/${fileId}`,
  filename: 'fictional.pdf',
  state: 'ready',
};
const request = (body: unknown) =>
  new Request('https://test.invalid/attachments', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
async function api(run: (calls: string[]) => Promise<void>, failure = '') {
  const original = globalThis.fetch;
  const names = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  const previous = names.map((n) => Deno.env.get(n));
  names.forEach((n, i) =>
    Deno.env.set(n, ['https://test.invalid', 'test-public', 'test-service'][i]),
  );
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const path = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    ).pathname;
    calls.push(path);
    let value: unknown = null;
    let status = 200;
    if (path === '/auth/v1/user')
      value = {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      };
    else if (path.endsWith('/my_sessions'))
      value =
        failure === 'session' ? [] : [{ id: sessionId, is_current: true }];
    else if (
      path.endsWith('/reserve_attachment') ||
      path.endsWith('/reserve_task_attachment')
    )
      value = [file];
    else if (
      path.endsWith('/attachment_access') ||
      path.endsWith('/task_attachment_access')
    )
      value = file;
    else if (path.endsWith('/prepare_post_deletion')) value = [file];
    else if (path.includes('/object/sign/')) {
      const body = JSON.parse(String(init?.body));
      assert(body.expiresIn === 60);
      value = { signedURL: '/object/sign/attachments/file?token=test' };
    } else if (path === '/storage/v1/object/attachments') {
      assert(init?.method === 'DELETE');
      value = [];
      if (failure === 'storage') {
        status = 500;
        value = { message: 'Storage unavailable' };
      }
    } else if (path.includes('/object/attachments/'))
      value = { Key: 'attachments/' + file.storage_path };
    else if (
      ![
        'finish_attachment_upload',
        'finish_attachment_delete',
        'finish_post_deletion',
      ].some((name) => path.endsWith('/' + name))
    )
      throw new Error('Unexpected request ' + path);
    if (
      failure === 'finish_upload' &&
      path.endsWith('/finish_attachment_upload')
    ) {
      status = 500;
      value = { message: 'Commit unavailable' };
    }
    return new Response(JSON.stringify(value), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
    names.forEach((name, i) =>
      previous[i] === undefined
        ? Deno.env.delete(name)
        : Deno.env.set(name, previous[i]!),
    );
  }
}
Deno.test(
  'private signed links require caller authorization and expire after sixty seconds',
  () =>
    api(async (calls) => {
      const result = await handleAttachments(
        request({ action: 'link', attachment_id: fileId }),
      );
      assert(result.status === 200);
      assert(
        calls.indexOf('/rest/v1/rpc/attachment_access') <
          calls.findIndex((p) => p.includes('/object/sign/')),
      );
    }),
);
Deno.test(
  'parent deletion removes Storage before finalizing attachment and post tombstones',
  () =>
    api(async (calls) => {
      const result = await handleAttachments(
        request({
          action: 'remove_post',
          post_id: postId,
          reason: 'Fictional deletion',
        }),
      );
      assert(result.status === 200);
      assert(
        calls.indexOf('/storage/v1/object/attachments') <
          calls.indexOf('/rest/v1/rpc/finish_attachment_delete'),
      );
      assert(calls.at(-1) === '/rest/v1/rpc/finish_post_deletion');
    }),
);
Deno.test('Storage deletion failure never marks the post deleted', () =>
  api(async (calls) => {
    const result = await handleAttachments(
      request({
        action: 'remove_post',
        post_id: postId,
        reason: 'Fictional deletion',
      }),
    );
    assert(result.status === 400);
    assert(!calls.includes('/rest/v1/rpc/finish_post_deletion'));
    assert(!calls.includes('/rest/v1/rpc/finish_attachment_delete'));
  }, 'storage'),
);
Deno.test('revoked sessions cannot obtain file links', () =>
  api(async (calls) => {
    const result = await handleAttachments(
      request({ action: 'link', attachment_id: fileId }),
    );
    assert(result.status === 401);
    assert(!calls.some((p) => p.includes('/storage/')));
  }, 'session'),
);
Deno.test(
  'validated binary upload uses the reserved path and compensates a failed commit',
  () =>
    api(async (calls) => {
      const req = new Request('https://test.invalid/attachments', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test',
          'Content-Type': 'application/pdf',
          'x-clead-action': 'upload',
          'x-clead-parent': postId,
          'x-clead-filename': 'fictional.pdf',
        },
        body: new TextEncoder().encode('%PDF-1.7\nfictional fixture'),
      });
      const result = await handleAttachments(req);
      assert(result.status === 400);
      assert(
        calls.includes('/storage/v1/object/attachments/' + file.storage_path),
      );
      assert(calls.includes('/rest/v1/rpc/finish_attachment_delete'));
    }, 'finish_upload'),
);
Deno.test(
  'file signatures, size, extensions and MIME types are validated',
  () => {
    validateFile(
      'fictional.pdf',
      'application/pdf',
      new TextEncoder().encode('%PDF-1.7'),
    );
    for (const [name, mime, data] of [
      ['bad.exe', 'application/pdf', new TextEncoder().encode('%PDF-1.7')],
      ['bad.png', 'image/png', new TextEncoder().encode('<script>')],
      ['bad.jpg', 'image/jpeg', new Uint8Array(5242881)],
      ['../bad.pdf', 'application/pdf', new TextEncoder().encode('%PDF-1.7')],
      [
        'fake.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        new Uint8Array([80, 75, 3, 4]),
      ],
    ] as const) {
      let denied = false;
      try {
        validateFile(name, mime, data);
      } catch {
        denied = true;
      }
      assert(denied);
    }
  },
);

Deno.test(
  'task links use task assignment authorization rather than post permissions',
  async () => {
    await api(async (calls) => {
      const r = await handleAttachments(
        request({ action: 'link', attachment_id: fileId, parent_type: 'task' }),
      );
      assert(r.status === 200);
      assert(calls.some((p) => p.endsWith('/task_attachment_access')));
      assert(!calls.some((p) => p.endsWith('/attachment_access')));
    });
  },
);
