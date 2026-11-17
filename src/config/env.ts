import { z } from 'zod';
const schema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
});
const result = schema.safeParse(import.meta.env);
export const backendConfigured = result.success;
export const backendEnv = result.success ? result.data : null;
