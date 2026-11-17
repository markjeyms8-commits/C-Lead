# C-LEAD

**Lahat ng ganap, nandito na.** C-LEAD (pronounced “Silid”) is Section C's classroom and student leadership PWA. The application includes authentication/onboarding, audited account administration and CSV/XLSX imports, academic management, communication and private files, polls/groups/tasks, attendance/contributions, calendar/reminders, notifications, reports/search/analytics, read-only offline records and problem reporting. Credential-free verification is tracked in BUILD_STATUS.md. Live hosted integration and the real-device pilot remain required; this is not a production-launch approval.

## Stack

Ionic Vue, Vue 3 Composition API, strict TypeScript, Vite, Pinia, Ionic Router, SCSS, VeeValidate + Zod, Vue I18n, Supabase Auth/PostgreSQL/Storage/Realtime/Edge Functions, standard Web Push, Vite PWA, Playwright. Client report libraries are jsPDF, read-excel-file and write-excel-file. No native runtime or separate backend server.

## Local development

```powershell
npm ci
npm run dev
```

Without environment variables, an explicitly labeled foundation preview is available. Login and privileged routes fail closed. To connect the hosted pre-production Supabase project, follow [SETUP](docs/SETUP.md). Never place service-role or VAPID private keys in Vite variables.

```powershell
npm run verify
```

`npm run format` formats source; `npm run preview` serves the production build. Browser binaries are installed separately with `npx playwright install chromium`.

`test:e2e:auth` is a separate browser contract suite with isolated API fixtures. It never changes production configuration. For hosted verification, `test:integration:hosted` creates and retires one fictional account using explicit project matching and a database run lock. See SETUP.md for environment variables, additive migrations and recovery cleanup. No Docker or database reset is used.

## Documentation

- [Build status and remaining milestones](docs/BUILD_STATUS.md)
- [Architecture, ERD and table inventory](docs/ARCHITECTURE.md)
- [Permission matrix](docs/PERMISSIONS.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Setup](docs/SETUP.md), [deployment](docs/DEPLOYMENT.md), [security](docs/SECURITY.md), [testing](docs/TESTING.md)
- [Complete approved specification](docs/SPECIFICATION.txt)

No Supabase project, Vercel deployment or GitHub repository is created by this build. External credentials and explicit deployment authorization are required. Ci is an original replaceable SVG component, not final mascot artwork.
