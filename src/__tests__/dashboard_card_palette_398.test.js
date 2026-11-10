import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { VIOLET_CARD, PALE_BLUE_CARD } from '../lib/ui_palette.js';

const dash = readFileSync(new URL('../components/Dashboard.jsx', import.meta.url), 'utf8');

describe('siklus 398 — warna kartu Dashboard satu sumber', () => {
  it('tidak ada literal hex kartu tersisa di Dashboard', () => {
    expect(dash).not.toMatch(/#8B5CF6/i);
    expect(dash).not.toMatch(/#ADDBF2/i);
  });

  it('konstanta palet bernilai kanonik', () => {
    expect(VIOLET_CARD).toBe('#8B5CF6');
    expect(PALE_BLUE_CARD).toBe('#ADDBF2');
    expect(dash).toContain('VIOLET_CARD');
    expect(dash).toContain('PALE_BLUE_CARD');
  });
});
