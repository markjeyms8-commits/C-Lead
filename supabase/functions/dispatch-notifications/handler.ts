import webpush from 'npm:web-push@3.6.7';
import { service } from '../_shared/auth.ts';
export function allowedEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/.test(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
}
async function equalSecret(received: string, expected: string) {
  const digest = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
    );
  const [a, b] = await Promise.all([digest(received), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
type Job = {
  job_id: string;
  claim_id: string;
  provider?: 'web' | 'fcm';
  endpoint: string;
  device_token?: string;
  p256dh: string;
  auth_secret: string;
  title: string;
  body: string;
  path: string;
};
const encoder = new TextEncoder();
let cachedAccessToken: { value: string; expiresAt: number } | undefined;
const oauthErrorCodes = new Set([
  'access_denied',
  'invalid_grant',
  'invalid_request',
  'invalid_scope',
  'unauthorized_client',
]);
export function classifyFcmError(error: unknown): string {
  if (!(error instanceof Error)) return 'unexpected';
  if (error.message === 'FCM is not configured') return 'missing_secret';
  if (error.message === 'Invalid FCM credentials') return 'invalid_credentials';
  if (error.message === 'Invalid FCM project') return 'invalid_project';
  if (error.message === 'FCM authorization failed') return 'oauth_rejected';
  if (error.name === 'SyntaxError') return 'invalid_credentials_json';
  if (error.name === 'TimeoutError' || error.name === 'AbortError')
    return 'request_timeout';
  if (
    error.name === 'DataError' ||
    error.name === 'OperationError' ||
    error.name === 'InvalidCharacterError'
  )
    return 'invalid_signing_key';
  if (error.name === 'TypeError') return 'transport_or_key_error';
  return 'unexpected';
}
function base64Url(value: Uint8Array | string) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
async function fcmAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000)
    return cachedAccessToken.value;
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) throw new Error('FCM is not configured');
  const credentials = JSON.parse(raw) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
    token_uri?: string;
  };
  const project = credentials.project_id,
    email = credentials.client_email,
    privateKey = credentials.private_key,
    tokenUri = credentials.token_uri ?? 'https://oauth2.googleapis.com/token';
  if (
    !project ||
    !/^[a-z0-9-]{4,128}$/.test(project) ||
    !email ||
    email.length > 256 ||
    !privateKey ||
    tokenUri !== 'https://oauth2.googleapis.com/token'
  )
    throw new Error('Invalid FCM credentials');
  const now = Math.floor(Date.now() / 1000),
    header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    claims = base64Url(
      JSON.stringify({
        iss: email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: tokenUri,
        iat: now,
        exp: now + 3600,
      }),
    ),
    unsigned = `${header}.${claims}`,
    pem = privateKey.replace(
      /-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,
      '',
    ),
    keyBytes = Uint8Array.from(atob(pem), (character) =>
      character.charCodeAt(0),
    ),
    key = await crypto.subtle.importKey(
      'pkcs8',
      keyBytes,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    ),
    signature = new Uint8Array(
      await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        key,
        encoder.encode(unsigned),
      ),
    ),
    assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
  const value = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  } | null;
  if (!response.ok || !value?.access_token) {
    const providerCode = oauthErrorCodes.has(value?.error ?? '')
      ? value!.error!
      : 'other';
    console.warn(
      JSON.stringify({
        event: 'fcm_oauth_failed',
        status: response.status,
        provider_code: providerCode,
      }),
    );
    throw new Error('FCM authorization failed');
  }
  cachedAccessToken = {
    value: value.access_token,
    expiresAt: Date.now() + Math.max(60, value.expires_in ?? 3600) * 1000,
  };
  return cachedAccessToken.value;
}
async function sendFcm(job: Job) {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw || !job.device_token) throw new Error('FCM is not configured');
  const { project_id: project } = JSON.parse(raw) as { project_id?: string };
  if (!project || !/^[a-z0-9-]{4,128}$/.test(project))
    throw new Error('Invalid FCM project');
  const token = await fcmAccessToken();
  return fetch(
    `https://fcm.googleapis.com/v1/projects/${project}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: job.device_token,
          notification: { title: job.title, body: job.body },
          data: { path: job.path, tag: job.job_id },
          android: {
            priority: 'normal',
            notification: { channel_id: 'clead_updates' },
          },
        },
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    },
  );
}
export async function handleDispatch(request: Request) {
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  const secret = Deno.env.get('CLEAD_SCHEDULER_SECRET');
  if (
    request.method !== 'POST' ||
    !secret ||
    secret.length < 32 ||
    !(await equalSecret(
      request.headers.get('authorization') ?? '',
      `Bearer ${secret}`,
    ))
  )
    return reply(401, { error: 'Unauthorized' });
  try {
    const admin = service();
    const due = await admin.rpc('process_due_notifications');
    if (due.error) throw due.error;
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY'),
      privateKey = Deno.env.get('VAPID_PRIVATE_KEY'),
      subject = Deno.env.get('VAPID_SUBJECT'),
      webConfigured = !!publicKey && !!privateKey && !!subject,
      fcmConfigured = !!Deno.env.get('FCM_SERVICE_ACCOUNT');
    if (!webConfigured && !fcmConfigured)
      return reply(200, { in_app: true, push_configured: false });
    const jobs: Job[] = [];
    for (const provider of [
      ...(webConfigured ? ['web'] : []),
      ...(fcmConfigured ? ['fcm'] : []),
    ]) {
      const claimed = await admin.rpc('claim_push_jobs', {
        batch_size: 10,
        provider_filter: provider,
      });
      if (claimed.error) throw claimed.error;
      jobs.push(...(claimed.data as Job[]));
    }
    let delivered = 0;
    for (const job of jobs) {
      let outcome = 'failed';
      if ((job.provider ?? 'web') === 'fcm') {
        try {
          const sent = await sendFcm(job);
          outcome = sent.ok
            ? 'delivered'
            : [404, 410].includes(sent.status)
              ? 'invalid'
              : sent.status === 429 || sent.status >= 500
                ? 'retry'
                : 'failed';
          if (!sent.ok)
            console.warn(
              JSON.stringify({
                event: 'fcm_provider_failed',
                status: sent.status,
                outcome,
              }),
            );
          await sent.body?.cancel();
        } catch (error) {
          console.warn(
            JSON.stringify({
              event: 'fcm_send_retry',
              reason: classifyFcmError(error),
            }),
          );
          outcome = 'retry';
        }
      } else if (allowedEndpoint(job.endpoint))
        try {
          const details = webpush.generateRequestDetails(
            {
              endpoint: job.endpoint,
              keys: { p256dh: job.p256dh, auth: job.auth_secret },
            },
            JSON.stringify({
              title: job.title,
              body: job.body,
              path: job.path,
              tag: job.job_id,
            }),
            {
              vapidDetails: { subject, publicKey, privateKey },
              TTL: 60,
              urgency: 'normal',
            },
          );
          const sent = await fetch(details.endpoint, {
            method: 'POST',
            headers: details.headers,
            body: new Uint8Array(details.body),
            redirect: 'error',
            signal: AbortSignal.timeout(8000),
          });
          outcome = sent.ok
            ? 'delivered'
            : [404, 410].includes(sent.status)
              ? 'invalid'
              : sent.status === 429 || sent.status >= 500
                ? 'retry'
                : 'failed';
          await sent.body?.cancel();
        } catch {
          outcome = 'retry';
        }
      const finished = await admin.rpc('finish_push_job', {
        target_job: job.job_id,
        claim_id: job.claim_id,
        outcome,
      });
      if (finished.error) throw finished.error;
      if (outcome === 'delivered') delivered++;
    }
    return reply(200, {
      in_app: true,
      push_configured: true,
      processed: jobs.length,
      delivered,
    });
  } catch {
    return reply(503, {
      error: 'Delivery incomplete; pending work remains retryable',
    });
  }
}
