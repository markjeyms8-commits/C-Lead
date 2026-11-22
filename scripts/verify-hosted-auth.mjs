import process from 'node:process';
import { randomUUID, createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { hostedConfiguration } from './hosted-safety.mjs';
import { hostedFailureDetails } from './hosted-diagnostics.mjs';
let phase = 'configuration';
let failurePhase;
let cleanupCompleted = false;
function step(name) {
  phase = name;
  process.stdout.write(`Step: ${name}\n`);
}
function check(condition, result) {
  if (!condition) {
    failurePhase ??= phase;
    process.stderr.write(
      `Check failed: ${phase}${hostedFailureDetails(result)}\n`,
    );
    throw new Error('Verification failed');
  }
}
async function main() {
  const c = hostedConfiguration(process.env);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(c.url, c.serviceKey, options);
  const recovery = process.argv[2] === '--cleanup';
  check(!process.argv[2] || recovery);
  const run = recovery ? process.argv[3] : randomUUID();
  check(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      run ?? '',
    ),
  );
  async function fixture(name, extra = {}) {
    step(name + (extra.release_lock ? ' (release lock)' : ''));
    const result = await admin.rpc(name, {
      run_id: run,
      target_ref: c.ref,
      ...extra,
    });
    check(!result.error, result);
    return result.data;
  }
  async function cleanup() {
    const id = await fixture('retire_hosted_test');
    step('cleanup Auth ownership lookup');
    const existing = await admin.auth.admin.getUserById(id);
    check(!existing.error || existing.error.status === 404, existing);
    if (existing.data?.user) {
      check(existing.data.user.app_metadata.clead_test_run === run);
      step('ban run-owned fictional Auth account');
      const banned = await admin.auth.admin.updateUserById(id, {
        ban_duration: '876000h',
      });
      check(!banned.error, banned);
    }
    await fixture('retire_hosted_test', { release_lock: true });
    cleanupCompleted = true;
    process.stdout.write(
      'Fictional account retired; audit records and referents retained.\n',
    );
  }
  if (recovery) {
    await cleanup();
    return;
  }
  const id = randomUUID();
  process.stdout.write(
    `Run ${run}; recovery: npm run test:integration:hosted -- --cleanup ${run}\n`,
  );
  await fixture('reserve_hosted_test', { test_user: id });
  const suffix = run.replaceAll('-', '');
  const username = `test_${suffix}`;
  const password = `TEST-${suffix}`;
  const email = `${suffix}@identity.c-lead.invalid`;
  try {
    step('create fictional Auth account');
    const created = await admin.auth.admin.createUser({
      id,
      email,
      email_confirm: true,
      password: createHmac('sha256', c.pepper).update(password).digest('hex'),
      app_metadata: { clead_test_run: run },
    });
    check(!created.error && created.data.user?.id === id, created);
    await fixture('provision_hosted_test');
    const first = createClient(c.url, c.anonKey, options);
    const second = createClient(c.url, c.anonKey, options);
    const probe = createClient(c.url, c.anonKey, options);
    async function login(client, visiblePassword) {
      step('username-login');
      const result = await client.functions.invoke('username-login', {
        body: { username, password: visiblePassword },
      });
      check(!result.error && result.data?.session, result);
      step('restore approved Auth session');
      check(!(await client.auth.setSession(result.data.session)).error);
      check((await client.rpc('is_active_session')).data === true);
    }
    await login(first, password);
    await login(second, password);
    step('refresh session and profile RLS');
    check(!(await first.auth.refreshSession()).error);
    check((await first.rpc('is_active_session')).data === true);
    const profile = await first
      .from('profiles')
      .select('id')
      .eq('id', id)
      .single();
    check(!profile.error && profile.data.id === id);
    step('reject raw password bypass');
    check(!!(await probe.auth.signInWithPassword({ email, password })).error);
    step('device session revocation and RLS');
    const sessions = await second.rpc('my_sessions');
    check(!sessions.error && sessions.data.length === 2);
    const other = sessions.data.find((row) => row.is_current);
    check(
      other &&
        !(await first.rpc('revoke_my_session', { target_session: other.id }))
          .error,
    );
    check((await second.rpc('is_active_session')).data === false);
    const denied = await second.from('profiles').select('id').eq('id', id);
    check(!denied.error && denied.data.length === 0);
    step('complete onboarding');
    check(
      !(
        await first.rpc('complete_onboarding', {
          chosen_language: 'en',
          chosen_theme: 'light',
          notification_choices: {},
          privacy_accepted: true,
          community_accepted: true,
          tour_completed: true,
        })
      ).error,
    );
    const replacement = randomUUID() + randomUUID();
    step('change password');
    const changed = await first.functions.invoke('change-password', {
      body: { password: replacement },
    });
    check(!changed.error && changed.data?.success, changed);
    await login(probe, replacement);
    step('security notification');
    const notices = await probe
      .from('notifications')
      .select('id')
      .eq('category', 'security');
    check(!notices.error && notices.data.length > 0);
    step('five-failure lockout');
    const attempts = createClient(c.url, c.anonKey, options);
    for (let attempt = 0; attempt < 5; attempt++) {
      const failed = await attempts.functions.invoke('username-login', {
        body: { username, password: 'fictional-incorrect-password' },
      });
      check(failed.error?.context?.status === 401);
    }
    const locked = await attempts.functions.invoke('username-login', {
      body: { username, password: replacement },
    });
    check(locked.error?.context?.status === 401);
    const lockMessage = await locked.error.context.json();
    check(lockMessage.retry_after > 0 && lockMessage.retry_after <= 900);
    process.stdout.write(
      'Hosted login, refresh, RLS, revocation, onboarding, password and lockout checks passed.\n',
    );
  } catch (error) {
    failurePhase ??= phase;
    process.stderr.write(
      `Verification stopped during: ${phase}. Attempting run-owned cleanup.\n`,
    );
    throw error;
  } finally {
    await cleanup();
  }
}
main().catch(() => {
  process.stderr.write(
    `Hosted verification failed during: ${failurePhase ?? phase}.${cleanupCompleted ? ' Fictional account cleanup completed; no cleanup retry needed.' : ' Retry cleanup with the printed run UUID if present.'} No credentials were logged.\n`,
  );
  process.exitCode = 1;
});
