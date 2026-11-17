/** The only application variables Vite may expose to browser code. */
export const publicEnvironmentNames = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_VAPID_PUBLIC_KEY',
];

/** Build-time allowlist: Vite replaces import.meta.env with public values. */
export function assertPublicEnvironment(env: Record<string, string>) {
  const allowed = new Set(publicEnvironmentNames);
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_')) continue;
    // Vercel injects deployment metadata. envPrefix excludes it from the client.
    if (name.startsWith('VITE_VERCEL_')) continue;
    if (!allowed.has(name))
      throw new Error(`Unapproved public environment variable: ${name}`);
    if (value.startsWith('sb_secret_'))
      throw new Error(`Server credential rejected in ${name}`);
    const parts = value.split('.');
    if (parts.length !== 3) continue;
    let role: unknown;
    try {
      role = JSON.parse(
        atob(parts[1]!.replaceAll('-', '+').replaceAll('_', '/')),
      ).role;
    } catch {
      continue;
    }
    if (role !== undefined && role !== 'anon')
      throw new Error(`Non-public credential rejected in ${name}`);
  }
}
