import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  credentialFingerprint,
  passwordDigest,
  preflight,
  readBody,
  response,
  service,
} from '../_shared/auth.ts';
export async function handleAdminAccounts(request: Request) {
  const early = preflight(request);
  if (early) return early;
  try {
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: {
            Authorization: request.headers.get('authorization') || '',
          },
        },
        auth: { persistSession: false },
      },
    );
    const identity = await caller.auth.getUser();
    if (identity.error || !identity.data.user)
      return response(request, { error: 'Unauthorized' }, 401);
    const sessions = await caller.rpc('my_sessions');
    const session = sessions.data?.find(
      (s: { is_current: boolean }) => s.is_current,
    );
    if (sessions.error || !session)
      return response(request, { error: 'Unauthorized' }, 401);
    const body = await readBody(request);
    const admin = service();
    const actor = identity.data.user.id;
    const operator_session = session.id;
    async function rpc(name: string, args: Record<string, unknown>) {
      const result = await admin.rpc(name, args);
      if (result.error) throw result.error;
      return result.data;
    }
    if (body.action === 'create') {
      if (
        typeof body.operation_id !== 'string' ||
        typeof body.full_name !== 'string' ||
        typeof body.username !== 'string' ||
        typeof body.student_number !== 'string'
      )
        throw new Error('Invalid account');
      const prepared = await caller.rpc('prepare_account', {
        operation_id: body.operation_id,
        official_name: body.full_name,
        login_username: body.username,
        official_number: body.student_number,
      });
      if (prepared.error) throw prepared.error;
      const args = { operation_id: prepared.data, actor, operator_session };
      const row = (await rpc('account_creation_details', args))?.[0];
      if (!row) throw new Error('Unavailable operation');
      if (!row.completed) {
        const existing = await admin.auth.admin.getUserById(row.user_id);
        if (existing.data.user) {
          if (
            existing.data.user.app_metadata.clead_creation !== body.operation_id
          )
            throw new Error('Identity mismatch');
        } else {
          if (existing.error?.status !== 404)
            throw new Error('Identity lookup failed');
          const created = await admin.auth.admin.createUser({
            id: row.user_id,
            email: `${row.user_id}@identity.c-lead.invalid`,
            email_confirm: true,
            password: await passwordDigest(row.student_number),
            app_metadata: { clead_creation: body.operation_id },
          });
          if (created.error) throw created.error;
        }
        await rpc('finish_account_creation', args);
      }
      return response(request, { success: true, user_id: row.user_id });
    }
    if (body.action === 'reset') {
      if (typeof body.user_id !== 'string' || typeof body.reason !== 'string')
        throw new Error('Invalid reset');
      const prepared = await caller.rpc('prepare_account_reset', {
        target_user: body.user_id,
        reset_reason: body.reason,
      });
      if (prepared.error) throw prepared.error;
      const args = { operation_id: prepared.data, actor, operator_session };
      const claim = await rpc('claim_credential_write', {
        target_user: body.user_id,
      });
      let credentialFinished = false;
      try {
        const row = (await rpc('account_reset_details', args))?.[0];
        if (!row || row.user_id !== body.user_id)
          throw new Error('Unavailable reset');
        if (!row.completed) {
          const digest = await passwordDigest(row.student_number);
          await rpc('set_password_fingerprint', {
            target_user: row.user_id,
            fingerprint: await credentialFingerprint(digest),
            claim,
            operation_id: prepared.data,
            operation_kind: 'reset',
          });
          const changed = await admin.auth.admin.updateUserById(row.user_id, {
            password: digest,
          });
          if (changed.error) throw changed.error;
          await rpc('finish_account_reset', args);
        }
        credentialFinished = true;
      } finally {
        if (credentialFinished)
          await rpc('release_credential_write', {
            target_user: body.user_id,
            claim,
          });
      }
      return response(request, { success: true });
    }
    return response(request, { error: 'Invalid action' }, 400);
  } catch {
    return response(
      request,
      {
        error:
          'Account operation failed. Check permissions, duplicates, capacity or a pending operation; retry with the same operation.',
      },
      400,
    );
  }
}
