import { spawnSync } from 'node:child_process';
import process from 'node:process';
// Test-only public configuration, never persisted to .env or shipped in dist/.
const env = {
  ...process.env,
  VITE_SUPABASE_URL: 'https://auth-fixture.invalid',
  VITE_VAPID_PUBLIC_KEY: 'B'.repeat(87), // Public marker; browser PushManager is intercepted in tests.
  VITE_SUPABASE_ANON_KEY: 'test-only-public-key-not-a-credential',
};
for (const args of [
  ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'dist-auth-tests'],
  [
    'node_modules/@playwright/test/cli.js',
    'test',
    '--config',
    'playwright.auth.config.ts',
    '--workers=2',
  ],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
