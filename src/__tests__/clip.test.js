// Pemangkas teks di batas kata terakhir + '…' (src/lib/clip.js) — murni.
import { describe, it, expect } from 'vitest';
import { clip } from '../lib/clip.js';

describe('clip — input kosong/short-circuit', () => {
  it('string kosong / null / undefined → ""', () => {
    expect(clip('', 10)).toBe('');
    expect(clip(null, 10)).toBe('');
    expect(clip(undefined, 10)).toBe('');
  });
  it('panjang ≤ n → tidak diubah', () => {
    expect(clip('abc', 5)).toBe('abc');
    expect(clip('abcdefghij', 10)).toBe('abcdefghij');
  });
});

describe('clip — pemangkasan', () => {
  it('memotong di batas kata terakhir dalam n karakter + ellipsis', () => {
    // n=6: potongan "a b c " → spasi kata terakhir di idx 5 (> 60%×6) → "a b c…"
    expect(clip('a b c d e f g h i j k l', 6)).toBe('a b c…');
  });
  it('tanpa spasi dalam n karakter → potong tepat di n', () => {
    expect(clip('abcdefghijklmnop', 6)).toBe('abcdef…');
  });
  it('spasi terlalu dekat awal (< 60% n) tidak dipakai (hindari hasil super pendek)', () => {
    // satu spasi di idx 3 (≤ 6) → potong tepat di n = 10 karakter + '…'
    const r = clip('xyz abcdefghijklmnopqrstuv', 10);
    expect(r).toHaveLength(11);
    expect(r.endsWith('…')).toBe(true);
    expect(r.slice(0, -1)).toBe('xyz abcdef');
  });
  it('menghilangkan spasi sisa sebelum ellipsis (trimEnd)', () => {
    expect(clip('ab  cd  ef', 8)).toBe('ab  cd…');
  });
});
