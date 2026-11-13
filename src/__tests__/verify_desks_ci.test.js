// Siklus 480 — guard CI: verifikasi layout meja wajib dijalankan di CI.
//
// scripts/verify_desks.mjs sudah ada sejak lama dan menjadi satu-satunya
// pemeriksa numerik layout 3D (meja di dalam dinding kampus 34x27, bukan di
// atas obstacle/reception/server-room, elevasi finite, tanpa tabrakan antar
// meja < 1.8m). Tapi sebelum siklus ini skrip itu TIDAK PERNAH dijalankan
// otomatis: tidak ada di package.json scripts dan tidak ada di CI — hanya
// dijalankan manual sesekali. Kalau seseorang menaruh meja di dalam dinding
// atau menimpa obstacle, CI tetap hijau.
//
// Kontrak yang digate:
//  1. package.json memuat script "verify:desks" -> node scripts/verify_desks.mjs
//  2. workflow CI (.github/workflows/ci.yml) menjalankan "npm run verify:desks"
//  3. skrip layout sendiri tetap hijau saat dijalankan sekarang (26 meja,
//     ALL_DESKS_OK) — guard build/scene hidup, bukan cuma teks.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(here, '..', '..');

describe('siklus 480 — verify_desks wajib di CI', () => {
  it('package.json memuat script verify:desks', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['verify:desks']).toBe('node scripts/verify_desks.mjs');
  });

  it('workflow CI menjalankan npm run verify:desks', () => {
    const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    expect(ci.includes('npm run verify:desks')).toBe(true);
  });

  it('verify_desks.mjs lulus saat dijalankan (26 meja, ALL_DESKS_OK)', () => {
    const out = execFileSync('node', [join(ROOT, 'scripts', 'verify_desks.mjs')], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(out).toContain('TOTAL DESKS: 26');
    expect(out).toContain('OUT_OF_ROOM: NONE');
    expect(out).toContain('COLLISIONS: NONE');
    expect(out).toContain('ALL_DESKS_OK');
  });
});
