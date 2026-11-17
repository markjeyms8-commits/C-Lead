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
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  title: string;
  body: string;
  path: string;
};
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
      subject = Deno.env.get('VAPID_SUBJECT');
    if (!publicKey || !privateKey || !subject)
      return reply(200, { in_app: true, push_configured: false });
    const claimed = await admin.rpc('claim_push_jobs', { batch_size: 10 });
    if (claimed.error) throw claimed.error;
    let delivered = 0;
    for (const job of claimed.data as Job[]) {
      let outcome = 'failed';
      if (allowedEndpoint(job.endpoint))
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
      processed: claimed.data.length,
      delivered,
    });
  } catch {
    return reply(503, {
      error: 'Delivery incomplete; pending work remains retryable',
    });
  }
}
