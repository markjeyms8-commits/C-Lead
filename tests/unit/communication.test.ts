import { describe, it, expect } from 'vitest';
import { richTextSchema, safeLink } from '../../src/schemas/communication';
describe('structured rich text', () => {
  it('allows escaped text and limited formatting only', () => {
    expect(
      richTextSchema.safeParse([
        {
          type: 'paragraph',
          text: '<script>alert(1)</script>',
          bold: true,
          url: 'https://example.com',
        },
      ]).success,
    ).toBe(true);
    expect(
      richTextSchema.safeParse([{ type: 'iframe', text: 'bad' }]).success,
    ).toBe(false);
    expect(
      richTextSchema.safeParse([
        { type: 'paragraph', text: 'safe', html: '<img onerror=bad>' },
      ]).success,
    ).toBe(false);
  });
  it('rejects unsafe and malformed links without throwing', () => {
    for (const link of [
      'javascript:alert(1)',
      'data:text/html,bad',
      'https://',
      'https://user:password@example.com',
      'https://example.com/"bad',
    ]) {
      expect(safeLink(link)).toBeUndefined();
    }
    expect(safeLink('https://example.com/safe')).toBe(
      'https://example.com/safe',
    );
  });
});
