import { describe, it, expect } from 'vitest';
import { LOOKS, looksOf, FALLBACK } from '../scene/parts/character_looks.js';

describe('LOOKS data', () => {
  it('memuat 15 karakter', () => {
    expect(Object.keys(LOOKS).length).toBe(15);
  });
  const names = ['BANTUIN AI','BUDI','RIZKY','DEWI','ANDI','YOGA','MAYA','TONI','RINA','LINA','SARI','WAHYU FS','TRAINER AI','INTEGRATOR BOT','SUPPORT'];
  it('nama kunci sesuai daftar historis', () => {
    expect(Object.keys(LOOKS).sort()).toEqual([...names].sort());
  });
  it.each(names)('%s: field lengkap & valid', (n) => {
    const L = LOOKS[n];
    expect(Number.isFinite(L.skin)).toBe(true);
    expect(L.h).toBeGreaterThan(0.9);
    expect(L.h).toBeLessThan(1.2);
    expect(Array.isArray(L.acc)).toBe(true);
  });
  it('aksesori unik per karakter (tanpa duplikat)', () => {
    for (const L of Object.values(LOOKS)) {
      expect(new Set(L.acc).size).toBe(L.acc.length);
    }
  });
  it('aksesori dari kosakata yang dikenal addAccessories', () => {
    const vocab = ['glasses','beard','headphones','hijab','cap','bun','beanie','ponytail','visor','antenna','blazer','tie','peci'];
    for (const L of Object.values(LOOKS)) {
      for (const a of L.acc) expect(vocab).toContain(a);
    }
  });
  it('BANTUIN AI robot: visor+antenna, kulit abu', () => {
    const L = LOOKS['BANTUIN AI'];
    expect(L.acc).toEqual(['visor','antenna']);
    expect(L.skin).toBe(0xCFD8DC);
  });
  it('WAHYU FS pakai tie+peci', () => {
    expect(LOOKS['WAHYU FS'].acc).toEqual(['tie','peci']);
  });
  it('TRAINER AI / INTEGRATOR BOT / SUPPORT punya identitas visual sendiri', () => {
    expect(LOOKS['TRAINER AI'].acc).toEqual(['visor','headphones']);
    expect(LOOKS['INTEGRATOR BOT'].acc).toEqual(['antenna']);
    expect(LOOKS['SUPPORT'].acc).toEqual(['blazer']);
    const ids = new Set(['TRAINER AI','INTEGRATOR BOT','SUPPORT'].map(n => JSON.stringify(LOOKS[n])));
    expect(ids.size).toBe(3);
  });
  it('DEWI & RINA memakai hijab', () => {
    expect(LOOKS['DEWI'].acc).toContain('hijab');
    expect(LOOKS['RINA'].acc).toContain('hijab');
  });
  it('kulit dalam rentang warna manusia-ish (0x000000-0xFFFFFF)', () => {
    for (const L of Object.values(LOOKS)) {
      expect(L.skin).toBeGreaterThanOrEqual(0);
      expect(L.skin).toBeLessThanOrEqual(0xFFFFFF);
    }
  });
});

describe('looksOf', () => {
  it('lookup case-insensitive', () => {
    expect(looksOf({name:'budi'})).toEqual({...LOOKS['BUDI'],acc:[...LOOKS['BUDI'].acc]});
    expect(looksOf({name:'Wahyu FS'})).toEqual({...LOOKS['WAHYU FS'],acc:[...LOOKS['WAHYU FS'].acc]});
  });
  it('fallback untuk nama tak dikenal', () => {
    const L = looksOf({name:'ORANG ASING'});
    expect(L).toEqual({skin:FALLBACK.skin,h:FALLBACK.h,acc:[...FALLBACK.acc]});
    expect(L).toEqual({skin:0xE8B88A,h:1,acc:[]});
  });
  it('fallback jika name hilang / undefined', () => {
    expect(looksOf({}).acc).toEqual([]);
    expect(looksOf(undefined).acc).toEqual([]);
    expect(looksOf(null).h).toBe(1);
  });
  it('fallback tidak membagi referensi acc (mutasi aman)', () => {
    looksOf({name:'X'}).acc.push('glasses');
    expect(looksOf({name:'Y'}).acc).toEqual([]);
  });
});
