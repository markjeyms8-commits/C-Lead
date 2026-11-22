import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { hostedConfiguration } from './hosted-safety.mjs';
import { hostedFailureDetails } from './hosted-diagnostics.mjs';
let phase = 'hosted configuration';
function step(name) {
  phase = name;
  process.stdout.write(`Step: ${name}\n`);
}
function check(condition, result) {
  if (!condition) {
    process.stderr.write(
      `Check failed: ${phase}${hostedFailureDetails(result)}\n`,
    );
    throw new Error('Bootstrap check failed');
  }
}
async function main() {
  const c = hostedConfiguration(process.env);
  step('bootstrap acknowledgement');
  if (process.env.CLEAD_BOOTSTRAP_ACK !== 'CREATE_FIRST_PRESIDENT')
    throw new Error('ack');
  step('read private recovery file');
  const saved = JSON.parse(
    readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''),
  );
  step('validate account details');
  const parsed = z
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
    .safeParse(saved);
  if (!parsed.success) {
    const allowed = ['auth_user_id', 'full_name', 'username', 'student_number'];
    const fields = [
      ...new Set(
        parsed.error.issues.map((issue) =>
          allowed.includes(issue.path[0]) ? issue.path[0] : 'file structure',
        ),
      ),
    ];
    process.stderr.write(
      `Invalid fields: ${fields.join(', ')}. Values were not logged.\n`,
    );
    throw new Error('Invalid account details');
  }
  const input = parsed.data;
  const client = createClient(c.url, c.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const args = {
    auth_user_id: input.auth_user_id,
    official_name: input.full_name,
    normalized_username: input.username,
    official_student_number: input.student_number,
  };
  step('reserve first President');
  const reserved = await client.rpc('reserve_president', args);
  check(!reserved.error, reserved);
  step('lookup reserved Auth identity');
  const existing = await client.auth.admin.getUserById(input.auth_user_id);
  if (existing.data.user) {
    step('verify reserved Auth ownership');
    if (existing.data.user.app_metadata.clead_bootstrap !== input.auth_user_id)
      throw new Error('ownership');
  } else {
    check(existing.error?.status === 404, existing);
    step('create President Auth identity');
    const result = await client.auth.admin.createUser({
      id: input.auth_user_id,
      email: `${input.auth_user_id}@identity.c-lead.invalid`,
      email_confirm: true,
      password: createHmac('sha256', c.pepper)
        .update(input.student_number)
        .digest('hex'),
      app_metadata: { clead_bootstrap: input.auth_user_id },
    });
    check(!result.error && result.data.user?.id === input.auth_user_id, result);
  }
  step('finalize President profile');
  const result = await client.rpc('bootstrap_president', {
    ...args,
    identity_email: `${input.auth_user_id}@identity.c-lead.invalid`,
  });
  check(!result.error, result);
  process.stdout.write(
    'First President provisioned. Retain the private input file for idempotent recovery. No credentials were logged.\n',
  );
}
main().catch(() => {
  process.stderr.write(
    `Bootstrap failed during: ${phase}. Retry with the SAME private input file; do not create a new identity or delete existing records. No credentials were logged.\n`,
  );
  process.exitCode = 1;
});
