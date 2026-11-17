import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import process from 'node:process';
import { URL } from 'node:url';

// Explicit local operator tool; never imported into Vite or run by npm install.
const schema = z
  .object({
    full_name: z.string().trim().min(1).max(160),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{3,40}$/),
    student_number: z.string().min(3).max(40),
  })
  .strict();
async function main() {
  const url = new URL(process.env.SUPABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('This bootstrap tool only permits local Supabase.');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pepper = process.env.LOGIN_PASSWORD_PEPPER;
  if (!key || !pepper || pepper.length < 32)
    throw new Error(
      'Set local SUPABASE_SERVICE_ROLE_KEY and LOGIN_PASSWORD_PEPPER.',
    );
  const inputPath = process.argv[2];
  if (!inputPath)
    throw new Error(
      'Pass the absolute path to a private JSON file with full_name, username and student_number.',
    );
  const input = schema.parse(JSON.parse(readFileSync(inputPath, 'utf8')));
  const client = createClient(url.href, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const existing = await client.from('profiles').select('id').limit(1);
  if (existing.error || existing.data?.length)
    throw new Error(
      'Bootstrap requires migrated local Supabase and an empty roster.',
    );
  const email = `${randomUUID()}@identity.c-lead.invalid`;
  const password = createHmac('sha256', pepper)
    .update(input.student_number)
    .digest('hex');
  const created = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error('Local Auth account creation failed.');
  const result = await client.rpc('bootstrap_president', {
    auth_user_id: created.data.user.id,
    official_name: input.full_name,
    normalized_username: input.username,
    official_student_number: input.student_number,
    identity_email: email,
  });
  if (result.error) {
    // A network error may occur after commit. Never delete a provisioned user.
    const check = await client
      .from('profiles')
      .select('id')
      .eq('id', created.data.user.id)
      .maybeSingle();
    if (check.error)
      throw new Error(
        'Bootstrap outcome unknown. Inspect local Auth and profiles before retrying.',
      );
    if (!check.data) {
      const cleanup = await client.auth.admin.deleteUser(created.data.user.id);
      if (cleanup.error)
        throw new Error(
          'Bootstrap failed; remove the unprovisioned local Auth user after inspection.',
        );
      throw new Error(
        'Bootstrap failed; the unprovisioned Auth user was removed.',
      );
    }
  }
  process.stdout.write(
    'Local President account provisioned. Sign in with the normalized username and student number.\n',
  );
}
main().catch((error) => {
  process.stderr.write(
    error instanceof z.ZodError
      ? 'Invalid private account input.\n'
      : `${error.message}\n`,
  );
  process.exitCode = 1;
});
