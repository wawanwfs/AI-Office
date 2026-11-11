// Siklus 417 — manifest.webmanifest konsisten: deskripsi PWA 26 agen.
//
// Siklus 416 membereskan meta og:/twitter: "15 agent" usang di index.html &
// melengkapi landing.html, tapi deskripsi manifest PWA (vite-plugin-pwa,
// vite.config.js) terlewat: masih "15 agent AI". Manifest dibaca browser saat
// install/daftar aplikasi, jadi teks usang itu tetap tampil di luar halaman.
//
// Kontrak yang digate:
//  1. vite.config.js tidak lagi memuat "15 agent" (angka agen usang).
//  2. Deskripsi manifest menyebut 26 agen, konsisten dgn meta HTML.
//  3. dist/manifest.webmanifest yang ter-deploy juga memuat "26 agen"
//     (guard build: kalau build lupa dijalankan, tes gagal).

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(here, '..', '..');

describe('siklus 417 — deskripsi manifest PWA konsisten 26 agen', () => {
  const viteCfg = readFileSync(join(ROOT, 'vite.config.js'), 'utf8');

  it('vite.config.js tidak memuat "15 agent" usang', () => {
    expect(viteCfg.includes('15 agent')).toBe(false);
    expect(viteCfg.includes('15 agen')).toBe(false);
  });

  it('deskripsi manifest menyebut 26 agen (konsisten dgn meta HTML)', () => {
    const m = viteCfg.match(/manifest:\s*\{[\s\S]*?description:\s*'([^']+)'/);
    expect(m, 'blok manifest + description harus ada').toBeTruthy();
    expect(m[1]).toContain('26 agen');
  });

  it('dist/manifest.webmanifest ter-deploy juga memuat 26 agen', () => {
    const dist = join(ROOT, 'dist', 'manifest.webmanifest');
    expect(existsSync(dist), 'dist/manifest.webmanifest ada (jalankan build)').toBe(true);
    const distManifest = readFileSync(dist, 'utf8');
    expect(distManifest).toContain('26 agen');
    expect(distManifest.includes('15 agent')).toBe(false);
  });
});
