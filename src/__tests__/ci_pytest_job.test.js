// Siklus 213 — CI pytest job + requirements-pytest.txt (backend tak lagi buta di CI).
//
// Riwayat: ci.yml lama hanya npm ci/test/build — 141 test pytest backend_live+backend
// TIDAK PERNAH jalan di CI (kesenjangan tercatat di DEV_LOG siklus 212). Siklus ini
// menambah job `pytest` di ci.yml + requirements-pytest.txt ter-track (pin eksak).
// Simulasi runner (docker python:3.11-slim) menangkap 4 fail kering: test commit
// shell-out ke binary git yang absen di image Python minimal — fix = skipif jujur
// saat git absen (runner ubuntu-latest punya git preinstalled → test tetap hidup).
//
// Kontrak yang digate:
//  1. ci.yml memuat job pytest utuh (checkout, setup-python 3.11, pip install
//     requirements-pytest.txt, pytest backend_live backend).
//  2. Job build npm tidak ter-regresi (npm ci/test/build).
//  3. requirements-pytest.txt: 6 pin eksak `==` (bukan >=), tanpa paket liar.
//  4. Versi pin == versi venv VM (CI-safe: dilewati bila venv absen di runner).
//  5. 4 test git-shell-out punya skipif shutil.which('git') — dilarang fail kering.
//  6. ci.yml tidak menyentuh produksi (tanpa systemctl/deploy/apply_*).

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(here, '..', '..');
const ciYml = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
const reqTxt = readFileSync(join(ROOT, 'requirements-pytest.txt'), 'utf8');

const REQ_PKGS = ['pytest', 'fastapi', 'httpx', 'starlette', 'pydantic', 'uvicorn'];

// --- 1. Job pytest di ci.yml -------------------------------------------------

describe('ci.yml job pytest (siklus 213)', () => {
  it('memuat job pytest dgn setup-python 3.11', () => {
    expect(ciYml).toMatch(/^ {2}pytest:$/m);
    expect(ciYml).toContain('actions/setup-python@v5');
    expect(ciYml).toMatch(/python-version: {1,2}'3\.11'/);
  });

  it('menginstall requirements-pytest.txt lalu menjalankan pytest backend_live+backend', () => {
    expect(ciYml).toMatch(/^ {6}- run: pip install --no-cache-dir -r requirements-pytest\.txt$/m);
    expect(ciYml).toMatch(/python -m pytest backend_live backend -q/);
  });

  it('job build npm tidak ter-regresi (guard 210 tetap)', () => {
    expect(ciYml).toMatch(/^ {2}build:$/m);
    expect(ciYml).toContain('npm ci');
    expect(ciYml).toContain('npm test');
    expect(ciYml).toContain('npm run build');
  });

  it('ci.yml tidak menyentuh produksi (tanpa systemd/deploy/apply_*)', () => {
    expect(ciYml).not.toMatch(/systemctl/);
    expect(ciYml).not.toMatch(/deploy\.py|apply_/);
  });

  it('alasan + risiko terdokumentasi di komentar ci.yml', () => {
    expect(ciYml).toContain('Siklus 213');
    expect(ciYml).toContain('buta');
  });
});

// --- 2. requirements-pytest.txt ----------------------------------------------

describe('requirements-pytest.txt pin eksak', () => {
  const pins = Object.fromEntries(
    reqTxt.split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const m = l.match(/^([A-Za-z0-9_.-]+)==([A-Za-z0-9_.-]+)$/);
        if (!m) throw new Error(`baris requirements-pytest.txt bukan pin eksak: ${l}`);
        return [m[1], m[2]];
      }),
  );

  it('memuat tepat 6 paket inti dgn pin == (bukan >= / ~=)', () => {
    expect(Object.keys(pins).sort()).toEqual([...REQ_PKGS].sort());
  });

  it('pytest 9.x + fastapi 0.162 + httpx 0.28 (versi teruji VM)', () => {
    expect(pins.pytest).toMatch(/^9\./);
    expect(pins.fastapi).toMatch(/^0\.162\./);
    expect(pins.httpx).toMatch(/^0\.28\./);
  });

  it('alasan buta-CI terdokumentasi di komentar', () => {
    expect(reqTxt).toContain('buta di CI');
  });

  it('versi pin == versi venv VM ~/pytest-venv (CI-safe: dilewati bila absen)', () => {
    const site = join(globalThis.process?.env?.HOME || '/nonexistent', 'pytest-venv',
      'lib', 'python3.11', 'site-packages');
    if (!existsSync(site)) return; // runner GitHub: venv VM tidak ada — skip jujur
    const dists = readdirSync(site).filter((d) => d.endsWith('.dist-info'));
    for (const pkg of REQ_PKGS) {
      const hit = dists.find((d) => d.toLowerCase().startsWith(`${pkg.toLowerCase()}-`));
      expect(hit, `dist-info ${pkg} harus ada di venv VM`).toBeTruthy();
      const ver = hit.slice(pkg.length + 1, -'.dist-info'.length);
      expect(`${pkg}==${ver}`, `pin requirements vs venv VM: ${pkg}`).toBe(`${pkg}==${pins[pkg]}`);
    }
  });
});

// --- 3. File test yang diuji job pytest --------------------------------------

const TEST_FILES = [
  ...readdirSync(join(ROOT, 'backend_live')).filter((f) => f.startsWith('test_') && f.endsWith('.py')),
  ...readdirSync(join(ROOT, 'backend')).filter((f) => f.startsWith('test_') && f.endsWith('.py')),
];

describe('census file test backend (dijalankan job pytest CI)', () => {
  // Siklus 214: +1 backend_live (test_wfs_static_allowlist.py — allowlist statis).
  it('11 file test backend_live + 5 file test backend ada & ter-track', () => {
    expect(TEST_FILES.filter((f) => existsSync(join(ROOT, 'backend_live', f))).length).toBe(11);
    expect(TEST_FILES.filter((f) => existsSync(join(ROOT, 'backend', f))).length).toBe(5);
  });

  it.each(TEST_FILES)('%s memuat minimal 1 def test_', (f) => {
    const dir = existsSync(join(ROOT, 'backend_live', f)) ? 'backend_live' : 'backend';
    const src = readFileSync(join(ROOT, dir, f), 'utf8');
    expect(src, `${dir}/${f} tanpa def test_`).toMatch(/^ {0,4}def test_/m);
  });
});

// --- 4. Skipif git jujur (pelajaran simulasi runner) --------------------------

describe('test git-shell-out wajib skipif binary git absen', () => {
  const src = readFileSync(
    join(ROOT, 'backend_live', 'test_wfs_preview_workspace_security.py'), 'utf8');

  it('_requires_git didefinisikan via shutil.which + skipif', () => {
    expect(src).toContain('import shutil');
    expect(src).toContain('shutil.which("git")');
    expect(src).toMatch(/skipif\(/);
  });

  it('diterapkan ke 4 test commit (bukan fail kering di image tanpa git)', () => {
    const n = (src.match(/@_requires_git/g) || []).length;
    expect(n).toBe(4);
  });

  it('alasan runner ubuntu-latest vs image minimal terdokumentasi', () => {
    expect(src).toContain('ubuntu-latest');
  });
});
