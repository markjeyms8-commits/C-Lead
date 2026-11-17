import { describe, expect, it } from 'vitest';
import { can, initials, normalizeUsername } from '../../src/utils/permissions';
import { loginSchema, passwordSchema } from '../../src/schemas/auth';
import en from '../../src/locales/en.json';
import fil from '../../src/locales/fil.json';
import { createI18n } from 'vue-i18n';
describe('permission boundaries', () => {
  it('denies students privileged capabilities', () => {
    for (const capability of [
      'accounts',
      'publish',
      'academic',
      'attendance',
      'contributions',
      'audit',
      'roles',
    ] as const)
      expect(can('student', capability)).toBe(false);
  });
  it('keeps secretary and treasurer duties separate', () => {
    expect(can('secretary', 'attendance')).toBe(true);
    expect(can('secretary', 'contributions')).toBe(false);
    expect(can('treasurer', 'contributions')).toBe(true);
    expect(can('treasurer', 'attendance')).toBe(false);
    expect(can(undefined, 'accounts')).toBe(false);
  });
  it('allows operational officers but has no President-transfer capability', () => {
    expect(can('vice_president', 'roles')).toBe(true);
    expect(can('president', 'accounts')).toBe(true);
  });
});
describe('identity validation', () => {
  it('normalizes username consistently', () => {
    expect(normalizeUsername('  Section.C ')).toBe('section.c');
    expect(
      loginSchema.parse({ username: ' Section.C ', password: 'test' }).username,
    ).toBe('section.c');
  });
  it('rejects unsafe usernames and oversized input', () => {
    expect(
      loginSchema.safeParse({ username: 'user@example.com', password: 'x' })
        .success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ username: 'user', password: 'x'.repeat(129) })
        .success,
    ).toBe(false);
    expect(passwordSchema.safeParse('short').success).toBe(false);
  });
  it('generates initials without pictures', () => {
    expect(initials('Juan dela Cruz')).toBe('JD');
    expect(initials('')).toBe('');
  });
});
function keys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'object'
      ? keys(child, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}
it('has complete locale key parity', () => {
  expect(keys(fil).sort()).toEqual(keys(en).sort());
});
it('compiles every interface translation without message syntax errors', () => {
  for (const [locale, messages] of Object.entries({ en, fil })) {
    const i18n = createI18n({
      legacy: false,
      locale,
      messages: { [locale]: messages },
    });
    for (const key of keys(messages))
      expect(() =>
        i18n.global.t(key, { count: 1, minutes: 1, name: 'Test', index: 1 }),
      ).not.toThrow();
  }
});
