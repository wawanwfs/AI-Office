#!/usr/bin/env python3
"""png_stats.py — decoder + statistik piksel PNG (stdlib-only: zlib/struct).

Motivasi (siklus 194): SOP lama "scene hidup = PNG > 500 KB" dan gate byte-size
e2e_err_probe (300 KB) adalah PROKSI — ukuran file bisa menyesatkan (kanban
mati dengan gradien langit besar tetap memampatkan besar; scene hidup polos
bisa kecil). Statistik piksel memberi verdict LANGSUNG dari isi gambar:

  - distinct colors (sampling grid): scene hidup kantor 3D = ribuan warna
    (dinding, meja, label HUD, avatar); scene mati = 1-few warna (hitam/putih
    polos atau fallback latar).
  - nonbg fraction: fraksi piksel yang berbeda dari warna pojok kiri-atas
    (latar) — canvas fallback polos => ~0%.
  - luminance stddev: gambar datar => ~0.

Decoder mendukung PNG 8-bit truecolor/grayscale, dengan/alpha, semua 5 filter
scanline (None/Sub/Up/Average/Paeth) — cukup untuk screenshot Chrome
(color type 6 RGBA / 2 RGB, bit depth 8). Interlaced TIDAK didukung
(screenshot Chrome selalu non-interlaced).

Pemakaian pustaka:
    from png_stats import png_stats, alive_verdict
    st = png_stats("ck.png")
    ok, why = alive_verdict(st, mobile=False)

Pemakaian CLI (uji cepat): python3 scripts/png_stats.py file.png [file2.png ...]
"""
import struct
import zlib

# Ambang verdict ALIVE (siklus 194, DIUKUR pada screenshot nyata — matriks
# kalibrasi penuh di DEV_LOG siklus 194): scene kantor 3D hidup = ribuan
# warna unik (siang 11.439, malam 12.215, mobile @2x 3.428). Jebakan
# "langit-saja" (gradien, TANPA konten scene) terukur 616 warna — lolos gate
# byte-size 300 KB (378 KB!) dan lolos ambang 150 → ambang warna 1500: 2.3×
# di bawah mobile hidup, 2.4× di atas jebakan gradien. Kanvas polos = 1 warna.
MIN_COLORS_ALIVE = 1500
MIN_NONBG_FRAC = 0.04


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def decode_png(data):
    """PNG bytes -> (width, height, channels, rows) dgn rows = list[bytearray].

    Melempar ValueError utk format tak didukung (interlace, bit depth != 8,
    palet — screenshot Chrome tidak memakai ketiganya).
    """
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("bukan PNG (magic salah)")
    pos = 8
    ihdr = None
    idat = bytearray()
    while pos + 8 <= len(data):
        ln, typ = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + ln]
        pos += 12 + ln  # ln + type(4) + crc(4)
        if typ == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", body)
        elif typ == b"IDAT":
            idat += body
        elif typ == b"IEND":
            break
    if ihdr is None:
        raise ValueError("IHDR tidak ditemukan")
    w, h, depth, ctype, comp, filt, interlace = ihdr
    if depth != 8 or interlace != 0:
        raise ValueError(f"tak didukung: depth={depth} interlace={interlace}")
    ch = {0: 1, 2: 3, 4: 2, 6: 4}.get(ctype)
    if ch is None:
        raise ValueError(f"color type {ctype} tak didukung (palet dsb.)")
    raw = zlib.decompress(bytes(idat))
    stride = w * ch
    bpp = ch
    rows = []
    prev = bytearray(stride)
    off = 0
    for _ in range(h):
        ftype = raw[off]
        off += 1
        line = bytearray(raw[off:off + stride])
        off += stride
        if ftype == 1:  # Sub
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif ftype == 2:  # Up
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ftype == 3:  # Average
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ftype == 4:  # Paeth
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                ul = prev[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + _paeth(left, prev[i], ul)) & 0xFF
        rows.append(line)
        prev = line
    return w, h, ch, rows


def png_stats(path_or_bytes):
    """Statistik piksel file PNG (atau bytes). Return dict terukur.

    Sampling: grid tetap (setiap 4 px dua arah) untuk distinct colors & nonbg
    — deterministik, cukup padat utk membedakan scene hidup vs polos.
    """
    if isinstance(path_or_bytes, (bytes, bytearray)):
        data = bytes(path_or_bytes)
        nbytes = len(data)
    else:
        with open(path_or_bytes, "rb") as f:
            data = f.read()
        nbytes = len(data)
    w, h, ch, rows = decode_png(data)
    step = 4
    colors = set()
    total = 0
    nonbg = 0
    bg = None
    lum_sum = 0.0
    lum_sq = 0.0
    nlum = 0
    for y in range(0, h, step):
        row = rows[y]
        for x in range(0, w, step):
            i = x * ch
            r, g, b = row[i], row[i + 1], row[i + 2]
            if ch == 4 and row[i + 3] < 128:
                continue  # piksel transparan tak dihitung
            total += 1
            if bg is None:
                bg = (r, g, b)
            colors.add((r, g, b))
            if (r, g, b) != bg:
                nonbg += 1
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            lum_sum += lum
            lum_sq += lum * lum
            nlum += 1
    mean = lum_sum / max(nlum, 1)
    var = max(lum_sq / max(nlum, 1) - mean * mean, 0.0)
    return {
        "bytes": nbytes,
        "w": w,
        "h": h,
        "colors": len(colors),
        "nonbg_frac": round(nonbg / max(total, 1), 4),
        "lum_std": round(var ** 0.5, 1),
        "sampled": total,
    }


def alive_verdict(st, mobile=False):
    """Verdict scene hidup dari statistik piksel. Return (ok, alasan).

    Ambang sama utk desktop & mobile (mobile @2x justru lebih padat piksel).
    """
    ok = st["colors"] >= MIN_COLORS_ALIVE and st["nonbg_frac"] >= MIN_NONBG_FRAC
    why = (f"colors={st['colors']} nonbg={st['nonbg_frac']:.3f} "
           f"lum_std={st['lum_std']} ({st['w']}x{st['h']})")
    return ok, why


if __name__ == "__main__":
    import sys
    for p in sys.argv[1:]:
        st = png_stats(p)
        ok, why = alive_verdict(st)
        print(f"PNG_STATS {p}: {st} -> {'ALIVE' if ok else 'DEAD'} ({why})")
