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
"""
import os, re, shutil, urllib.request

SRC_DIST = '/home/agentuser/ai-office-main/dist'
DST_HQ = '/home/agentuser/wfs-hq'
PRUNE_DIR = os.path.join(DST_HQ, '.pruned-assets')

# Nama bundle ber-hash Vite/Rolldown: <stem>-<hash8+>.<ext>
HASHED_RE = re.compile(r'^.+-[A-Za-z0-9_-]{8,}\.(js|css)$')


def referenced_assets() -> set:
    """Kumpulan nama file assets/ yang dipakai index.html, landing.html, sw.js."""
    refs = set()
    for fname in ('index.html', 'landing.html', 'sw.js'):
        p = os.path.join(DST_HQ, fname)
        if not os.path.exists(p):
            continue
        with open(p, encoding='utf-8', errors='replace') as f:
            refs.update(re.findall(r'assets/([A-Za-z0-9._-]+\.(?:js|css))', f.read()))
    return refs


def prune_orphan_assets() -> list:
    """Arsipkan file hashed di assets/ yang tidak direferensikan. Return list nama."""
    refs = referenced_assets()
    assets = os.path.join(DST_HQ, 'assets')
    pruned = []
    for name in sorted(os.listdir(assets)):
        if not HASHED_RE.match(name) or name in refs:
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


# Salin aset baru — sinkron penuh: assets/ dihapus lalu disalin ulang dari dist/
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

pruned = prune_orphan_assets()

# Test koneksi
try:
    with urllib.request.urlopen('http://127.0.0.1:9503/', timeout=3) as r:
        print(f"deployed, 9503: {r.status}, pruned {len(pruned)} orphan asset(s)")
except Exception as e:
    print(f"deployed (service restart needed): {e}, pruned {len(pruned)} orphan asset(s)")
