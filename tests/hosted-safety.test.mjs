import { test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hostedConfiguration } from '../scripts/hosted-safety.mjs';
import { hostedFailureDetails } from '../scripts/hosted-diagnostics.mjs';
test('diagnostics report only HTTP status and database error codes', () => {
  assert.equal(
    hostedFailureDetails({ status: 403, error: { code: '42501' } }),
    ' (HTTP 403, database code 42501)',
  );
  assert.equal(
    hostedFailureDetails({ error: { context: { status: 401 } } }),
    ' (HTTP 401)',
  );
  assert.equal(
    hostedFailureDetails({ error: { code: 'PGRST202' } }),
    ' (database code PGRST202)',
  );
});
test('diagnostics never expose remote messages, bodies or arbitrary codes', () => {
  assert.equal(
    hostedFailureDetails({
      error: {
        message: 'private-value',
        details: 'private-value',
        code: 'private-value',
        status: 'private-value',
        context: { body: 'private-value' },
      },
    }),
    '',
  );
  assert.equal(hostedFailureDetails(undefined), '');
});
const ref = 'abcdefghijklmnopqrst';
const env = {
  CLEAD_PROJECT_REF: ref,
  CLEAD_TEST_TARGET_REF: ref,
  CLEAD_HOSTED_URL: `https://${ref}.supabase.co`,
  CLEAD_SERVICE_ROLE_KEY: 'server-test-marker',
  CLEAD_ANON_KEY: 'public-test-marker',
  CLEAD_LOGIN_PASSWORD_PEPPER: 'x'.repeat(32),
  CLEAD_TEST_ACK: 'FICTIONAL_ONLY_PREPRODUCTION',
};
test('bootstrap rejects invalid private fields without logging their values', () => {
  const folder = mkdtempSync(join(tmpdir(), 'clead-bootstrap-check-'));
  try {
    const input = join(folder, 'input.json');
    writeFileSync(
      input,
      JSON.stringify({
        auth_user_id: '00000000-0000-4000-a000-000000000001',
        full_name: 'Fictional President',
        username: 'PRIVATE VALUE WITH SPACES',
        student_number: 'PRIVATE-NUMBER',
      }),
    );
    const result = spawnSync(
      process.execPath,
      ['scripts/bootstrap-hosted.mjs', input],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          ...env,
          CLEAD_BOOTSTRAP_ACK: 'CREATE_FIRST_PRESIDENT',
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid fields: username/);
    assert.match(result.stderr, /validate account details/);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /PRIVATE VALUE|PRIVATE-NUMBER|Fictional President|server-test-marker/,
    );
    assert.doesNotMatch(result.stdout, /reserve first President/);
  } finally {
    rmSync(join(folder, 'input.json'));
    rmdirSync(folder);
  }
});
test('accepts only explicit matching hosted configuration', () => {
  assert.equal(hostedConfiguration(env).ref, ref);
});
test('missing variables fail closed', () => {
  for (const key of Object.keys(env))
    assert.throws(() => hostedConfiguration({ ...env, [key]: '' }));
});
test('rejects mismatches and unsafe URLs', () => {
  assert.throws(() =>
    hostedConfiguration({ ...env, CLEAD_TEST_TARGET_REF: 'z'.repeat(20) }),
  );
  for (const url of [
    'http://localhost:54321',
    `http://${ref}.supabase.co`,
    `https://${ref}.supabase.co/path`,
    `https://user@${ref}.supabase.co`,
    `https://${ref}.supabase.co?x=y`,
    'https://example.com',
  ])
    assert.throws(() => hostedConfiguration({ ...env, CLEAD_HOSTED_URL: url }));
});
test('rejects server secrets exposed through Vite', () => {
  assert.throws(() =>
    hostedConfiguration({
      ...env,
      VITE_SUPABASE_ANON_KEY: env.CLEAD_SERVICE_ROLE_KEY,
    }),
  );
});
