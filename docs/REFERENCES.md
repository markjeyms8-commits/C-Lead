# Implementation references

Reviewed November 13, 2026. Dependency versions are locked in package-lock.json.

- [Ionic Vue overview](https://ionicframework.com/docs/vue/overview): Ionic Vue 9 supports Vue 3.5+.
- [Supabase sessions](https://supabase.com/docs/guides/auth/sessions) and [sign out](https://supabase.com/docs/reference/javascript/auth-signout): JWT expiry is distinct from refresh-token revocation. C-LEAD additionally checks approved application sessions in RLS.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): user-editable metadata is unsuitable as an authorization source.
- [Vite PWA injectManifest](https://github.com/vite-pwa/vite-plugin-pwa/blob/main/docs/guide/inject-manifest.md): custom service-worker precaching and notification handlers.
- [read-excel-file](https://github.com/catamphetamine/read-excel-file): browser parsing with schema support.
- [write-excel-file changelog](https://github.com/catamphetamine/write-excel-file/blob/master/CHANGELOG.md): maintained browser/universal XLSX exports.
- [jsPDF](https://github.com/parallax/jsPDF): client-side PDF generation.

- [Web Push library](https://github.com/web-push-libs/web-push): encrypted standard Web Push request generation and VAPID credentials; requests use bounded fetch timeouts and reject redirects. The server-only dependency is pinned in the isolated Deno lockfile.
