import webpush from 'npm:web-push@3.6.7';
import {
  handleDispatch,
  allowedEndpoint,
} from './dispatch-notifications/handler.ts';
function assert(value: unknown, message = 'Assertion failed'): asserts value {
  if (!value) throw new Error(message);
}
const scheduler = 'fictional-scheduler-secret-at-least-32-characters';
async function setup(
  run: (calls: string[], outcomes: string[]) => Promise<void>,
  status = 201,
  webConfigured = true,
  provider: 'web' | 'fcm' = 'web',
) {
  const names = [
      'CLEAD_SCHEDULER_SECRET',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'VAPID_PUBLIC_KEY',
      'VAPID_PRIVATE_KEY',
      'VAPID_SUBJECT',
      'FCM_SERVICE_ACCOUNT',
    ],
    previous = names.map((n) => Deno.env.get(n));
  const keys = webpush.generateVAPIDKeys();
  const ecdh = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const raw = new Uint8Array(
    await crypto.subtle.exportKey('raw', ecdh.publicKey),
  );
  const base64 = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
  const values = [
    scheduler,
    'https://test.invalid',
    'fictional-service',
    keys.publicKey,
    keys.privateKey,
    'mailto:test@example.invalid',
    '',
  ];
  names.forEach((n, i) => Deno.env.set(n, values[i]));
  if (!webConfigured) {
    Deno.env.delete('VAPID_PUBLIC_KEY');
    Deno.env.delete('VAPID_PRIVATE_KEY');
    Deno.env.delete('VAPID_SUBJECT');
  }
  if (provider === 'fcm') {
    const fcm = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const privateKey = new Uint8Array(
      await crypto.subtle.exportKey('pkcs8', fcm.privateKey),
    );
    const pem = btoa(String.fromCharCode(...privateKey))
      .match(/.{1,64}/g)!
      .join('\n');
    Deno.env.set(
      'FCM_SERVICE_ACCOUNT',
      JSON.stringify({
        project_id: 'fictional-project',
        client_email: 'fictional@fictional-project.iam.gserviceaccount.com',
        private_key: `-----BEGIN PRIVATE KEY-----\n${pem}\n-----END PRIVATE KEY-----\n`,
        token_uri: 'https://oauth2.googleapis.com/token',
      }),
    );
  }
  const original = globalThis.fetch,
    calls: string[] = [],
    outcomes: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    const path = new URL(url).pathname;
    let value: unknown = null;
    if (path.endsWith('/process_due_notifications')) value = null;
    else if (path.endsWith('/claim_push_jobs'))
      value = [
        {
          job_id: '00000000-0000-4000-a000-000000000001',
          claim_id: '00000000-0000-4000-a000-000000000002',
          provider,
          endpoint:
            provider === 'web'
              ? 'https://fcm.googleapis.com/fcm/send/fictional'
              : null,
          device_token:
            provider === 'fcm'
              ? 'fictional-fcm-registration-token-1234567890'
              : null,
          p256dh: base64(raw),
          auth_secret: base64(crypto.getRandomValues(new Uint8Array(16))),
          title: 'C-LEAD',
          body: 'Open the app',
          path: '/notifications',
        },
      ];
    else if (path.endsWith('/finish_push_job'))
      outcomes.push(JSON.parse(String(init?.body)).outcome);
    else if (url === 'https://oauth2.googleapis.com/token') {
      assert(init?.redirect === 'error');
      return new Response(
        JSON.stringify({
          access_token: 'fictional-fcm-access',
          expires_in: 3600,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } else if (url.startsWith('https://fcm.googleapis.com/')) {
      assert(init?.redirect === 'error');
      if (provider === 'web') {
        assert(new Headers(init?.headers).get('ttl') === '60');
        assert(init?.body instanceof Uint8Array);
        assert(!new TextDecoder().decode(init.body).includes('Open the app'));
      } else {
        assert(
          new Headers(init?.headers).get('authorization') ===
            'Bearer fictional-fcm-access',
        );
        const message = JSON.parse(String(init?.body)).message;
        assert(message.token === 'fictional-fcm-registration-token-1234567890');
        assert(message.notification.body === 'Open the app');
        assert(message.data.path === '/notifications');
      }
      return new Response('', { status });
    } else throw new Error('Unexpected request');
    return new Response(JSON.stringify(value), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    await run(calls, outcomes);
  } finally {
    globalThis.fetch = original;
    names.forEach((n, i) =>
      previous[i] === undefined
        ? Deno.env.delete(n)
        : Deno.env.set(n, previous[i]!),
    );
  }
}
const request = (secret = scheduler) =>
  new Request('https://test.invalid/dispatch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
Deno.test(
  'scheduler authorization fails before database or push requests',
  () =>
    setup(async (calls) => {
      const r = await handleDispatch(request('wrong'));
      assert(r.status === 401);
      assert(calls.length === 0);
    }),
);
Deno.test('in-app reminders still run when VAPID is unavailable', () =>
  setup(
    async (calls) => {
      const r = await handleDispatch(request());
      assert(r.status === 200);
      assert((await r.json()).push_configured === false);
      assert(calls.length === 1);
    },
    201,
    false,
  ),
);
Deno.test(
  'native FCM delivery uses server credentials and keeps generic lock-screen copy',
  () =>
    setup(
      async (_calls, outcomes) => {
        const r = await handleDispatch(request());
        assert(r.status === 200);
        assert((await r.json()).push_configured === true);
        assert(outcomes[0] === 'delivered');
      },
      201,
      false,
      'fcm',
    ),
);
Deno.test(
  'push is encrypted and acknowledged only after provider success',
  () =>
    setup(async (_calls, outcomes) => {
      const r = await handleDispatch(request());
      assert(r.status === 200);
      assert(outcomes[0] === 'delivered');
    }),
);
Deno.test('expired push endpoints are disabled through the claimed job', () =>
  setup(async (_calls, outcomes) => {
    await handleDispatch(request());
    assert(outcomes[0] === 'invalid');
  }, 410),
);
Deno.test('temporary provider failure remains retryable', () =>
  setup(async (_calls, outcomes) => {
    await handleDispatch(request());
    assert(outcomes[0] === 'retry');
  }, 503),
);
Deno.test(
  'push destinations reject private hosts, userinfo and arbitrary redirects',
  () => {
    for (const url of [
      'http://fcm.googleapis.com/x',
      'https://127.0.0.1/x',
      'https://fcm.googleapis.com.evil.invalid/x',
      'https://user@fcm.googleapis.com/x',
      'https://fcm.googleapis.com:444/x',
      'https://example.invalid/x',
    ])
      assert(!allowedEndpoint(url));
    assert(allowedEndpoint('https://web.push.apple.com/test'));
  },
);
