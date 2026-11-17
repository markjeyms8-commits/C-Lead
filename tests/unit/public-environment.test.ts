import { it, expect, vi } from 'vitest';
import { loadEnv } from 'vite';
import {
  assertPublicEnvironment,
  publicEnvironmentNames,
} from '../../src/config/publicEnvironment';
const token = (role: string) =>
  `header.${btoa(JSON.stringify({ role }))}.signature`;
it('accepts Vercel metadata without exposing it through Vite environment prefixes', () => {
  const metadata = {
    VITE_VERCEL_GIT_REPO_ID: 'fictional-repository',
    VITE_VERCEL_GIT_COMMIT_MESSAGE: 'fictional-commit',
    VITE_VERCEL_ENV: 'production',
    VITE_VERCEL_URL: 'fictional.vercel.app',
  };
  expect(() => assertPublicEnvironment(metadata)).not.toThrow();
  try {
    for (const [name, value] of Object.entries(metadata))
      vi.stubEnv(name, value);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_fictional');
    const exposed = loadEnv(
      'test',
      '/nonexistent-clead-env',
      publicEnvironmentNames,
    );
    for (const name of Object.keys(metadata))
      expect(exposed).not.toHaveProperty(name);
    expect(exposed.VITE_SUPABASE_ANON_KEY).toBe('sb_publishable_fictional');
  } finally {
    vi.unstubAllEnvs();
  }
});
it('accepts only documented public configuration', () => {
  expect(() =>
    assertPublicEnvironment({
      VITE_SUPABASE_URL: 'https://fictional.supabase.co',
      VITE_SUPABASE_ANON_KEY: token('anon'),
      VITE_VAPID_PUBLIC_KEY: 'B'.repeat(87),
    }),
  ).not.toThrow();
  expect(() =>
    assertPublicEnvironment({
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_fictional',
    }),
  ).not.toThrow();
});
it('rejects service-role and session tokens even under the public-key variable', () => {
  for (const key of [
    token('service_role'),
    token('authenticated'),
    'sb_secret_fictional',
  ])
    expect(() =>
      assertPublicEnvironment({ VITE_SUPABASE_ANON_KEY: key }),
    ).toThrow();
});
it('rejects unapproved Vite variables without disclosing their values', () => {
  for (const name of [
    'VITE_SERVICE_ROLE_KEY',
    'VITE_VAPID_PRIVATE_KEY',
    'VITE_LOGIN_PASSWORD_PEPPER',
    'VITE_SCHEDULER_SECRET',
    'VITE_UNREVIEWED',
  ]) {
    try {
      assertPublicEnvironment({ [name]: 'fictional-private-value' });
      throw new Error('Expected rejection');
    } catch (error) {
      expect(String(error)).not.toContain('fictional-private-value');
      expect(String(error)).toContain(name);
    }
  }
});
