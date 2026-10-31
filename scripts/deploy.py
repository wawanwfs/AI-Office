#!/usr/bin/env python3
"""Deploy dist/ → ~/wfs-hq dengan pemangkasan aset hashed basi.

Masalah yang diperbaiki (siklus 158): SOP lama `cp -r dist/* ~/wfs-hq/` tidak
pernah MENGHAPUS bundle lama — setiap build menghasilkan nama file hashed baru
(index-XXXX.js, OfficeScene-XXXX.js, …) sehingga direktori assets/ menumpuk
file orphan (90 file, hanya 7 dipakai; ±11 MB basi ter-serve & ikut membingungkan
audit). Sekarang: salin sinkron (hapus dulu, salin ulang) + pemangkasan file
hashed orphan di assets/ yang tidak direferensikan index.html / landing.html /
sw.js — diarsipkan ke ~/wfs-hq/.pruned-assets/ (bukan rm permanen) dan bisa
dipulihkan. File tanpa hash (favicon.svg, og-image.png, dsb) tidak disentuh.

Siklus 191: logika dipindah ke fungsi `deploy()` dengan guard `__main__` agar
AMAN di-import (tanpa efek samping saat import) — e2e_err_probe.py memakai
modul ini sebagai SATU SUMBER HASHED_RE + referenced_assets() untuk gate
hygiene anti-re-akumulasi (bug siklus 157 sempat mengulang: SOP cp -r masih
dipakai cron hingga assets/ kembali menumpuk 75 file vs 11 hidup).
"""
import os, re, shutil, urllib.request

SRC_DIST = '/home/agentuser/ai-office-main/dist'
DST_HQ = '/home/agentuser/wfs-hq'
PRUNE_DIR = os.path.join(DST_HQ, '.pruned-assets')

# Nama bundle ber-hash Vite/Rolldown: <stem>-<hash8+>.<ext>
HASHED_RE = re.compile(r'^.+-[A-Za-z0-9_-]{8,}\.(js|css)$')


def referenced_assets() -> set:
    """Kumpulan nama/stem file assets/ yang dirujuk index.html, landing.html,
    sw.js. Siklus 192: SATU SUMBER dengan referenced_root_files() — net terluas
    (basename .js/.css di mana pun + stem ber-hash tanpa ekstensi). Pelajaran
    siklus ini: sw.js meng-import workbox sbg sibling TANPA ekstensi
    ("./workbox-2fbc6a65") → net sempit `assets/(...)` menandai workbox HIDUP
    sebagai orphan (hampir mematahkan SW baru + gate hygiene palsu-positif)."""
    return referenced_root_files()


def _is_referenced(name: str, refs: set) -> bool:
    """name lengkap ATAU stem-nya (tanpa ekstensi) ada di referensi."""
    return name in refs or name.rsplit('.', 1)[0] in refs


def prune_orphan_assets() -> list:
    """Arsipkan file hashed di assets/ yang tidak direferensikan. Return list nama."""
    refs = referenced_assets()
    assets = os.path.join(DST_HQ, 'assets')
    pruned = []
    for name in sorted(os.listdir(assets)):
        if not HASHED_RE.match(name) or _is_referenced(name, refs):
            continue
        src = os.path.join(assets, name)
        os.makedirs(PRUNE_DIR, exist_ok=True)
        dst = os.path.join(PRUNE_DIR, name)
        if os.path.exists(dst):  # nama hashed sama = isi sama; tak perlu salin ulang
            os.remove(src)
        else:
            shutil.move(src, dst)
        pruned.append(name)
    return pruned


def sync_dist_to_hq():
    """Salin dist/ → ~/wfs-hq sinkron penuh (assets/ dihapus dulu, salin ulang)."""
    src_assets = os.path.join(SRC_DIST, 'assets')
    dst_assets = os.path.join(DST_HQ, 'assets')
    if os.path.isdir(src_assets):
        if os.path.isdir(dst_assets):
            shutil.rmtree(dst_assets)
        shutil.copytree(src_assets, dst_assets)
    for item in os.listdir(SRC_DIST):
        s = os.path.join(SRC_DIST, item)
        d = os.path.join(DST_HQ, item)
        if os.path.isdir(s):
            if os.path.exists(d):
                shutil.rmtree(d)
            shutil.copytree(s, d)
        else:
            shutil.copy2(s, d)


def referenced_root_files() -> set:
    """Siklus 192: nama file hashed (js/css) yang disebut DI MANA PUN dalam
    index.html / landing.html / sw.js — mencakup referensi ROOT tanpa prefix
    assets/ (sw.js meng-import modul workbox sebagai sibling TANPA EKSTENSI:
    "./workbox-2fbc6a65"; index.html bisa /d-index-*.css). Dua jaring: (1)
    basename .js/.css apa pun, (2) stem ber-hash tanpa ekstensi (dash + ≥8
    karakter alnum) — pelajaran run pertama: workbox HIDUP hampir terpangkas.
    Net lebih luas = lebih konservatif: file yang mungkin dirujuk TIDAK boleh
    dipangkas."""
    refs = set()
    stem_re = re.compile(r'[A-Za-z0-9][A-Za-z0-9._-]*-[A-Za-z0-9_-]{8,}')
    for fname in ('index.html', 'landing.html', 'sw.js'):
        p = os.path.join(DST_HQ, fname)
        if not os.path.exists(p):
            continue
        with open(p, encoding='utf-8', errors='replace') as f:
            body = f.read()
        refs.update(re.findall(r'[A-Za-z0-9][A-Za-z0-9._-]*\.(?:js|css)', body))
        refs.update(stem_re.findall(body))
    return refs


def prune_root_stale() -> list:
    """Siklus 192: arsipkan file hashed basi di ROOT ~/wfs-hq (bukan hanya
    assets/). d-index-*.css dst adalah sisa era `cp dist/*` pra-158 — berbahaya
    bagi SW lama (path root sama persis dengan path dist) meski tak dirujuk.
    Referensi root (workbox sibling dsb) dihormati via referenced_root_files()."""
    refs = referenced_root_files()
    pruned = []
    for name in sorted(os.listdir(DST_HQ)):
        p = os.path.join(DST_HQ, name)
        if not os.path.isfile(p) or not HASHED_RE.match(name) or _is_referenced(name, refs):
            continue
        os.makedirs(PRUNE_DIR, exist_ok=True)
        dst = os.path.join(PRUNE_DIR, name)
        if os.path.exists(dst):
            os.remove(p)
        else:
            shutil.move(p, dst)
        pruned.append(name)
    return pruned


def deploy():
    """Deploy penuh + prune. Return jumlah orphan yang dipangkas."""
    sync_dist_to_hq()
    return len(prune_orphan_assets()) + len(prune_root_stale())


if __name__ == '__main__':
    pruned = deploy()

    # Test koneksi
    try:
        with urllib.request.urlopen('http://127.0.0.1:9503/', timeout=3) as r:
            print(f"deployed, 9503: {r.status}, pruned {pruned} orphan asset(s)")
    except Exception as e:
        print(f"deployed (service restart needed): {e}, pruned {pruned} orphan asset(s)")
