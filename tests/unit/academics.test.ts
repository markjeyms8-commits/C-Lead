import { describe, it, expect } from 'vitest';
import { academicPayload } from '../../src/schemas/academics';
const input = {
  name: '  Year 2026  ',
  starts_on: '2026-06-01',
  ends_on: '2027-04-01',
  code: '',
  parent: '',
};
describe('academic form validation', () => {
  it('normalizes names and excludes unrelated fields', () => {
    expect(academicPayload('academic_years', input)).toEqual({
      name: 'Year 2026',
      starts_on: input.starts_on,
      ends_on: input.ends_on,
    });
  });
  it('rejects invalid calendar dates and reversed periods', () => {
    expect(() =>
      academicPayload('academic_years', { ...input, starts_on: '2026-02-30' }),
    ).toThrow();
    expect(() =>
      academicPayload('academic_years', { ...input, ends_on: input.starts_on }),
    ).toThrow();
  });
  it('requires valid parent IDs and subject codes', () => {
    expect(() => academicPayload('semesters', input)).toThrow();
    expect(() =>
      academicPayload('subjects', {
        ...input,
        parent: '00000000-0000-4000-a000-000000000001',
      }),
    ).toThrow();
    expect(
      academicPayload('subjects', {
        ...input,
        code: ' ENG ',
        parent: '00000000-0000-4000-a000-000000000001',
      }),
    ).toEqual({
      name: 'Year 2026',
      code: 'ENG',
      semester_id: '00000000-0000-4000-a000-000000000001',
    });
  });
});
