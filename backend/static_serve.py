"""Kebijakan cache & kompresi untuk file statis WFS HQ.

Dipakai server 9503 (server.py produksi / superset backend_live/wfs_hq_server.py):
- Aset ber-hash di /assets/ dan workbox-* -> immutable 1 tahun.
- index.html, sw.js, registerSW.js -> no-store (service worker & shell harus fresh).
- Statis lainnya (font, ikon, manifest) -> max-age 1 hari.
- Teks besar (js/css/svg/json/html/map/txt/webmanifest) >= 1KB -> gzip bila client mendukung.
- landing.html ikut no-store (Siklus 432): shell PWA berikutnya pun harus selalu fresh —
  sebelumnya landing bisa stuck 24 jam di cache browser setelah deploy.

- Siklus 434: shell HTML (/, /app/, /landing, /index.html) + respons proxy admin/cs
  kini di-gzip on-the-fly juga — sebelumnya index.html (~3.8 KB) & landing
  dikirim uncompressed (Lighthouse document-latency-insight: "No compression
  applied", wasted 3 KB/request). Helper gzip_html() di static_serve.py.
"""
import gzip
import hashlib
import io
import re

GZ_EXT = re.compile(r"\.(js|mjs|css|svg|json|html|map|txt|webmanifest)$")
MIN_GZ = 1024


def cache_control_for(path):
    p = path.split("?")[0]
    base = p.rsplit("/", 1)[-1]
    if "/assets/" in p or "/fonts/" in p or base.startswith("workbox-"):
        return "public, max-age=31536000, immutable"
    if p in ("/", "/index.html", "/landing.html") or base in ("sw.js", "registerSW.js"):
        return "no-store"
    if base == "server.py" or p.endswith("/server.py"):
        return "no-store"
    return "public, max-age=86400"


def etag_for(data):
    """ETag konten (sha1, kuot) — address berbasis isi, bukan path/mtime.

    Siklus 448: browser kirim If-None-Match pada revalidasi; cocok → 304
    tanpa body (aset immutable /assets/ + ikon 24 jam tidak pernah diulang
    kirim penuhnya).
    """
    return '"%s"' % hashlib.sha1(data).hexdigest()[:20]


def not_modified(if_none_match, etag):
    """True bila If-None-Match klien cocok dgn ETag server (weak compare)."""
    if not if_none_match:
        return False
    inm = if_none_match.strip()
    if inm == "*":
        return True
    return etag.strip().lstrip("W/") in (v.strip().lstrip("W/") for v in inm.split(","))


def maybe_gzip(data, path, accept_encoding):
    """Return (data, gzipped). Gzip hanya bila memang mengecilkan payload."""
    if not GZ_EXT.search(path.split("?")[0]):
        return data, False
    if len(data) < MIN_GZ:
        return data, False
    if "gzip" not in (accept_encoding or "").lower():
        return data, False
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=6, mtime=0) as g:
        g.write(data)
    comp = buf.getvalue()
    if len(comp) >= len(data):
        return data, False
    return comp, True


def gzip_html(data, accept_encoding):
    """Gzip payload HTML shell (/, /app/, /landing, proxy admin/cs).

    Beda dgn maybe_gzip: tak terikat ekstensi file (path bisa '/'), tetap
    hormati Accept-Encoding & threshold ukuran, dan jangan kompres bila
    hasilnya tidak lebih kecil. Content-Length penelepon wajib pakai
    panjang payload BALIKAN (data atau comp).
    """
    if "gzip" not in (accept_encoding or "").lower():
        return data, False
    if len(data) < MIN_GZ:
        return data, False
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=6, mtime=0) as g:
        g.write(data)
    comp = buf.getvalue()
    if len(comp) >= len(data):
        return data, False
    return comp, True
