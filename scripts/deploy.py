#!/usr/bin/env python3
"""Publish dist/ additively, with complete files and HTML entry points last.

Routine deploys retain previous hashed chunks for open tabs and service workers.
Each file is copied to a sibling temporary file and published with os.replace;
index.html is published only after all other build files are ready. This is
per-file atomic publication, not a whole-release transaction.

Prune helpers and reference APIs remain import-compatible for explicit offline
maintenance. Current HTML references cannot prove that an old chunk is unused:
pruning requires a separate retention policy and must never run during deploy.
"""
import os, re, shutil, tempfile, urllib.request

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


def _publish_file(source, destination):
    """Copy beside the target, then atomically publish a complete file."""
    parent = os.path.dirname(destination)
    os.makedirs(parent, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.deploy-', suffix='.tmp', dir=parent)
    os.close(fd)
    try:
        shutil.copy2(source, temporary)
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.remove(temporary)


def sync_dist_to_hq():
    """Publish additively: dependencies first, HTML last, index.html last of all.

    Keep previous chunks for open tabs. Failed copies leave the target file
    intact; no entry HTML is changed until every non-HTML file is ready.
    This is per-file atomic publication, not a multi-file transaction.
    """
    files = []
    for root, directories, names in os.walk(SRC_DIST):
        directories.sort()
        for name in sorted(names):
            source = os.path.join(root, name)
            relative = os.path.relpath(source, SRC_DIST)
            files.append(relative)
    files.sort(key=lambda name: (
        name == 'index.html', name.lower().endswith('.html'), name,
    ))
    for relative in files:
        _publish_file(os.path.join(SRC_DIST, relative),
                      os.path.join(DST_HQ, relative))


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


def prune_root_png() -> list:
    """Siklus 215: PNG artefak di ROOT ~/wfs-hq yang tidak di-ship dist/
    (og-image/apple-touch-icon/icon-192/icon-512 adalah 4 PNG sah — sisanya
    screenshot eksperimen era Okt yang menumpuk ±7MB di web root produksi dan
    pernah tersaji publik 200 via :9503, ditutup allowlist 214). Invarian:
    SETIAP .png di root WAJIB berasal dari dist/ — yang bukan diarsipkan ke
    .pruned-assets (bukan rm permanen, bisa dipulihkan). Maintenance only:
    this helper is never called by routine deploy()."""
    dist_png = {n for n in os.listdir(SRC_DIST) if n.lower().endswith('.png')}
    pruned = []
    for name in sorted(os.listdir(DST_HQ)):
        p = os.path.join(DST_HQ, name)
        if not name.lower().endswith('.png') or not os.path.isfile(p):
            continue
        if name in dist_png:
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
    """Publish without pruning; retain the legacy integer prune-count result.

    Previous hashed files may still be requested by old open tabs and service
    workers. Prune helpers are explicit maintenance only, never deploy steps.
    """
    sync_dist_to_hq()
    return 0


if __name__ == '__main__':
    pruned = deploy()

    # Test koneksi
    try:
        with urllib.request.urlopen('http://127.0.0.1:9503/', timeout=3) as r:
            print(f"deployed, 9503: {r.status}, pruned {pruned} orphan asset(s)")
    except Exception as e:
        print(f"deployed (service restart needed): {e}, pruned {pruned} orphan asset(s)")
