import { describe, it, expect } from 'vitest';
import { normalizeWage } from '../wage-normalizer.js';

describe('normalizeWage', () => {
  it('passes through hourly wages as integer cents', () => {
    const row = { Level1: '47.73', Level2: '74.99', Level3: '102.25', Level4: '129.51', Average: '102.53', Label: '' };
    const result = normalizeWage(row);
    expect(result).toEqual({ l1: 4773, l2: 7499, l3: 10225, l4: 12951, avg: 10253 });
  });

  it('converts annual wages to hourly cents', () => {
    const row = { Level1: '67600', Level2: '89000', Level3: '110000', Level4: '131000', Average: '99000', Label: 'Annual Wage' };
    const result = normalizeWage(row);
    expect(result.l1).toBe(Math.round(67600 / 2080 * 100));
    expect(result.avg).toBe(Math.round(99000 / 2080 * 100));
  });

  it('returns null levels for High Wage rows', () => {
    const row = { Level1: '', Level2: '', Level3: '', Level4: '', Average: '157.79', Label: 'High Wage' };
    const result = normalizeWage(row);
    expect(result.l1).toBeNull();
    expect(result.l2).toBeNull();
    expect(result.l3).toBeNull();
    expect(result.l4).toBeNull();
    expect(result.avg).toBe(15779);
  });

  it('returns null levels for No Leveled Wage rows', () => {
    const row = { Level1: '', Level2: '', Level3: '', Level4: '', Average: '45.00', Label: 'No Leveled Wage' };
    const result = normalizeWage(row);
    expect(result.l1).toBeNull();
    expect(result.avg).toBe(4500);
  });
});
