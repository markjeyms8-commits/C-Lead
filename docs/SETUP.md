# Setup

## Frontend development

Use Node 22.12+ or Node 24 LTS. Run `npm ci`, then `npm run dev`. The existing `.env` / `.env.local` may contain only public frontend configuration: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`. Never put a service-role key or password pepper in any `VITE_` variable. Restart Vite after changes. Do not deploy the frontend or import the student roster during verification.

## Hosted pre-production prerequisites

Docker and a local Supabase stack are not required or supported by this workflow. Use the single approved hosted project while it is still pre-production and contains no production student data. Disable public Auth signups. The tests create exactly one new, clearly named `FICTIONAL C-LEAD Disposable Test` student per run; they never select an existing account as their test subject. A fictional student does not bootstrap a President or authorize account administration.

In a private operator PowerShell terminal, populate the following variables from the approved project dashboard and your secret manager. The two project-reference values must be supplied independently and match exactly. The reference is the 20-letter identifier in the project's Supabase URL. The pepper must be the same stable secret configured on the authentication Edge Functions (at least 32 characters).

```powershell
$env:CLEAD_PROJECT_REF = '<approved-project-reference>'
$env:CLEAD_TEST_TARGET_REF = '<explicitly-approved-test-target-reference>'
$env:CLEAD_HOSTED_URL = 'https://<approved-project-reference>.supabase.co'
$env:CLEAD_ANON_KEY = '<project-anon-or-publishable-key>'
$env:CLEAD_SERVICE_ROLE_KEY = '<server-only-service-role-key>'
$env:CLEAD_LOGIN_PASSWORD_PEPPER = '<existing-stable-server-pepper>'
$env:CLEAD_TEST_ACK = 'FICTIONAL_ONLY_PREPRODUCTION'
```

Do not store these commands with actual values in repository files, terminal transcripts or shared logs. Use a separate terminal for Vite. Hosted verification reads explicit process variables only, never `.env` files. No credentials are printed. The acknowledgment is an operator assertion, not automatic proof that a project has no real student data.

## Apply additive migrations and authentication functions

Only an authorized project operator should run these commands after reviewing the migrations. They apply additive versioned changes; they do not reset the database or delete/recreate schemas. Do not use `db reset`, `supabase start`, or local function serving.

```powershell
node --input-type=module -e "import {hostedConfiguration} from './scripts/hosted-safety.mjs'; hostedConfiguration(process.env)"
if ($LASTEXITCODE -ne 0) { throw 'Hosted target validation failed' }
npx supabase login
npx supabase link --project-ref $env:CLEAD_PROJECT_REF
if ($LASTEXITCODE -ne 0) { throw 'Project linking failed' }
$linkedTestRef = (Get-Content -LiteralPath 'supabase/.temp/project-ref' -Raw).Trim()
if ($linkedTestRef -ne $env:CLEAD_PROJECT_REF -or $linkedTestRef -ne $env:CLEAD_TEST_TARGET_REF) { throw 'Linked project does not match explicit test target' }
npx supabase db push --linked --dry-run
if ($LASTEXITCODE -ne 0) { throw 'Migration dry run failed' }
# Confirm the linked project reference in the CLI output matches BOTH explicit references.
npx supabase db push --linked
```

Configure `LOGIN_PASSWORD_PEPPER` and an exact `ALLOWED_ORIGIN` as server secrets using the Supabase dashboard. Supabase provides the server-side URL and keys. Do not rotate the pepper for testing: existing credentials depend on it. Deploy only the two authentication Edge Functions to the explicit reference:

```powershell
npx supabase functions deploy username-login --project-ref $env:CLEAD_PROJECT_REF
npx supabase functions deploy change-password --project-ref $env:CLEAD_PROJECT_REF
```

These instructions do not deploy the frontend. Both functions use the repository's `verify_jwt=false` configuration; change-password verifies the user and approved application session inside its handler. Apply migrations 001 through 005 in order (and any subsequent reviewed migrations). Migration 004 adds a private fixture ownership ledger and service-only fixture RPCs. Do not expose these RPCs to browser roles.

## Sequential hosted authentication verification

```powershell
npm run test:hosted-safety
npm run test:integration:hosted
```

The runner validates the exact HTTPS project URL, explicit target match, acknowledgment, secret separation and required variables before any network mutation. It reserves a run UUID and a new Auth UUID in the database before creating the fictional account. A unique database index rejects overlapping runs, including runs from other operator terminals. All test mutations run sequentially. It verifies real username login, session restoration/refresh, raw-password bypass rejection, profile RLS, own-device revocation, onboarding, a password change with its security notification and lockout after five failures. It reads only the fictional account's records.

A `finally` block deactivates only that run's fictional profile, revokes its application sessions, verifies its Auth ownership marker and bans its Auth UUID. It then releases the active-run lock. No records, schemas, audits or Auth identities are deleted. The inactive fictional tombstone and its policy/preferences/notification records remain deliberately, preserving audit integrity and recovery evidence. Never reuse or promote this test account. Each later run creates a new fictional tombstone; only one active run is permitted.

If interrupted, retain the printed run UUID and retry cleanup with the same explicit environment:

```powershell
npm run test:integration:hosted -- --cleanup <printed-run-UUID>
```

Cleanup is idempotent and checks the ledger's project reference and Auth metadata before banning the identity. A failed cleanup keeps the active-run lock until recovery succeeds. It cannot accept an arbitrary student UUID. Do not manually delete the lock or its audit referents. If creation failed before Auth committed, cleanup can retire the reserved UUID after confirming Auth returns 404. A timeout during provisioning may require waiting for the in-flight request to settle before retrying cleanup.

Interrupted password-change recovery and broader role/Storage workflows remain integration coverage to add; the hosted runner is not a claim that all future domain workflows are verified.

## Checks without hosted credentials

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:hosted-safety
npm run build
npm run test:e2e -- --workers=2
npm run test:e2e:auth
npx --yes deno check supabase/functions/username-login/index.ts supabase/functions/change-password/index.ts supabase/functions/admin-accounts/index.ts
npx --yes deno test --allow-env supabase/functions/auth_test.ts
```

Playwright's loopback URLs serve the frontend test build only; they are never Supabase integration targets. The authentication browser suite uses intercepted requests in an isolated build and does not mutate a hosted project. Install Chromium with `npx playwright install chromium` if needed. Keep real service credentials out of browser test configuration.

## Account administration and first President

Milestone 5 requires migration 005 and the `admin-accounts` Edge Function, plus redeployment of both authentication functions. The updated username gateway checks a private credential fingerprint to reject superseded passwords even if an external Auth write arrives late.

```powershell
# Use the same explicitly matched pre-production environment and link checks above.
npx supabase functions deploy username-login --project-ref $env:CLEAD_PROJECT_REF
npx supabase functions deploy change-password --project-ref $env:CLEAD_PROJECT_REF
npx supabase functions deploy admin-accounts --project-ref $env:CLEAD_PROJECT_REF
```

For controlled first-President provisioning, create a private JSON file outside the repository with `auth_user_id` (a newly generated UUID, retained across retries), `full_name`, `username` and `student_number`. Do not import a roster. The initial password is the student number. Set the same explicit hosted variables above and the additional acknowledgment:

```powershell
$env:CLEAD_BOOTSTRAP_ACK = 'CREATE_FIRST_PRESIDENT'
npm run bootstrap:hosted -- C:\private\c-lead-first-president.json
```

The database reserves exactly one bootstrap identity before Auth creation. A retry must use the same file and UUID. Existing Auth identities require the matching bootstrap marker. A populated roster cannot be replaced; retired fictional integration tombstones are the only exception to the empty-roster prerequisite. No records are deleted on failure. Retain the input privately until provisioning succeeds; no credentials or private field values are printed. This controlled tool does not expose President assignment in the application.

President and Vice President can access account administration from Profile or Members. Imports require exact `full_name,username,student_number` headers, textual cells, at most 50 rows and a 2 MB input limit. Preview flags both rows of an internal duplicate and existing-roster collisions. Database constraints repeat authorization, reservation and duplicate checks. Valid rows are processed sequentially with durable operation UUIDs; retry a failed row or use the interrupted-creation list after a reload. Any active President/VP may recover an operation. Result CSVs omit student numbers and escape spreadsheet formulas. Only successful rows become accounts; partial success is displayed per row.

Account creation reserves private identity fields and capacity before Auth creation. Reservations remain recoverable after interruption and reserve their identities; historical usernames/numbers in the creation ledger are not reusable for a different creation. Active membership plus pending creations is capped at 50. Deactivated records retain history. Account edits require a reason; role/username changes revoke sessions. The President cannot be reassigned/deactivated through this UI, and administrators cannot remove their own administrative access.

Password resets use the current private student number, revoke all target sessions, clear lockout on completion, audit start/completion and generate a mandatory security notice. They also close an abandoned user password-change operation. Credential writes use a two-minute database lease and a 20-second request timeout; an interrupted write retains the lease until expiry. Wait two minutes before retrying an interrupted operation. Fingerprints prevent a stale external write from reviving an older password; if a late external write causes a sign-in failure, repeat the administrative reset to reconcile Auth. This distributed failure path still requires live hosted fault-injection verification. Do not rotate the server pepper as a recovery shortcut.

## Communication and private attachments

Milestone 6 adds migrations 006–007 and the `attachments` Edge Function. Apply additive migrations using the explicitly matched hosted target procedure above; do not reset the database. The existing private `attachments` bucket stays closed to direct browser access. When operator credentials become available:

```powershell
npx supabase functions deploy attachments --project-ref $env:CLEAD_PROJECT_REF
npx --yes deno check supabase/functions/attachments/index.ts
npx --yes deno test --allow-env supabase/functions/auth_test.ts supabase/functions/attachments_test.ts
```

The file handler verifies the authenticated, approved session and database parent permissions before Storage access. Downloads use 60-second signed links. Uploads accept at most five files per post, images up to 5 MB and documents up to 10 MB, with extension/MIME/signature checks and bounded Office ZIP inspection. No service-role key or private Storage credentials enter Vite. Files are removed before finalizing parent deletion; failed deletion stays hidden and retryable, retaining audit history. An in-progress upload can delay deletion for two minutes. Actual Storage/RLS, signed-link revocation timing, upload crash recovery and Realtime delivery still require hosted verification.

Feed scheduling/expiry uses database time. The archive includes expired announcements and archived academic terms. Scheduled notification dispatch belongs to Milestone 10; server-time feed visibility is independent of that dispatcher. Discussion edits require renewed approval, comments allow one reply level, and moderation requires a recorded reason. Mentions and immediate notifications honor saved category preferences. Group creation and membership controls are implemented in Milestone 7.

## Groups, polls, tasks and attendance

Apply migrations 008–012 additively in order on the explicitly matched pre-production project. Redeploy `attachments` after migration 011 so task attachments use task assignment authorization. Poll ballots remain private even to authenticated officers; named results are disclosed only when the configured visibility rule permits them. Anonymous aggregates do not contain voter identities. Poll configuration cannot be rewritten after votes have been collected.

Tasks snapshot active recipients when saved. Editing requires a reason and preserves historical assignments/completions. Their reminder offsets are stored for the Milestone 10 dispatcher; no scheduled delivery is claimed before that dispatcher is configured. Archived tasks retain read-only attachments. Group archival/removal retains membership history and audit records.

Attendance sessions can initially be created only within the last seven days, preventing backdated creation from bypassing approval rules. Students request corrections to their own records. Direct officer changes after seven days create pending requests without changing the attendance status; President/VP explicitly approve or reject with a reason. Pending corrections must be resolved before session archival. No real attendance or student data is used by automated tests.

## Calendar, reminders and Web Push

Migrations 014–015 implement the calendar, deduplicated reminder ledger and private push outbox. Apply them only through the matched hosted target procedure above. The dispatcher is not deployed or scheduled by the test suite.

Configure server secrets `CLEAD_SCHEDULER_SECRET` (a random secret of at least 32 characters), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (a contact mailto URL) in the Supabase dashboard. Only the public VAPID key belongs in `VITE_VAPID_PUBLIC_KEY`. Keep the private key, scheduler secret and service role out of Vite. Use a stable VAPID key pair. Without VAPID configuration, the dispatcher still delivers in-app reminders.

### Configure push on an existing hosted classroom (Windows)

This operational setup is separate from the fictional-account integration runner. Do not declare a classroom containing real members to be fictional-only pre-production, and do not reset it. From the repository root, use PowerShell 7 with Node and an authenticated Supabase CLI. Confirm the linked project matches both independently reviewed references:

```powershell
& ./scripts/configure-hosted-push.ps1 -ProjectRef '<actual-project-reference>' -ExpectedProjectRef '<independently-confirmed-project-reference>' -ContactEmail '<technical-contact-email>'
```

The script creates a stable P-256 VAPID key pair and scheduler credential, stores a Windows-user-encrypted recovery backup at `%LOCALAPPDATA%/C-LEAD/<project-reference>-push.dpapi`, verifies remote secret hashes, deploys only the dispatcher through API bundling (no Docker), and configures the named minute-by-minute Supabase Cron job using Vault. It refuses mismatched targets or existing keys that differ from the backup. Retain the backup; do not rotate keys casually. Its temporary plaintext files are removed in a finally block. Existing classroom records, schemas, accounts and audit records are retained.

Copy only `supabase/.temp/push-public-key.txt` into the Vercel Production environment variable `VITE_VAPID_PUBLIC_KEY` (Config type), then redeploy Production. The same public value can be used in the ignored local frontend environment. Never copy the DPAPI file, private VAPID key or scheduler credential to Vercel or frontend variables.

Verify the schedule without reading credentials or classroom content:

```powershell
npx --yes supabase db query --remote=<confirmed-project-reference> --read-only "select jobname, schedule, active from cron.job where jobname='clead-notification-dispatch'" --output json
npx --yes supabase db query --remote=<confirmed-project-reference> --read-only "select r.status, r.start_time from cron.job_run_details r join cron.job j using(jobid) where j.jobname='clead-notification-dispatch' order by r.start_time desc limit 3" --output json
```

A successful cron SQL run confirms dispatch was queued, not provider delivery. Confirm the dispatcher's HTTP response and then verify receipt on an opted-in device. In C-LEAD, open Notifications and select Enable push, then allow the browser prompt. For iPhone, use the installed Home Screen web app. Existing notifications are not retroactively pushed; new eligible events after registration are required. Authors do not receive notifications for their own actions. App-icon badge counts are not currently implemented.

The dispatcher processes jobs sequentially, validates provider endpoints, disallows redirects, checks preferences and approved sessions before claiming delivery, and sends generic lock-screen text. Jobs have expiring leases and bounded retries; permanent endpoint failures disable only the affected subscription. A provider acceptance followed by a lost acknowledgment may cause a retry; notification tags reduce duplicate display. Audit records and delivery metadata are retained. Real cron timing, provider delivery, permission prompts, iOS installed-PWA behavior and revoked-device races remain hosted/device verification gates.

### Android APK and native Firebase Cloud Messaging

The Android build uses Capacitor 8 with package ID `com.clead.sectionc`. Android Studio and the Android SDK are required to generate an APK. Capacitor is added to the existing Ionic Vue application; the normal web build and existing VAPID browser notifications remain separate. The Android build excludes the PWA service worker so native Capacitor plugins can initialize in its WebView.

1. Create an Android app in Firebase with package ID `com.clead.sectionc`. Enable Firebase Cloud Messaging and download `google-services.json` into `android/app/google-services.json`. Keep that file out of public hosting and check the generated `.gitignore` rules before committing.
2. Create a Firebase service account authorized to send FCM messages. Store the full JSON key as the Supabase Edge Function secret `FCM_SERVICE_ACCOUNT`. Never put it in `.env`, a `VITE_` variable, the Android project, GitHub, or a chat. The dispatcher exchanges it for a short-lived Google access token at runtime.
3. In Supabase Function secrets, set `ALLOWED_ORIGINS` to a comma-separated exact-origin list containing the existing C-LEAD website origin and the Capacitor 8 Android origin `https://localhost` (Capacitor 6 and later default Android to HTTPS). Include `http://localhost` only if `server.androidScheme` is explicitly set to `http`. Do not use `*`. The existing `ALLOWED_ORIGIN` remains as a backwards-compatible fallback until this allowlist is configured.
4. Apply `202611220001_native_push.sql` additively after migration 015. It adds private FCM tokens and session-scoped registration RPCs while preserving existing Web Push subscriptions. Do not reset the database.
5. Deploy the CORS-updated auth and file functions so the Android WebView origin is accepted, and deploy `dispatch-notifications` after adding `FCM_SERVICE_ACCOUNT`. These use API bundling and do not require Docker:

```powershell
$projectRef = '<confirmed-project-reference>'
npx supabase functions deploy username-login --project-ref $projectRef --use-api --yes
npx supabase functions deploy change-password --project-ref $projectRef --use-api --yes
npx supabase functions deploy admin-accounts --project-ref $projectRef --use-api --yes
npx supabase functions deploy attachments --project-ref $projectRef --use-api --yes
npx supabase functions deploy dispatch-notifications --project-ref $projectRef --use-api --yes
```

The existing `clead-notification-dispatch` Cron schedule continues to invoke the dispatcher; it claims web jobs and FCM jobs independently. 6. Build and sync the bundled Android assets, then open the native project in Android Studio:

```powershell
npm install
npm run sync:android
npm run open:android
```

In Android Studio, generate a signed APK using a protected signing key. For a local debug APK, use **Build → Build APK(s)**. On the installed app, open Notifications and enable push. Android 13+ will ask for notification permission. Verify delivery with the app foregrounded and backgrounded, and verify that tapping a push opens C-LEAD. The database stores only a device token in a private table; service-account credentials stay server-side. FCM access-token and device-delivery behavior still require real Firebase credentials and a physical Android-device test.

Use `npm run check:edge` and `npm run test:edge` for the complete credential-free Edge suite. The isolated `supabase/functions/deno.json` and lockfile avoid resolving frontend packages in Deno.

## Reports, search, offline records and problem reports

Migrations 016–017 add role-checked report snapshots/export audits, RLS-preserving search, aggregate officer analytics and rate-limited problem reports. They use existing tables and additive changes; no schema reset or roster import is needed. Reports are generated locally from an authorized server snapshot. PDF/Excel libraries load on demand. Exports contain no private student numbers, spreadsheet strings cannot execute formulas, and report requests retain audit metadata even if a browser download is interrupted.

Offline records are local read-only copies scoped to the previously approved account and device session. They expire within 24 hours, clear on logout, invalidation or account/session changes, and can be removed from the offline page. Only recent official announcements, the user's own assigned task content and their own attendance summary are eligible. Administrative rosters, contribution records, files, signed links, tokens and private numbers are not copied into this cache. The standard Supabase authentication session remains in its separate SDK storage. The offline page checks the local session identity before showing copies; it grants no server authorization. Revocations cannot be learned while disconnected, so copies are explicitly marked potentially outdated. Reconnection revalidates the actual session. No writes are queued.

Problem reports collect only an explicitly entered description, a sanitized route without query parameters, the app version, coarse browser/device type and server timestamp. The form warns against sensitive values; obvious credential/long-number patterns are rejected. Passwords, form snapshots, screenshots, full user agents and database records are never collected automatically. Reports are visible only to their author and President/VP, with audited resolution and a three-per-hour submission limit.

`npm run verify` runs formatting checks, lint, TypeScript, production build, PostgreSQL/unit tests, Edge checks/tests, hosted safety guards and both isolated browser suites sequentially. It never runs the hosted integration runner or deploys anything. See AUDIT.md for the implementation audit and remaining release gates.
