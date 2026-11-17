import { URL } from 'node:url';
export function hostedConfiguration(env) {
  const required = [
    'CLEAD_PROJECT_REF',
    'CLEAD_TEST_TARGET_REF',
    'CLEAD_HOSTED_URL',
    'CLEAD_SERVICE_ROLE_KEY',
    'CLEAD_ANON_KEY',
    'CLEAD_LOGIN_PASSWORD_PEPPER',
  ];
  if (required.some((key) => !env[key]))
    throw new Error('Missing explicit hosted test environment variables.');
  const ref = env.CLEAD_PROJECT_REF;
  const url = new URL(env.CLEAD_HOSTED_URL);
  if (
    !/^[a-z]{20}$/.test(ref) ||
    ref !== env.CLEAD_TEST_TARGET_REF ||
    url.href !== `https://${ref}.supabase.co/` ||
    env.CLEAD_TEST_ACK !== 'FICTIONAL_ONLY_PREPRODUCTION' ||
    env.CLEAD_LOGIN_PASSWORD_PEPPER.length < 32
  )
    throw new Error('Hosted test target safety check failed.');
  if (
    Object.entries(env).some(
      ([key, value]) =>
        key.startsWith('VITE_') &&
        value &&
        (value === env.CLEAD_SERVICE_ROLE_KEY ||
          value === env.CLEAD_LOGIN_PASSWORD_PEPPER),
    )
  )
    throw new Error('Server secret found in Vite environment.');
  return {
    ref,
    url: url.origin,
    serviceKey: env.CLEAD_SERVICE_ROLE_KEY,
    anonKey: env.CLEAD_ANON_KEY,
    pepper: env.CLEAD_LOGIN_PASSWORD_PEPPER,
  };
}
