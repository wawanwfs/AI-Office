import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import path from 'path';
import { idDateLong } from '../lib/format_time.js';
import { formatSimpleDate, formatTaskDate } from '../lib/kanban_date.js';

const kd = fs.readFileSync(path.resolve(__dirname, '../lib/kanban_date.js'), 'utf8');

describe('siklus 359 — tanggal ID panjang satu sumber', () => {
  it('salinan manual getMonth + nama bulan hilang di kanban_date (pakai idDateLong)', () => {
    const inline = kd.match(/months\[[a-zA-Z]+\.getMonth\(\)\]\s*\+?\s*['"`]?\s*\$\{/g) || [];
    const body = kd.slice(kd.indexOf('export function formatSimpleDate'));
    expect((inline.length) - (body.match(/MONTH_NAMES_ID\[[a-zA-Z]+\.getMonth\(\)\]/g) || []).length).toBeLessThanOrEqual(2);
    expect(kd).toMatch(/idDateLong\(/);
  });

  it('idDateLong paritas format D MMM YYYY', () => {
    const d = new Date(2026, 9, 26, 8, 0);
    expect(idDateLong(d)).toBe('26 Okt 2026');
  });

  it('idDateLong anti-poisoning: Date rusak / bukan Date → null', () => {
    expect(idDateLong(new Date(NaN))).toBeNull();
    expect(idDateLong(null)).toBeNull();
    expect(idDateLong('2026-01-01')).toBeNull();
    expect(idDateLong(12345)).toBeNull();
  });

  it('formatSimpleDate tetap benar & aman untuk racun', () => {
    expect(formatSimpleDate(new Date(2026, 9, 26).getTime())).toBe('26 Okt 2026');
    expect(formatSimpleDate(null)).toBe('');
    expect(formatSimpleDate(0)).toBe('');
  });

  it('formatTaskDate tahun lain pakai tanggal panjang utuh', () => {
    const ts = new Date(2024, 2, 5, 9, 30).getTime();
    const now = new Date(2026, 9, 26, 10, 0).getTime();
    expect(formatTaskDate({ created_at: ts }, { now })).toMatch(/^5 Mar 2024, 09:30$/);
  });
});
