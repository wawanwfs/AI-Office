"""Kebijakan cache & kompresi untuk file statis WFS HQ.

Dipakai server 9503 (hq_proxy.py / server.py produksi):
- Aset ber-hash di /assets/ dan workbox-* -> immutable 1 tahun.
- index.html, sw.js, registerSW.js -> no-store (service worker & shell harus fresh).
- Statis lainnya (font, ikon, manifest) -> max-age 1 hari.
- Teks besar (js/css/svg/json/html/map/txt/webmanifest) >= 1KB -> gzip bila client mendukung.
"""
import gzip
import io
import re

GZ_EXT = re.compile(r"\.(js|mjs|css|svg|json|html|map|txt|webmanifest)$")
MIN_GZ = 1024


def cache_control_for(path):
    p = path.split("?")[0]
    base = p.rsplit("/", 1)[-1]
    if "/assets/" in p or base.startswith("workbox-"):
        return "public, max-age=31536000, immutable"
    if p in ("/", "/index.html") or base in ("sw.js", "registerSW.js"):
        return "no-store"
    return "public, max-age=86400"


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
