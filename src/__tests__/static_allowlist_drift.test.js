// Siklus 214 — Static allowlist wfs_hq_server (anti source-disclosure :9503).
//
// Temuan live siklus 214: web root produksi ~/wfs-hq (0.0.0.0:9503) berisi file
// NON-aset yang SEMUA tersaji publik via _serve_static (SimpleHTTPRequestHandler):
//   - server.py / database.py / api_service.py  → source code disclosure
//   - .wfs_ui_token                             → token UI ASLI (GET 200 size 32)
//   - tasks.db / wfs_software_house.db          → file database (0-byte, tapi tetap)
//   - backups/server.py.bak-*                   → backup source code
//   - 20 PNG artefak screenshot (±10MB)         → sampah publik
//   - listing direktori /backups/               → 200 (SimpleHTTPRequestHandler)
// Fix: _serve_static default-TOLAK via _static_allowed(rel) + STATIC_ALLOW_DIRS
// (assets, fonts) + STATIC_ALLOW_FILES (12 jalur dist/ eksak).
//
// Kontrak yang digate:
//  1. Konstanta allowlist ada + berisi jalur dist/ eksak (PWA shell, workbox,
//     ikon PWA, logo) — TANPA file non-aset (*.py, *.db, *.bak, token, PNG liar).
//  2. _serve_static memanggil _static_allowed sebelum isfile (default-tolak:
//     request tanpa allowlist TIDAK pernah membaca file).
//  3. Guard traversal: rel '..'/'.' → False sebelum _static_allowed.
//  4. Logika _static_allowed diuji LANGSUNG (node re-implement konsisten dgn
//     Python diuji pytest; di sini kontrak isi konstanta + urutan guard).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(here, '..', '..');
const SRC = join(ROOT, 'backend_live', 'wfs_hq_server.py');
const src = readFileSync(SRC, 'utf8');

const ALLOW_DIRS_BLOCK = src.match(/STATIC_ALLOW_DIRS = frozenset\(\(([^)]*)\)\)/);
const ALLOW_FILES_BLOCK = src.match(/STATIC_ALLOW_FILES = frozenset\(\(([\s\S]*?)\)\)/);

describe('siklus 214 — konstanta allowlist statis', () => {
  it('STATIC_ALLOW_DIRS ada & persis assets+fonts', () => {
    expect(ALLOW_DIRS_BLOCK, 'STATIC_ALLOW_DIRS harus ada').toBeTruthy();
    const items = ALLOW_DIRS_BLOCK[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
    expect(items.sort()).toEqual(['assets', 'fonts']);
  });

  it('STATIC_ALLOW_FILES ada & memuat 12 jalur dist/ eksak', () => {
    expect(ALLOW_FILES_BLOCK, 'STATIC_ALLOW_FILES harus ada').toBeTruthy();
    const items = ALLOW_FILES_BLOCK[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
    for (const f of [
      'index.html', 'landing.html', 'manifest.webmanifest',
      'sw.js', 'registerSW.js', 'workbox-2fbc6a65.js',
      'favicon.svg', 'wfs-logo.svg',
      'og-image.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
    ]) expect(items).toContain(f);
    expect(items.length).toBe(12);
  });

  it('allowlist TIDAK memuat file non-aset (py/db/bak/token/screenshot)', () => {
    const block = ALLOW_FILES_BLOCK[0] + (ALLOW_DIRS_BLOCK?.[0] ?? '');
    for (const banned of ['.py', '.db', '.bak', 'wfs_ui_token', 'office_', 'test_x11', 'live_window', 'test_webgl']) {
      expect(block.includes(banned), `allowlist memuat terlarang: ${banned}`).toBe(false);
    }
  });
});

describe('siklus 214 — guard default-tolak (satu gerbang _allowed_rel)', () => {
  it('_allowed_rel menghitung rel + menolak traversal sebelum penyajian', () => {
    expect(src).toMatch(/^ {4}def _allowed_rel\(self\):/m);
    const body = src.slice(src.indexOf('def _allowed_rel'), src.indexOf('def _serve_static'));
    expect(body).toContain('os.path.relpath');
    expect(body).toContain('..');
    expect(body).toContain('_static_allowed(rel)');
  });

  it('_serve_static memakai gerbang _allowed_rel (default-tolak sebelum isfile)', () => {
    const body = src.slice(src.indexOf('def _serve_static'), src.indexOf('def log_message'));
    expect(body).toContain('_allowed_rel()');
    expect(body.indexOf('_allowed_rel()')).toBeLessThan(body.indexOf('os.path.isfile'));
  });

  it('fallback super().do_GET() JUGA kena gerbang (sumber disclosure sebenarnya)', () => {
    const body = src.slice(src.indexOf('def do_GET'), src.indexOf('def do_HEAD'));
    expect(body).toContain('if self._allowed_rel() is not None:');
    expect(body).toContain('super().do_GET()');
    expect(body).toContain('send_response(404)');
  });

  it('do_HEAD override — metadata file non-allowlist tidak tersaji', () => {
    const body = src.slice(src.indexOf('def do_HEAD'), src.indexOf('def do_DELETE'));
    expect(body).toContain('if self._allowed_rel() is not None:');
    expect(body).toContain('super().do_HEAD()');
    expect(body).toContain('send_response(404)');
  });

  it('fallback return False tetap utk file tak-ada (jalur super().do_GET utuh)', () => {
    const body = src.slice(src.indexOf('def _serve_static'), src.indexOf('def log_message'));
    expect(body.trim().endsWith('return False') || body.includes('return False')).toBe(true);
  });

  it('def _static_allowed didefinisikan level modul (bukan nested)', () => {
    expect(src).toMatch(/^def _static_allowed\(rel\):/m);
  });
});

describe('siklus 214 — dokumentasi & SOP di sumber', () => {
  it('alasan disclosure terdokumentasi di header sumber', () => {
    expect(src).toContain('Siklus 214');
    expect(src).toContain('source-disclosure');
    expect(src).toContain('.wfs_ui_token');
  });

  it('apply script smoke 12 poin (212 + 222 + 223 + 224 + 225: CORS/HEAD/aset/proxy/api/gw/project) — siklus ini menambah cakupan via pytest+vitest+smoke, bukan mem-bypass smoke', () => {
    const a = readFileSync(join(ROOT, 'scripts', 'apply_wfs_hq_server.py'), 'utf8');
    expect(a).toContain('def smoke(');
    expect(a).toContain('smoke 12/12');
    expect(a).toContain('SIKLUS 223');
    expect(a).toContain('SIKLUS 224');
    expect(a).toContain('SIKLUS 225');
    expect(a).toContain('max-age=31536000, immutable');
  });
});
