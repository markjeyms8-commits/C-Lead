import { describe, it, expect } from 'vitest';
import { monthRange, manilaDay } from '../../src/schemas/calendar';
import { amountSchema } from '../../src/schemas/contributions';
describe('Manila calendar and contribution amounts', () => {
  it('uses Manila midnight across leap years', () => {
    expect(monthRange('2028-02')).toEqual({
      start: '2028-01-31T16:00:00.000Z',
      end: '2028-02-29T16:00:00.000Z',
    });
    expect(manilaDay('2026-11-13T17:00:00Z')).toBe('2026-11-14');
    expect(() => monthRange('2026-13')).toThrow();
  });
  it('rejects ambiguous or fractional-cent contribution amounts', () => {
    for (const v of ['0', '1.001', '-1', '1e3', 'NaN'])
      expect(amountSchema.safeParse(v).success).toBe(false);
    expect(amountSchema.safeParse('150.50').success).toBe(true);
  });
});
