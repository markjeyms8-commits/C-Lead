import {
  credentialFingerprint,
  passwordDigest,
  preflight,
  publicClient,
  readBody,
  response,
  service,
} from '../_shared/auth.ts';
export async function handleUsernameLogin(request: Request) {
  const early = preflight(request);
  if (early) return early;
  const denied = (retryAfter = 0) =>
    response(
      request,
      {
        error:
          'Invalid credentials or temporarily locked. Wait 15 minutes after five failed attempts.',
        retry_after: retryAfter,
      },
      401,
    );
  let username = '';
  let lease: string | null = null;
  const admin = service();
  try {
    const body = await readBody(request);
    username =
      typeof body.username === 'string'
        ? body.username.trim().toLowerCase()
        : '';
    if (
      !/^[a-z0-9._-]{3,40}$/.test(username) ||
      typeof body.password !== 'string' ||
      !body.password.length ||
      body.password.length > 128
    )
      return denied();
    const reservation = await admin.rpc('begin_login', {
      login_username: username,
    });
    if (reservation.error) throw reservation.error;
    if (!reservation.data) {
      const retry = await admin.rpc('login_retry_after', {
        login_username: username,
      });
      return denied(retry.data ?? 0);
    }
    lease = reservation.data;
    const identity = await admin.rpc('resolve_login', {
      login_username: username,
    });
    if (identity.error) throw identity.error;
    const email =
      identity.data?.[0]?.internal_email ||
      `${crypto.randomUUID()}@identity.c-lead.invalid`;
    const digest = await passwordDigest(body.password);
    const expected = identity.data?.[0]?.password_fingerprint;
    if (expected && expected !== (await credentialFingerprint(digest))) {
      await admin.rpc('finish_login', {
        login_username: username,
        lease_token: lease,
        successful: false,
      });
      lease = null;
      const retry = await admin.rpc('login_retry_after', {
        login_username: username,
      });
      return denied(retry.data ?? 0);
    }
    const client = publicClient();
    const result = await client.auth.signInWithPassword({
      email,
      password: digest,
    });
    if (result.error || !result.data.session || !identity.data?.[0]) {
      await admin.rpc('finish_login', {
        login_username: username,
        lease_token: lease,
        successful: false,
      });
      lease = null;
      const retry = await admin.rpc('login_retry_after', {
        login_username: username,
      });
      return denied(retry.data ?? 0);
    }
    const session = result.data.session;
    const payload = JSON.parse(
      atob(
        session.access_token
          .split('.')[1]
          .replace(/-/g, '+')
          .replace(/_/g, '/'),
      ),
    );
    const finished = await admin.rpc('approve_login', {
      login_username: username,
      lease_token: lease,
      auth_session: payload.session_id,
      expected_generation: identity.data[0].credential_generation,
      device_name: deviceName(request.headers.get('user-agent') ?? ''),
    });
    lease = null;
    if (finished.error || !finished.data) {
      await client.auth.signOut({ scope: 'local' });
      return denied();
    }
    return response(request, {
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      },
    });
  } catch {
    if (lease)
      await admin.rpc('finish_login', {
        login_username: username,
        lease_token: lease,
        successful: false,
      });
    return denied();
  }
}
function deviceName(agent: string) {
  const platform = /iPhone|iPad/.test(agent)
    ? 'iPhone / iPad'
    : /Android/.test(agent)
      ? 'Android'
      : /Windows/.test(agent)
        ? 'Windows'
        : /Macintosh/.test(agent)
          ? 'Mac'
          : 'Browser';
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /Chrome\//.test(agent)
      ? 'Chrome'
      : /Firefox\//.test(agent)
        ? 'Firefox'
        : /Safari\//.test(agent)
          ? 'Safari'
          : 'Browser';
  return `${platform} · ${browser}`;
}
