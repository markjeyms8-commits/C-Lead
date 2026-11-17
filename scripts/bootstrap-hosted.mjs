import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { hostedConfiguration } from './hosted-safety.mjs';
async function main() {
  const c = hostedConfiguration(process.env);
  if (process.env.CLEAD_BOOTSTRAP_ACK !== 'CREATE_FIRST_PRESIDENT')
    throw new Error('ack');
  const input = z
    .object({
      auth_user_id: z.uuid(),
      full_name: z.string().trim().min(1).max(160),
      username: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9._-]{3,40}$/),
      student_number: z.string().trim().min(3).max(40),
    })
    .strict()
    .parse(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  const client = createClient(c.url, c.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const args = {
    auth_user_id: input.auth_user_id,
    official_name: input.full_name,
    normalized_username: input.username,
    official_student_number: input.student_number,
  };
  const reserved = await client.rpc('reserve_president', args);
  if (reserved.error) throw reserved.error;
  const existing = await client.auth.admin.getUserById(input.auth_user_id);
  if (existing.data.user) {
    if (existing.data.user.app_metadata.clead_bootstrap !== input.auth_user_id)
      throw new Error('ownership');
  } else {
    if (existing.error?.status !== 404) throw new Error('lookup');
    const result = await client.auth.admin.createUser({
      id: input.auth_user_id,
      email: `${input.auth_user_id}@identity.c-lead.invalid`,
      email_confirm: true,
      password: createHmac('sha256', c.pepper)
        .update(input.student_number)
        .digest('hex'),
      app_metadata: { clead_bootstrap: input.auth_user_id },
    });
    if (result.error) throw result.error;
  }
  const result = await client.rpc('bootstrap_president', {
    ...args,
    identity_email: `${input.auth_user_id}@identity.c-lead.invalid`,
  });
  if (result.error) throw result.error;
  process.stdout.write(
    'First President provisioned. Retain the private input file for idempotent recovery. No credentials were logged.\n',
  );
}
main().catch(() => {
  process.stderr.write(
    'Bootstrap failed. Check explicit target variables, acknowledgement and input. Retry with the SAME private input file; do not create a new identity or delete existing records.\n',
  );
  process.exitCode = 1;
});
