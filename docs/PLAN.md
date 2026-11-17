# Implementation plan

Follow the approved milestone order; keep unfinished features visible in BUILD_STATUS.md.

1. **This run:** inspect; scaffold the locked stack; establish design tokens, shell, shared state and route foundations; document database relationships and permissions; implement initial migrations/RLS; implement credential-independent auth/onboarding; verify locally.
2. **Weeks 2–3:** finish Supabase Auth integration, controlled first-account bootstrap, audited account import/administration, academic management and real-session adversarial tests.
3. **Weeks 3–4:** announcement/discussion workflows, moderation, limited rich text, private attachments, reactions/comments/mentions and Realtime.
4. **Weeks 4–5:** polls, assignment targeting, deadline enforcement, subject groups and overrides.
5. **Weeks 5–6:** private attendance history, seven-day edit/approval workflow, corrections and contributions with Paid/Unpaid only.
6. **Weeks 6–7:** calendar, durable reminder jobs, category preferences and VAPID Web Push.
7. **Weeks 7–8:** authorized PDF/Excel reports, export auditing, search, internal analytics and account-scoped read-only offline records.
8. **Weeks 8–10:** complete workflow tests, accessibility/localization/performance pass and one-week pilot with all officers plus five students across Android and iPhone.

Every milestone ends with format/lint/typecheck/build and meaningful tests. No deployment or external resource creation occurs without explicit authorization. Launch requires the specification's privacy, account-import/reset, notification, installation and report-export gates to pass.
