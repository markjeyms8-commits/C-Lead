# Testing

`npm test` runs unit tests for role boundaries, normalized identity input and locale parity, plus actual PostgreSQL migration/RLS tests using PGlite with stand-ins for Supabase-owned auth/storage schemas. `npm run test:e2e` uses Chromium desktop and iPhone-sized Chromium for foundation UX, protected routes, setup-aware login, themes/locales, installation guidance, offline indicators and axe accessibility checks in both themes. Mobile emulation does not replace real iPhone Safari installation tests.

`npm run lint`, `npm run format:check`, `npm run typecheck`, and `npm run build` are required checks. Production build generates the manifest and custom service worker. Browser binaries: `npx playwright install chromium`.

The E2E script builds and serves production using Vite preview; it verifies actual service-worker offline reloads rather than only an offline banner. Run `npx --yes deno check supabase/functions/username-login/index.ts supabase/functions/change-password/index.ts` to type-check the Edge Functions without deploying. Deno runtime checks passed in the foundation run; real Auth integration remains separate.

## Authentication milestone suites

- `npm run test:e2e:auth` builds to ignored `dist-auth-tests/` with a reserved `.invalid` test endpoint and intercepts all Supabase requests inside Playwright. It exercises real frontend session handling, onboarding, preferences, role guards, outage recovery, revocation, passwords and mobile installation enforcement. Test fixtures are isolated from `dist/` and are not an application backend.
- `npx --yes deno test --allow-env supabase/functions/auth_test.ts` executes the real Edge handlers with intercepted API responses. It verifies password HMAC transformation, session approval, lockout responses, revocation ordering, invalid sessions, origins and bounded request bodies.
- `npm run test:integration:hosted` uses the explicitly matched hosted pre-production target and one fictional disposable account; see SETUP.md. It requires server-only operator credentials. `npm run test:hosted-safety` verifies target guards without credentials.

The PostgreSQL suite now includes notification ownership, atomic validation/acceptance, own-device revocation/audits, stale-login rejection during password changes, idempotent password completion, bootstrap permissions and non-resurrection of sessions after account reactivation.

## Database and Edge tests

Run `npm test` for in-memory PostgreSQL migration/RLS tests. The SQL assertions in `supabase/tests` are supplementary reference checks and are not applied to the hosted project by this runner. Hosted tests use only their run-owned fictional account; no real roster is imported.

## Hosted and device verification gates

Credential-free tests exercise the implemented workflows through PostgreSQL/RLS, real Edge handlers with intercepted upstream responses, and actual Ionic pages with fictional service fixtures. This includes accounts/import/reset/deactivation, academic management, communication/private files, groups/polls/tasks, attendance/corrections, contributions, calendar/notifications, reports/search/analytics, offline copies and problem reporting. This does not establish live Supabase integration.

Hosted Auth/PostgREST/Storage/Realtime behavior, credential-write interruption timing, deployed cron, real provider Web Push, signed-link expiry/revocation timing and real Android/iPhone installation remain gates. The required one-week pilot has not occurred. No hosted pass is claimed.

Use `npm run check:edge` and `npm run test:edge` for all five entrypoints and handler tests with the isolated Deno configuration. The production-mode shell suite tests actual offline reload and Update/Later confirmation. Its update test temporarily changes only ignored `dist-shell-tests/sw.js` and restores it. The duplicate mobile invocation is skipped to avoid concurrent changes to that shared test file.

Run memory-heavy PostgreSQL and browser/build suites sequentially on constrained machines. A resource timeout must be rerun, never counted as a pass.
