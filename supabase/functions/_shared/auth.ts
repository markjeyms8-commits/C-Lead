import { createClient } from 'npm:@supabase/supabase-js@2';
export const service = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
      },
    },
  );
export const publicClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
export function cors(request: Request): HeadersInit {
  const origin = request.headers.get('origin');
  const allowed = (
    Deno.env.get('ALLOWED_ORIGINS') ??
    Deno.env.get('ALLOWED_ORIGIN') ??
    ''
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    ...(origin && allowed.includes(origin)
      ? { 'Access-Control-Allow-Origin': origin }
      : {}),
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-clead-action, x-clead-parent, x-clead-parent-type, x-clead-filename',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
}
export function response(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors(request) });
}
export function preflight(request: Request, maxBytes = 4096) {
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: cors(request) });
  if (request.method !== 'POST')
    return response(request, { error: 'Method not allowed' }, 405);
  const origin = request.headers.get('origin');
  const allowed = (
    Deno.env.get('ALLOWED_ORIGINS') ??
    Deno.env.get('ALLOWED_ORIGIN') ??
    ''
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origin && !allowed.includes(origin))
    return response(request, { error: 'Origin not allowed' }, 403);
  if (Number(request.headers.get('content-length') || 0) > maxBytes)
    return response(request, { error: 'Request too large' }, 413);
  return null;
}
export async function passwordDigest(password: string) {
  const pepper = Deno.env.get('LOGIN_PASSWORD_PEPPER');
  if (!pepper || pepper.length < 32)
    throw new Error('Missing server password pepper');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(password),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function readBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 4096) {
      await reader.cancel();
      throw new Error('Request too large');
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(buffer));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Invalid body');
  return parsed as Record<string, unknown>;
}
export async function credentialFingerprint(digest: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(digest),
  );
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
