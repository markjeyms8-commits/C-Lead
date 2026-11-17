# Deployment preparation

No deployment has been performed or authorized. Vercel build configuration is included for the future private GitHub repository.

1. Finish the product milestones and launch gates in the approved specification.
2. Obtain explicit authorization before creating/linking GitHub, Vercel or Supabase resources.
3. Review migrations and apply them with a trusted operator. The accepted shared dev/production Supabase project requires particular care: no destructive resets, synthetic seed writes or test cleanup against production records.
4. Configure Vercel Hobby: build `npm run build`, output `dist`, main branch production, free vercel.app domain, HTTPS. Every main push deploys production by the accepted policy; require passing CI and review before main changes.
5. Set actual frontend URL/key; never add the service-role key or password pepper to Vercel's client environment. Configure exact Supabase Auth origin/redirects and Edge `ALLOWED_ORIGIN`.
6. Deploy Edge Functions with server-only secrets and verify auth/RLS before enabling accounts.
7. Test SPA deep links, service worker updates (Update/Later), Android install, iPhone Safari Add to Home Screen, offline shell and accessibility.
8. Run the one-week pilot with all officers and five students across Android/iPhone before production launch.

The service worker is served without caching. Static hashed Vite assets are revisioned by precache. No backend runtime cache is configured. Site security headers include MIME sniffing protection and a referrer policy; finalize a tested CSP with the actual Supabase domain before launch.
