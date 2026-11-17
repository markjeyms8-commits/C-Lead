import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
export async function database() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  for (const name of readdirSync('supabase/migrations')
    .filter((n) => n.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${name}`, 'utf8'));
  return db;
}
export const userId = (n: number) =>
  `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
export const sessionId = (n: number) =>
  `10000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
export async function seed(db: PGlite, n: number, role: string) {
  await db.exec(
    `insert into auth.users values('${userId(n)}');insert into public.profiles(id,full_name,username,role)values('${userId(n)}','Fictional User ${n}','fictional_${n}','${role}');insert into private.identities(user_id,internal_email,student_number)values('${userId(n)}','${n}@identity.c-lead.invalid','TEST-${n}');insert into auth.sessions values('${sessionId(n)}','${userId(n)}');insert into public.app_sessions(id,user_id)values('${sessionId(n)}','${userId(n)}');`,
  );
}
export async function asUser(db: PGlite, n: number, sql: string) {
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claims','${JSON.stringify({ sub: userId(n), session_id: sessionId(n) })}',false);`,
  );
  try {
    const results = await db.exec(sql);
    return { rows: (results.at(-1)?.rows ?? []) as Record<string, unknown>[] };
  } finally {
    await db.exec(
      `reset role;select set_config('request.jwt.claims','{}',false);`,
    );
  }
}
