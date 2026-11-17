import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostedConfiguration } from '../scripts/hosted-safety.mjs';
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
