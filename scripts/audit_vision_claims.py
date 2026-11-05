#!/usr/bin/env python3
"""audit_vision_claims.py — Siklus 262: parser otomatis klaim vision → pasangan
uji probe (backlog tetap 258–261), + ORACLE oklusi live (CDP :99).

Latar (pelajaran 256/258): temuan vision_analyze ("label bertumpuk") TIDAK boleh
dipercaya mentah — klaim vision yang ternyata pasangan yang sedang DIKONVERGENSI
sistem oklusi sempat dilaporkan sebagai bug. Siklus ini menutup lingkaran:

  1. PARSER — ekstrak otomatis pasangan klaim "NAMA×NAMA" dari DEV_LOG.md
     (hanya section vision/oklusi terbaru, hanya baris terukur: frac/ops/zop/
     menimpa/"klaim pasangan"/"zona occ") → scripts/vision_claims.json
     (deterministik, drift-gate vitest membandingkan dgn parse ulang).
     Alias zona vision → label scene: KANTIN→CAFÉ, LOUNGE→WELCOME & LOUNGE.
  2. ORACLE LIVE — buka :9503/app/ (SwiftShader, Xvfb :99), tunggu tick relayout
     + __occPts siap (pelajaran 258: baca <15-20s = pra-tick), lalu HITUNG ULANG
     aturan pass oklusi di Python dan bandingkan dgn occ yang ditulis pass:
       - zona: HIT agent (≥12% luas zona) atau bubble (≥12% luas min) → occ 0.5
       - tanpa HIT → occ 1.0
     occ pts = target mentah pass (pra-damping) → deterministik, banding eksak.
     Pasangan agent×agent: overlap ≥15% luas min (aturan TIE 250) → WAJIB ada
     yang occ<1 (kurva kedalaman 240 ATAU tie — salah satu pasti memudar).
  3. VERDICT per klaim: RESOLVED (tumpuk & zona 0.5) / FALSIFIED (tidak tumpuk
     di steady-state) / FADED-BY-OTHER (zona pudar oleh pasangan lain) /
     AGENT_MISSING / BUG (tumpuk tapi zona occ 1.0 → regresi nyata, exit 1).

Pemakaian:
  uv run --with websocket-client python3 scripts/audit_vision_claims.py            # audit live penuh
  uv run --with websocket-client python3 scripts/audit_vision_claims.py --pairs "BUDI×CAFÉ"
  python3 scripts/audit_vision_claims.py --parse-only [--devlog PATH]              # JSON ke stdout (vitest)
  python3 scripts/audit_vision_claims.py --sync                                    # tulis scripts/vision_claims.json
"""
import base64, json, os, re, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEVLOG = os.path.join(ROOT, "DEV_LOG.md")
CLAIMS_JSON = os.path.join(ROOT, "scripts", "vision_claims.json")

# Kontrak label_occlusion.js (satu sumber: jangan duplikasi nilai lain di sini)
OCCL_PX = 26                 # breathing room px (label_occlusion.js OCCL_PX)
OCCL_ZONE_TIE_FRAC = 0.12    # agent/bubble × zona → zona pudar
OCCL_TIE_FRAC = 0.15         # agent×agent TIE → yang lebih jauh pudar
OCCL_ZONE_TIE_MIN = 0.5      # target occ zona ter-fade
MAX_TIE_MIN_DELTA = 1e-3     # occ disimpan 3 desimal (toFixed(3))

# Alias nama zona versi vision → label zona scene (floor_zones.js)
ZONE_LABELS = ["DEV DESK", "MEETING", "WELCOME & LOUNGE", "CAFÉ", "SERVER ROOM"]
ZONE_ALIAS = {
    "KANTIN AI": "CAFÉ", "KANTIN": "CAFÉ", "CAFE": "CAFÉ",
    "WELCOME": "WELCOME & LOUNGE", "LOUNGE": "WELCOME & LOUNGE",
    "WELCOME & LOUNGE": "WELCOME & LOUNGE", "MEETING ROOM": "MEETING",
    "SERVER ROOM": "SERVER ROOM", "DEV DESK": "DEV DESK", "MEETING": "MEETING",
}

# ── PARSER ────────────────────────────────────────────────────────────────────
# Nama klaim: huruf pertama alfabet, boleh spasi/&/apostrof/É (teks zona vision).
# Dilarang: digit/titik/garis miring/kurung (buang polusi matematika "3.7125×0.05").
NAME_RE = r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’& \-]{1,30}?"
PAIR_RE = re.compile(
    rf"({NAME_RE})\s*[×x]\s*({NAME_RE})"
    rf"(?=\s*(?:frac\b|ops\b|zop\b|[\"',)&/;]|—|\s\d|$))"
)
LINE_FILTER_RE = re.compile(r"frac\s|ops\s|zop\s|menimpa|klaim pasangan|zona occ", re.I)
SECTION_RE = re.compile(r"/vision|oklusi|klaim/i", re.I)
SECTION_TITLE_RE = re.compile(r"vision|oklusi|klaim", re.I)


def _valid_name(s):
    s = (s or "").strip().strip(":'\"").strip()
    if len(s) < 3 or len(s) > 30:
        return None
    if not re.search(r"[A-Z]", s):          # nama agen/zona selalu ada kapital
        return None
    if not re.match(r"^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’& \-]*$", s):
        return None
    if not re.search(r"[A-Za-zÀ-ÿ]{2,}", s):  # ≥2 huruf berurutan (bukan "0.5")
        return None
    return s


def parse_vision_claims(text, max_sections=4):
    """Ekstrak pasangan klaim vision dari teks DEV_LOG (section terbaru dulu)."""
    sections = []  # (judul, isi)
    cur_title, cur_body = None, []
    for line in text.splitlines():
        if line.startswith("## "):
            if cur_title is not None:
                sections.append((cur_title, "\n".join(cur_body)))
            cur_title, cur_body = line[3:].strip(), []
        elif cur_title is not None:
            cur_body.append(line)
    if cur_title is not None:
        sections.append((cur_title, "\n".join(cur_body)))

    claims, seen = [], set()
    n_sel = 0
    for title, body in sections:  # DEV_LOG newest-first
        if not SECTION_TITLE_RE.search(title):
            continue
        n_sel += 1
        if n_sel > max_sections:
            break
        m = re.search(r"Siklus (\d+)", title)
        cycle = int(m.group(1)) if m else 0
        k = 0
        for ln in body.splitlines():
            if not LINE_FILTER_RE.search(ln):
                continue
            for mm in PAIR_RE.finditer(ln):
                a, b = _valid_name(mm.group(1)), _valid_name(mm.group(2))
                if not a or not b:
                    continue
                zu = b.upper()
                zone = ZONE_ALIAS.get(zu)
                if zone is None and b.upper() not in [z.upper() for z in ZONE_LABELS]:
                    # kanan bukan zona dikenal → pasangan agen×agen
                    zone = None
                else:
                    zone = zone or b.upper()
                key = (a.upper(), (zone or b).upper())
                if key in seen:
                    continue
                seen.add(key)
                k += 1
                claims.append({
                    "id": f"VC-{cycle or n_sel}-{k}", "cycle": cycle,
                    "section": title[:80], "agent": a.upper(),
                    "raw_pair": f"{a}×{b}",
                    "zone": zone,  # None = klaim agen×agen
                    "pair_label": zone if zone else b.upper(),
                })
    return claims


def load_claims():
    with open(CLAIMS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)

# ── ORACLE (mirror label_occlusion.js::occlusionPass — aturan zona & TIE) ─────
def _xy(p):
    dx, dy = p.get("dx"), p.get("dy")
    if isinstance(dx, (int, float)) and isinstance(dy, (int, float)):
        return float(dx), float(dy)
    return 0.0, 0.0  # box tak terukur: panggilan overlap jadi no-op (jarak 0 vs half-size>0)


def oracle_zone_occ(z, agents, bubbles):
    """occ yang SEHARUSNYA ditulis pass utk satu zona — hitung ulang Python."""
    zw, zh = z.get("zw") or 0, z.get("zh") or 0
    zx, zy = _xy(z)
    area_z = zw * zh
    if not (area_z > 0):
        return None  # tak bisa dinilai (tak lazim → caller tandai INCOMPLETE)
    occ = 1.0
    for a in agents:
        ax, ay = _xy(a)
        if ax is None:
            continue
        dx, dy = abs(ax - zx), abs(ay - zy)
        ox = ((a.get("sw") or 0) + zw) / 2.0
        oy = ((a.get("sh") or 0) + zh) / 2.0
        if dx >= ox + OCCL_PX or dy >= oy + OCCL_PX:
            continue
        ix, iy = max(0.0, ox - dx), max(0.0, oy - dy)
        if ix * iy >= area_z * OCCL_ZONE_TIE_FRAC:
            occ = min(occ, OCCL_ZONE_TIE_MIN)
    for b in bubbles:
        bw, bh = b.get("zw") or b.get("sw") or 0, b.get("zh") or b.get("sh") or 0
        bx, by = _xy(b)
        area_b = bw * bh
        if not (area_b > 0):
            continue
        dx, dy = abs(bx - zx), abs(by - zy)
        ox = (bw + zw) / 2.0
        oy = (bh + zh) / 2.0
        if dx >= ox + OCCL_PX or dy >= oy + OCCL_PX:
            continue
        ix, iy = max(0.0, ox - dx), max(0.0, oy - dy)
        if ix * iy >= min(area_z, area_b) * OCCL_ZONE_TIE_FRAC:
            occ = min(occ, OCCL_ZONE_TIE_MIN)
    return occ


def pair_overlap_fires(a, b, pad=OCCL_PX, frac=OCCL_TIE_FRAC):
    """True bila pasangan agen memicu aturan TIE/depth (overlap ≥ frac luas min)."""
    ax, ay = _xy(a)
    bx, by = _xy(b)
    dx, dy = abs(ax - bx), abs(ay - by)
    ox = ((a.get("sw") or 0) + (b.get("sw") or 0)) / 2.0
    oy = ((a.get("sh") or 0) + (b.get("sh") or 0)) / 2.0
    if dx >= ox + pad or dy >= oy + pad:
        return False
    ix, iy = max(0.0, ox - dx), max(0.0, oy - dy)
    amin = min((a.get("sw") or 0) * (a.get("sh") or 0), (b.get("sw") or 0) * (b.get("sh") or 0))
    return amin > 0 and ix * iy >= amin * frac

# ── Transport CDP (pola probe_focus_261.py; semua subprocess.run ber-timeout) ──
CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9498
APP = "http://127.0.0.1:9503/app/"
WS_TIMEOUT_S = 60


class WS:
    def __init__(s, u):
        pr = urlparse(u)
        s.sock = socket.create_connection((pr.hostname, pr.port), timeout=WS_TIMEOUT_S)
        s.sock.sendall((f"GET {pr.path} HTTP/1.1\r\nHost: {pr.hostname}:{pr.port}\r\n"
                        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\n"
                        "Sec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        s.sock.settimeout(WS_TIMEOUT_S)
        while b"\r\n\r\n" not in buf:
            c = s.sock.recv(1)
            if not c:
                raise ConnectionResetError("EOF saat handshake WS")
            buf += c

    def send(s, m):
        d = json.dumps(m).encode()
        h = b"\x81"
        n = len(d)
        mask = os.urandom(4)
        h += bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n)
        s.sock.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(d)))

    def rx(s, timeout=45):
        s.sock.settimeout(timeout)
        hdr = s.sock.recv(2)
        if len(hdr) < 2:
            return None
        ln = hdr[1] & 0x7F
        if ln == 126:
            ln = struct.unpack(">H", s.sock.recv(2))[0]
        elif ln == 127:
            ln = struct.unpack(">Q", s.sock.recv(8))[0]
        data = b""
        while len(data) < ln:
            chunk = s.sock.recv(ln - len(data))
            if not chunk:
                break
            data += chunk
        return json.loads(data.decode("utf-8", "replace"))


def live_audit(pairs):
    """Buka scene, tunggu konvergensi, jalankan oracle + verdict klaim. Return exit code."""
    env = dict(os.environ, DISPLAY=":99")
    if subprocess.run(["xdpyinfo", "-display", ":99"], timeout=10,
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
        subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    p = subprocess.Popen([
        CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
        "--enable-unsafe-swiftshader", "--window-size=1366,768",
        "--disable-dev-shm-usage", APP
    ], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(2)
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        s = WS([t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0])
        mid = [0]

        def cmd(method, **params):
            mid[0] += 1
            s.send({"id": mid[0], "method": method, "params": params})
            for _ in range(900):
                r = s.rx()
                if r is None:
                    raise ConnectionResetError("WS recv None")
                if r.get("id") == mid[0]:
                    return r

        def ev(expr):
            r = cmd("Runtime.evaluate", expression=expr, returnByValue=True)
            res = r.get("result", {}).get("result", {})
            return res.get("value") if "value" in res else None

        cmd("Page.enable")
        cmd("Runtime.enable")
        cmd("Runtime.evaluate", expression="try{localStorage.setItem('wfs_autorot','0')}catch(e){}")

        # Tunggu tick relayout + __occPts siap (pelajaran 258: baca pra-tick palsu)
        snap = None
        deadline = time.time() + 90
        while time.time() < deadline:
            time.sleep(3)
            snap = ev("(function(){return {pts:window.__occPts||null,err:window.__occPtsErr||null,"
                      "n:window.__occlFade}})()")
            if snap and snap.get("pts") and not snap.get("err"):
                zones = [q for q in snap["pts"] if q.get("zone") and not q.get("bub") and isinstance(q.get("zt"), str)]
                ags = [q for q in snap["pts"] if not q.get("zone") and not q.get("bub")]
                if len(zones) >= 5 and len(ags) >= 10:
                    break
            snap = None
        if not snap:
            print("FAIL: __occPts tidak konvergen dalam 90s (scene mati / pra-tick?)")
            return 1
        print(f"SNAPSHOT: zones+agents+bubbles pts={len(snap['pts'])} occlFade={snap['n']}")

        bugs, incomplete = 0, 0
        for rnd in range(2):  # 2 ronde: occ target deterministik per pts, keduanya wajib konsisten
            if rnd == 1:
                time.sleep(6)
                snap = ev("(function(){return {pts:window.__occPts||null,err:window.__occPtsErr||null,"
                          "n:window.__occlFade}})()")
                if not snap or not snap.get("pts") or snap.get("err"):
                    print("FAIL: snapshot ronde-2 tidak terbaca")
                    return 1
            pts = snap["pts"]
            zones = [q for q in pts if q.get("zone") and not q.get("bub") and isinstance(q.get("zt"), str)]
            agents = [q for q in pts if not q.get("zone") and not q.get("bub")]
            bubbles = [q for q in pts if q.get("bub")]
            print(f"RONDE {rnd+1}: zones={len(zones)} agents={len(agents)} bubbles={len(bubbles)}")
            for z in zones:
                exp = oracle_zone_occ(z, agents, bubbles)
                if exp is None:
                    incomplete += 1
                    print(f"  INCOMPLETE zona {z['zt']}: box tak terukur")
                    continue
                act = z.get("occ")
                if act is None or abs(act - exp) > MAX_TIE_MIN_DELTA:
                    bugs += 1
                    print(f"  BUG zona {z['zt']}: occ={act} expected={exp}")
                else:
                    print(f"  OK zona {z['zt']}: occ={act} == oracle {exp}")
            # kontrak __occlFade == jumlah label occ<1 (agen + zona)
            n_less = sum(1 for q in pts if q.get("occ") is not None and q["occ"] < 1)
            if snap.get("n") != n_less:
                bugs += 1
                print(f"  BUG __occlFade={snap.get('n')} != hitungan occ<1={n_less}")
            if rnd == 0:
                for cl in pairs:
                    a = next((q for q in agents if q.get("name") == cl["agent"]), None)
                    if cl.get("zone"):
                        z = next((q for q in zones if q["zt"] == cl["zone"]), None)
                        if a is None:
                            print(f"VERDICT {cl['id']} {cl['raw_pair']}: AGENT_MISSING ({cl['agent']} offsite/absen)")
                            continue
                        if z is None:
                            incomplete += 1
                            continue
                        hit = oracle_zone_occ(dict(z, **{"occ": None}), [a], [])  # overlap pasangan saja
                        pair_hit = hit == OCCL_ZONE_TIE_MIN
                        if pair_hit and abs(z.get("occ") - OCCL_ZONE_TIE_MIN) <= MAX_TIE_MIN_DELTA:
                            print(f"VERDICT {cl['id']} {cl['raw_pair']}: RESOLVED (tumpuk ≥12% luas zona, zona occ 0.5)")
                        elif pair_hit:
                            bugs += 1
                            print(f"VERDICT {cl['id']} {cl['raw_pair']}: BUG (tumpuk tapi zona occ={z.get('occ')})")
                        elif abs(z.get("occ") - OCCL_ZONE_TIE_MIN) <= MAX_TIE_MIN_DELTA:
                            print(f"VERDICT {cl['id']} {cl['raw_pair']}: FADED-BY-OTHER (zona 0.5 oleh pasangan lain)")
                        else:
                            print(f"VERDICT {cl['id']} {cl['raw_pair']}: FALSIFIED (tak tumpuk di steady-state ini)")
                    else:
                        b = next((q for q in agents if q.get("name") == cl["pair_label"]), None)
                        if a is None or b is None:
                            print(f"VERDICT {cl['id']} {cl['raw_pair']}: AGENT_MISSING")
                            continue
                        fires = pair_overlap_fires(a, b)
                        if fires:
                            mn = min(a.get("occ") or 1, b.get("occ") or 1)
                            if mn < 1 - MAX_TIE_MIN_DELTA:
                                print(f"VERDICT {cl['id']} {cl['raw_pair']}: RESOLVED (tumpuk ≥15%, min occ {mn})")
                            else:
                                bugs += 1
                                print(f"VERDICT {cl['id']} {cl['raw_pair']}: BUG (tumpuk ≥15% tapi keduanya occ 1.0)")
                        else:
                            print(f"VERDICT {cl['id']} {cl['raw_pair']}: FALSIFIED (tak tumpuk di steady-state ini)")
        print(f"RINGKASAN: bugs={bugs} incomplete={incomplete} klaim={len(pairs)}")
        return 1 if (bugs or incomplete) else 0
    finally:
        p.kill()


def main():
    args = sys.argv[1:]
    if "--parse-only" in args:
        i = args.index("--devlog") if "--devlog" in args else None
        path = args[i + 1] if i is not None else DEVLOG
        with open(path, "r", encoding="utf-8") as f:
            claims = parse_vision_claims(f.read())
        print(json.dumps({"source": os.path.basename(path), "claims": claims},
                         ensure_ascii=False, indent=1))
        return 0
    if "--sync" in args:
        with open(DEVLOG, "r", encoding="utf-8") as f:
            claims = parse_vision_claims(f.read())
        with open(CLAIMS_JSON, "w", encoding="utf-8") as f:
            json.dump({"source": "DEV_LOG.md", "claims": claims}, f, ensure_ascii=False, indent=1)
            f.write("\n")
        print(f"sync {len(claims)} klaim → {CLAIMS_JSON}")
        return 0
    pairs = load_claims()["claims"]
    i = args.index("--pairs") if "--pairs" in args else None
    if i is not None:
        pairs = []
        for tok in args[i + 1].split(","):
            a, _, b = tok.partition("×")
            zu = ZONE_ALIAS.get(b.strip().upper())
            pairs.append({"id": "CLI", "agent": a.strip().upper(), "raw_pair": tok.strip(),
                          "zone": zu, "pair_label": zu or b.strip().upper()})
    return live_audit(pairs)


if __name__ == "__main__":
    sys.exit(main())
