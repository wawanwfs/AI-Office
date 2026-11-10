import { describe, it, expect } from 'vitest';
import { SKY_DIVISION } from '../lib/ui_palette';
import { readFileSync } from 'fs';

describe('siklus 402 — cyan divisi TaskBoard satu sumber', () => {
  it('nilai kanonik #38BDF8', () => {
    expect(SKY_DIVISION).toBe('#38BDF8');
  });

  it('tidak ada lagi literal #38BDF8 di TaskBoard', () => {
    const src = readFileSync(new URL('../components/TaskBoard.jsx', import.meta.url), 'utf8');
    expect(src.includes('#38BDF8')).toBe(false);
    expect(src.includes('SKY_DIVISION')).toBe(true);
  });

  it('ui_palette mengekspor SKY_DIVISION satu sumber', () => {
    const src = readFileSync(new URL('../lib/ui_palette.js', import.meta.url), 'utf8');
    expect(src).toMatch(/export const SKY_DIVISION = '#38BDF8'/);
  });
});
