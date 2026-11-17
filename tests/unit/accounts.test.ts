import { describe, it, expect } from 'vitest';
import {
  accountSchema,
  parseCsv,
  previewRoster,
} from '../../src/schemas/accounts';
const headers = ['full_name', 'username', 'student_number'];
describe('roster import', () => {
  it('handles BOM, quoted commas, escaped quotes, CRLF and leading zero numbers', () => {
    expect(
      parseCsv(
        '\uFEFFfull_name,username,student_number\r\n"Doe, ""Jo""",JO,00123',
      ),
    ).toEqual([headers, ['Doe, "Jo"', 'JO', '00123']]);
  });
  it('rejects malformed quotes', () => {
    for (const text of ['"unclosed', 'bad"quote,x,y', '"name"junk,x,y'])
      expect(() => parseCsv(text)).toThrow();
  });
  it('normalizes usernames and preserves textual numbers', () => {
    expect(
      accountSchema.parse({
        full_name: ' Test ',
        username: ' USER_ONE ',
        student_number: '00123',
      }),
    ).toEqual({
      full_name: 'Test',
      username: 'user_one',
      student_number: '00123',
    });
  });
  it('marks both duplicate rows and collisions with existing accounts', () => {
    const result = previewRoster(
      [
        headers,
        ['One', 'USER', '001'],
        ['Two', 'user', '002'],
        ['Three', 'other', '003'],
      ],
      [{ full_name: 'Existing', username: 'old', student_number: '003' }],
      () => 'test-operation',
    );
    expect(result[0]?.errors).toContain('duplicateUsername');
    expect(result[1]?.errors).toContain('duplicateUsername');
    expect(result[2]?.errors).toContain('duplicateNumber');
    expect(result.every((r) => r.status === 'invalid')).toBe(true);
  });
  it('rejects numeric Excel identifiers instead of silently losing zeros', () => {
    expect(
      previewRoster([headers, ['Test', 'test', 123]], [], () => 'op')[0]
        ?.errors,
    ).toContain('invalidRow');
  });
  it('requires exact headers and at most fifty rows', () => {
    expect(() =>
      previewRoster(
        [
          ['name', 'username', 'student_number'],
          ['Test', 'user', '123'],
        ],
        [],
      ),
    ).toThrow();
    expect(() =>
      previewRoster(
        [headers, ...Array.from({ length: 51 }, () => ['Test', 'user', '123'])],
        [],
      ),
    ).toThrow();
  });
});
