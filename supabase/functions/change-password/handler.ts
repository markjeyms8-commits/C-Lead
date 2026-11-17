import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  credentialFingerprint,
  passwordDigest,
  preflight,
  readBody,
  response,
  service,
} from '../_shared/auth.ts';
export async function handlePasswordChange(request: Request) {
  const early = preflight(request);
  if (early) return early;
  try {
    const authorization = request.headers.get('authorization') || '';
    const client = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      },
    );
    const [{ data: userData, error: userError }, active] = await Promise.all([
      client.auth.getUser(),
      client.rpc('is_active_session'),
    ]);
    if (userError || !userData.user || active.error || !active.data)
      return response(request, { error: 'Unauthorized' }, 401);
    const body = await readBody(request);
    if (
      typeof body.password !== 'string' ||
      body.password.length < 12 ||
      body.password.length > 128
    )
      return response(
        request,
        { error: 'Password must contain 12–128 characters' },
        400,
      );
    const admin = service();
    // Revoke other sessions and audit intent before making the nontransactional
    // Auth request. A failed request can be retried from this approved session.
    const lease = await admin.rpc('claim_credential_write', {
      target_user: userData.user.id,
    });
    if (lease.error || !lease.data)
      throw new Error('Credential operation busy');
    let credentialFinished = false;
    try {
      const operation = await client.rpc('begin_password_change');
      if (operation.error || !operation.data)
        throw operation.error ?? new Error('Unable to start password change');
      const digest = await passwordDigest(body.password);
      const fingerprint = await admin.rpc('set_password_fingerprint', {
        target_user: userData.user.id,
        fingerprint: await credentialFingerprint(digest),
        claim: lease.data,
        operation_id: operation.data,
        operation_kind: 'change',
      });
      if (fingerprint.error) throw fingerprint.error;
      const result = await admin.auth.admin.updateUserById(userData.user.id, {
        password: digest,
      });
      if (result.error) throw result.error;
      const audit = await admin.rpc('finish_password_change', {
        change_id: operation.data,
        actor: userData.user.id,
      });
      if (audit.error) throw audit.error;
      credentialFinished = true;
      return response(request, { success: true });
    } finally {
      if (credentialFinished)
        await admin.rpc('release_credential_write', {
          target_user: userData.user.id,
          claim: lease.data,
        });
    }
  } catch {
    return response(request, { error: 'Unable to change password' }, 400);
  }
}
