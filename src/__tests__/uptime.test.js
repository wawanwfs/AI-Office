// Formatter uptime host (src/lib/uptime.js) — murni, anti-poisoning.
import { describe, it, expect } from 'vitest';
import { fmtUptime } from '../lib/uptime.js';

describe('fmtUptime — nilai normal', () => {
  it('0 dtk → "0m"', () => {
    expect(fmtUptime(0)).toBe('0m');
  });
  it('< 60 dtk → "0m" (paritas lama)', () => {
    expect(fmtUptime(45)).toBe('0m');
  });
  it('60 dtk → "1m"', () => {
    expect(fmtUptime(60)).toBe('1m');
  });
  it('90 dtk → "1m"', () => {
    expect(fmtUptime(90)).toBe('1m');
  });
  it('3661 dtk → "1j 1m"', () => {
    expect(fmtUptime(3661)).toBe('1j 1m');
  });
  it('7200 dtk → "2j 0m"', () => {
    expect(fmtUptime(7200)).toBe('2j 0m');
  });
});

describe('fmtUptime — anti-poisoning', () => {
  it('undefined / null → "—"', () => {
    expect(fmtUptime(undefined)).toBe('—');
    expect(fmtUptime(null)).toBe('—');
  });
  it('NaN / ±Infinity → "—"', () => {
    expect(fmtUptime(NaN)).toBe('—');
    expect(fmtUptime(Infinity)).toBe('—');
    expect(fmtUptime(-Infinity)).toBe('—');
  });
  it('string kosong / teks non-angka → "—" (sebelumnya "NaNj NaNm")', () => {
    expect(fmtUptime('')).toBe('—');
    expect(fmtUptime('abc')).toBe('—');
  });
  it('numerik string dinormalisasi ("90" → "1m")', () => {
    expect(fmtUptime('90')).toBe('1m');
  });
});
