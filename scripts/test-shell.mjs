import { spawnSync } from 'node:child_process';
import process from 'node:process';
// Keep shell preview tests independent of the operator's real public project configuration.
const env = {
  ...process.env,
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_ANON_KEY: '',
};
for (const args of [
  ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'dist-shell-tests'],
  ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
