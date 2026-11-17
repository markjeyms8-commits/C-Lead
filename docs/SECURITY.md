# Security foundation and release gates

## Implemented boundaries

- Service-role credentials are confined to Edge Functions and the explicit local operator bootstrap command. `.env.example` has empty public configuration only.
- Username normalization is identical in Zod, the Edge Function and database checks. A private random internal email resolves from the normalized username; there is no public signup.
- HMAC-SHA256 with a stable server-only pepper transforms the submitted password before Auth verification. Direct public Auth password login cannot use the visible password. This is in addition to Supabase's password hashing, not a replacement for it.
- A database lease serializes each username's login attempts. Attempts reserve a failure before contacting Auth. The fifth failed attempt locks for 15 minutes. Successful login clears the counter. Unknown usernames follow the same path with an unresolvable random identity. Errors never disclose account existence.
- Auth sessions must also be registered in `app_sessions`. RLS checks active profile, unrevoked application session, and the corresponding Auth session. Revocation blocks existing JWTs immediately for database reads. Private Storage has no client grants yet.
- Students cannot modify roles, account status, policy acceptance versions or audit rows. Sensitive numbers are isolated in a private schema. Audits never receive passwords, tokens or private identity rows.
- Static-only PWA caching. No backend response caching, offline write queues, or third-party analytics.

## Before production

Review additive migrations for the explicitly approved hosted pre-production project and run all credential-free RLS adversarial tests. Use the guarded fictional-account runner in SETUP.md for real hosted Auth verification. Hosted mutations must run sequentially. Additional coverage remains for five failures, lease expiry, success reset, wrong origins and interrupted-operation recovery. Test HMAC password provisioning and password changes end-to-end. Never lose or casually rotate the pepper: existing passwords depend on it; rotation requires a planned reset.

The password-change Auth update spans APIs and cannot be one PostgreSQL transaction. The new protocol audits intent, revokes other devices, and advances a credential generation before the Auth request. Login approval rejects old generations and pending changes. Completion atomically records the success audit and mandatory security notice. A failure after Auth updates can still return an error despite a changed password; retrying from the initiating session resumes the operation. Do not sign out of that session until the retry succeeds. An abandoned operation requires an audited administrative reset (milestone 5). Real GoTrue failure/recovery integration tests remain a launch gate. No account administration/reset UI is declared complete.

Add IP-level abuse protection and bounded cleanup of unknown-username login-attempt rows before public exposure; the account lockout is implemented but does not constitute global denial-of-service protection. No raw credentials or request bodies may be logged. Edge function input streams should be bounded at the gateway as well as in code.

Later release gates: rich-text schema validation and sanitization, attachment signature/extension/MIME checks and per-parent authorization, attendance privacy and seven-day approval logic, contribution privacy, anonymous ballots, privileged export auditing, signed-link access and VAPID delivery honoring the saved notification preferences. Test account revocation against Storage and Realtime when those integrations are enabled.

Privacy Notice is a draft. The institution must supply controller/contact/legal basis before collecting real student data. Accepted risks are recorded in DECISIONS.md. Do not deploy this foundation as a finished production system.

## Dependency review (November 13, 2026)

Production dependency audit: zero findings after upgrading to patched Zod 4 and removing its older adapter. VeeValidate uses field validators backed by Zod. Patched minimatch/glob overrides remove the high/moderate audit chain; lint/build tests verify compatibility.

The complete development tree retains four low-severity entries for a single upstream issue in deepmerge 4.3.1, inherited through Workbox's Rollup resolver. [The advisory reports no patched release](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). It is a build-time dependency consuming project configuration, not classroom data, and is absent from production dependencies. Do not feed untrusted configuration into the build; track the upstream patch before launch. No downgrade is used to conceal the advisory.
