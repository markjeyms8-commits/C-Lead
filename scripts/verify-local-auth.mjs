import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
// Real Supabase integration, deliberately separate from intercepted browser tests.
const inputSchema = z.object({
  username: z.string().trim().toLowerCase(),
  password: z.string().min(1),
  new_password: z.string().min(12).max(128).optional(),
});
function check(value, message) {
  if (!value) throw new Error(message);
}
async function main() {
  const url = new URL(process.env.SUPABASE_URL ?? '');
  check(
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    'Local Supabase is required.',
  );
  const key = process.env.SUPABASE_ANON_KEY;
  check(key, 'Set the real local SUPABASE_ANON_KEY.');
  check(
    process.argv[2],
    'Pass a private JSON file containing username, password and optional new_password for a disposable local account.',
  );
  const input = inputSchema.parse(
    JSON.parse(readFileSync(process.argv[2], 'utf8')),
  );
  const make = () =>
    createClient(url.href, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  async function login(client, password) {
    const reply = await client.functions.invoke('username-login', {
      body: { username: input.username, password },
    });
    check(!reply.error && reply.data?.session, 'Username login failed.');
    const result = await client.auth.setSession(reply.data.session);
    check(!result.error, 'Session restoration failed.');
    return result.data.user;
  }
  const first = make();
  const second = make();
  const probe = make();
  try {
    const user = await login(first, input.password);
    await login(second, input.password);
    const active = await first.rpc('is_active_session');
    check(active.data === true, 'Approved session was not active.');
    const roster = await first
      .from('profiles')
      .select('id,full_name,role')
      .eq('id', user.id)
      .single();
    check(!roster.error && roster.data, 'Profile is not visible under RLS.');
    const direct = await probe.auth.signInWithPassword({
      email: user.email,
      password: input.password,
    });
    check(
      !!direct.error,
      'Raw visible password bypassed the username gateway.',
    );
    const devices = await first.rpc('my_sessions');
    check(
      !devices.error && devices.data.length >= 2,
      'Multiple devices were not registered.',
    );
    const secondDevices = await second.rpc('my_sessions');
    const secondId = secondDevices.data?.find((row) => row.is_current)?.id;
    check(secondId, 'Second session was not identified.');
    const revoked = await first.rpc('revoke_my_session', {
      target_session: secondId,
    });
    check(!revoked.error, 'Own-session revocation failed.');
    const inactive = await second.rpc('is_active_session');
    check(inactive.data === false, 'Revoked JWT retained application access.');
    const denied = await second.from('profiles').select('id');
    check(
      !denied.error && denied.data.length === 0,
      'Revoked session could read roster rows.',
    );
    if (input.new_password) {
      const changed = await first.functions.invoke('change-password', {
        body: { password: input.new_password },
      });
      check(
        !changed.error && changed.data?.success,
        'Password change failed; retry using the current session before signing out.',
      );
      await login(probe, input.new_password);
      const notices = await probe
        .from('notifications')
        .select('category')
        .eq('category', 'security');
      check(
        !notices.error && notices.data.length > 0,
        'Password security notice is missing.',
      );
    }
    process.stdout.write(
      'Real local Auth checks passed: login, restoration, password gateway, devices, RLS and revocation.\n',
    );
  } finally {
    for (const client of [first, second, probe]) {
      await client.rpc('revoke_current_session');
      await client.auth.signOut({ scope: 'local' });
    }
  }
}
main().catch(() => {
  process.stderr.write(
    'Local Auth verification failed. Check local service configuration and the disposable account; no credentials were logged.\n',
  );
  process.exitCode = 1;
});
