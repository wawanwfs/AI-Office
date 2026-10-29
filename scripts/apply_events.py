#!/usr/bin/env python3
"""Apply / verify / rollback SSE events di gateway :8787 + streaming di proxy :9503.

Siklus 154 — deploy TERKONTROL dua setengah bug kelas sama dgn siklus 152/153
(server produksi & proxy bukan repo git):
- Half A: gateway :8787 — router additive wfs_events.py (SSE /api/events
  diturunkan jujur dari tasks.db read-only; DB tak punya execution_logs).
- Half B: proxy :9503 — /wfs-api/events → _proxy_stream() (read1 streaming,
  bukan buffered read()). Patch bedah server.py proxy, marker + anchor unik.
- Backup sebelum menulis (hanya saat benar-benar dipatch); rollback = pulih
  backup tertua lalu restart unit terkait.
- Verifikasi pasca-restart: health + endpoint baru + GUARD regresi
  sh/overview, approvals, dashboard/stats (152/153) + paritas /api/status.
- Tanpa --apply: CHECK saja (exit 3 bila belum terpasang).
"""
import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import time
import urllib.request

GW = pathlib.Path("/home/agentuser/wfs-office")
HQ = pathlib.Path("/home/agentuser/wfs-hq")
REPO = pathlib.Path(__file__).resolve().parent.parent
ROUTER_SRC = REPO / "backend_live" / "wfs_events.py"
ROUTER_DST = GW / "wfs_events.py"
BACKUPS = GW / "backups"
MARK_GW = "# === wfs events SSE (additive, read-only) — siklus 154 ==="
ANCHOR_GW = "# === wfs sh-console endpoints (additive, read-only) — siklus 153 ==="

PROXY_SRC = HQ / "server.py"
MARK_PX = "    # === wfs SSE streaming proxy (siklus 154) ==="
METHOD_MARK = "def _proxy_stream_events"
ANCHOR_PX = "    def _proxy(self):"


def sh(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def get(url, timeout=5):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.status, r.read()


def health() -> bool:
    try:
        return get("http://127.0.0.1:8787/api/health", 3)[0] == 200
    except Exception:
        return False


def gw_events_status() -> str:
    """ok (frame connected) / http-error / down.

    PENTING: read1() bukan read() — SSE adalah stream tanpa EOF; read()
    blocking sampai timeout → down palsu (bug tooling tertangkap siklus 154).
    """
    try:
        with urllib.request.urlopen("http://127.0.0.1:8787/api/events", timeout=4) as r:
            body = r.read1(300)
            return "ok" if r.status == 200 and b'"connected"' in body else "bad-body"
    except Exception as e:
        return "down"


def proxy_events_status() -> str:
    """ok = 200 + frame connected MUNCUL (bukan menunggu EOF → tidak buffered)."""
    try:
        with urllib.request.urlopen("http://127.0.0.1:9503/wfs-api/events", timeout=4) as r:
            body = r.read1(300)
            return "ok" if r.status == 200 and b'"connected"' in body else "bad-body"
    except Exception:
        return "down"


def guards_ok() -> dict:
    """Guard regresi: endpoint siklus 152/153 tidak boleh rusak."""
    out = {}
    try:
        st, body = get("http://127.0.0.1:8787/api/sh/overview", 5)
        d = json.loads(body)
        out["overview153"] = st == 200 and all(k in d for k in ("projects", "tasks", "agents"))
    except Exception:
        out["overview153"] = False
    try:
        st, body = get("http://127.0.0.1:8787/api/approvals", 5)
        out["approvals153"] = st == 200 and isinstance(json.loads(body).get("approvals"), list)
    except Exception:
        out["approvals153"] = False
    try:
        st, body = get("http://127.0.0.1:8787/api/dashboard/stats", 5)
        d = json.loads(body)
        out["stats152"] = st == 200 and all(
            k in d for k in ("projects_total", "tasks_total", "agents_count"))
    except Exception:
        out["stats152"] = False
    try:
        st, body = get("http://127.0.0.1:8787/api/status", 5)
        out["agents_parity"] = int(json.loads(body).get("agents", -1))
    except Exception:
        out["agents_parity"] = -1
    return out


def patch_gateway(txt: str) -> str:
    assert MARK_GW not in txt, "marker gateway sudah ada"
    assert ANCHOR_GW in txt, "anchor siklus 153 tidak ditemukan — server.py berubah, apply DIBATALKAN"
    block = (MARK_GW + "\n"
             "import wfs_events as _wfs_ev\n"
             "app.include_router(_wfs_ev.router)\n\n")
    i = txt.index(ANCHOR_GW)
    return txt[:i] + block + txt[i:]


STREAM_METHOD = '''    # === wfs SSE streaming proxy (siklus 154) ===
    def _proxy_stream_events(self):
        """Passthrough streaming /wfs-api/events → :8787/api/events (SSE).

        MUNGKIN blocked saat menunggu chunk berikutnya (urlopen().read1()) —
        ini yang membedakannya dari _proxy() buffered: EventSource menerima
        frame sesuai ketika gateway memancarkannya, tanpa menunggu EOF.
        Thread-per-connection (ThreadingMixIn) membuat thread tunggal ini
        ter-block tanpa memengaruhi koneksi lain.
        """
        import urllib.request as _ur
        try:
            # timeout=90: batas per-recv() upstream — HARUS > interval keepalive
            # (15 dtk) agar stream tidak mati saat idle (bug tertangkap E2E
            # siklus 154: timeout=10 < 15 → tiap stream mati tiap ~10 dtk).
            r = _ur.urlopen(_ur.Request("http://127.0.0.1:8787/api/events"), timeout=90)
            self.send_response(r.status)
            self.send_header("Content-Type", r.headers.get("Content-Type") or "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            while True:
                chunk = r.read1(4096)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except Exception:
            try:
                msg = json.dumps({"error": "stream failed"}).encode()
                self.send_response(502)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(msg)))
                self.end_headers()
                self.wfile.write(msg)
            except Exception:
                pass

'''

PROXY_GET_MARK = "        if self.path == \"/wfs-api/events\":\n            return self._proxy_stream_events()\n"
PROXY_STAMP = "timeout=90"  # versi metode stream — naikkan bila metode diubah


def patch_proxy(txt: str) -> str:
    """Sisipkan / perbarui metode stream + branch do_GET (idempoten per-versi).

    Stamp PROXY_STAMP menandai versi metode: bila metode lama (stamp beda)
    sudah terpasang, blok lama dibuang dulu lalu versi baru disisipkan —
    sehingga --apply dapat memutakhirkan metode tanpa duplikasi.
    """
    had_method = METHOD_MARK in txt
    had_branch = PROXY_GET_MARK in txt
    if had_method:
        assert PROXY_STAMP not in txt, "proxy sudah dipatch versi sama — tak ada yang diubah"
        start = txt.index(MARK_PX)
        end = txt.index("    def _proxy(self):", start)  # blok lama ber tepat sebelum _proxy
        txt = txt[:start] + txt[end:]
    if had_branch:
        txt = txt.replace(PROXY_GET_MARK, "", 1)  # sisip ulang di posisi kanan
    assert ANCHOR_PX in txt, "anchor proxy _proxy tidak ditemukan — server.py proxy berubah, apply DIBATALKAN"
    # (1) metode stream disisipkan sebelum _proxy
    i = txt.index(ANCHOR_PX)
    txt = txt[:i] + STREAM_METHOD + txt[i:]
    # (2) branch do_GET events disisipkan SEBELUM delegasi _proxy generik.
    # Anchor = konteks unik do_GET (delegasi _proxy juga ada di do_POST —
    # tanpa konteks ini replace(...,1) menyasar do_POST).
    proj_ret = "            return project_api.handle_project(self)\n"
    ifline = '        if self.path.startswith("/wfs-api/"):\n'
    retline = "            return self._proxy()\n"
    anchor = proj_ret + ifline + retline  # unik: delegasi do_POST tak diawali project_api
    assert txt.count(anchor) == 1, "anchor do_GET tidak unik/tidak ditemukan"
    txt = txt.replace(anchor, proj_ret + PROXY_GET_MARK + ifline + retline, 1)
    return txt


def compile_check(path: pathlib.Path, txt: str, py: str, tag: str):
    tmp = path.with_suffix(".py.compilecheck154")
    tmp.write_text(txt)
    try:
        r = sh(py, "-c", "import py_compile,sys; py_compile.compile(sys.argv[1], doraise=True)", str(tmp))
        if r.returncode != 0:
            raise RuntimeError(f"compile {tag} gagal: {r.stderr.strip()[:300]}")
    finally:
        tmp.unlink(missing_ok=True)


def restart_unit(unit: str, tries: int = 30) -> bool:
    r = sh("sudo", "systemctl", "restart", unit)
    if r.returncode != 0:
        print(f"restart {unit} rc:", r.returncode, r.stderr.strip()[:200])
    for _ in range(tries):
        if unit == "wfs-office" and health():
            return True
        if unit == "wfs-hq":
            try:
                get("http://127.0.0.1:9503/", 3)
                return True
            except Exception:
                pass
        time.sleep(0.5)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--rollback", action="store_true")
    ap.add_argument("--only", choices=("gw", "px"), default=None,
                    help="batasi ke gateway saja / proxy saja")
    a = ap.parse_args()
    do_gw = a.only in (None, "gw")
    do_px = a.only in (None, "px")

    venv_py = str(GW / ".venv" / "bin" / "python")
    srv_gw = GW / "server.py"
    srv_px = HQ / "server.py"
    deployed_gw = srv_gw.read_text()
    deployed_px = srv_px.read_text()
    stage_h = hashlib.sha256(ROUTER_SRC.read_bytes()).hexdigest()[:12]
    dst_h = hashlib.sha256(ROUTER_DST.read_bytes()).hexdigest()[:12] if ROUTER_DST.exists() else "-"
    gw_installed = MARK_GW in deployed_gw
    px_installed = (METHOD_MARK in deployed_px and PROXY_GET_MARK in deployed_px
                    and PROXY_STAMP in deployed_px)  # stamp = versi metode stream
    print(f"gw_marker={gw_installed} px_marker={px_installed} router stage={stage_h} dst={dst_h}")
    print(f"health={health()} gw_events={gw_events_status()} px_events={proxy_events_status()} guards={guards_ok()}")
    print("backups:", ", ".join(p.name for p in sorted(BACKUPS.glob("server.py.bak-*"))[-3:]) or "-")

    if a.rollback:
        baks = sorted(BACKUPS.glob("server.py.bak-*"))
        px_baks = sorted(HQ.glob("backups/server.py.bak-*"))
        if not baks and not px_baks:
            sys.exit("tidak ada backup")
        if baks:
            shutil.copy2(baks[0], srv_gw)  # tertua = kondisi pra-patch pertama
        if px_baks:
            shutil.copy2(px_baks[0], srv_px)
        okg = restart_unit("wfs-office") if baks else True
        okp = restart_unit("wfs-hq") if px_baks else True
        print(f"rollback gw={okg} px={okp} gw_events={gw_events_status()} px_events={proxy_events_status()}")
        sys.exit(0 if (okg and okp) else 2)

    need_gw_router = ROUTER_SRC.read_bytes() != ROUTER_DST.read_bytes() if ROUTER_DST.exists() else True
    need_gw = do_gw and (gw_installed is False or need_gw_router)
    need_px = do_px and not px_installed

    if not a.apply:
        if need_gw or need_px:
            print("CHECK: BELUM terpasang penuh. Jalankan ulang dgn --apply.")
            sys.exit(3)
        print("CHECK: terpasang — tidak ada yang perlu diubah")
        sys.exit(0)

    bak_gw = bak_px = None
    if do_gw and (not gw_installed or need_gw_router):
        if not gw_installed:
            BACKUPS.mkdir(exist_ok=True)
            bak_gw = BACKUPS / f"server.py.bak-{int(time.time())}"
            shutil.copy2(srv_gw, bak_gw)
            new_txt = patch_gateway(deployed_gw)
            compile_check(srv_gw, new_txt, venv_py, "gateway")
            srv_gw.write_text(new_txt)
            print("gateway server.py dipatch; backup:", bak_gw.name)
        ROUTER_DST.write_bytes(ROUTER_SRC.read_bytes())
        print(f"router events di-stage ({stage_h})")
    if do_px and not px_installed:
        pxb = HQ / "backups"
        pxb.mkdir(exist_ok=True)
        bak_px = pxb / f"server.py.bak-{int(time.time())}"
        shutil.copy2(srv_px, bak_px)
        new_px = patch_proxy(deployed_px)
        compile_check(srv_px, new_px, "/usr/bin/python3", "proxy")
        srv_px.write_text(new_px)
        print("proxy server.py dipatch; backup:", bak_px.name)

    ok_gw = restart_unit("wfs-office") if (bak_gw or (do_gw and not gw_installed)) or \
        (do_gw and need_gw_router) else True
    ok_px = restart_unit("wfs-hq") if bak_px else True
    g = guards_ok() if ok_gw else {}
    gw_st = gw_events_status() if ok_gw else "down"
    # px_events hanya disyaratkan bila Half B ikut di-apply (mode --only gw = proxy belum dipatch)
    px_st = proxy_events_status() if (ok_px and do_px) else proxy_events_status()
    ok = (ok_gw and ok_px and gw_st == "ok"
          and (px_st == "ok" or not do_px)
          and all(v is True or (isinstance(v, int) and v >= 0) for v in g.values()))

    if not ok:
        print(f"VERIFIKASI GAGAL — gw_events={gw_st} px_events={px_st} "
              f"restart_gw={ok_gw} restart_px={ok_px} guards={g}")
        print("rollback otomatis bagian yang dipatch")
        if bak_gw is not None:
            shutil.copy2(bak_gw, srv_gw)
            restart_unit("wfs-office")
        elif do_gw and need_gw_router and ROUTER_DST.exists():
            ROUTER_DST.unlink(missing_ok=True)
            restart_unit("wfs-office")
        if bak_px is not None:
            shutil.copy2(bak_px, srv_px)
            restart_unit("wfs-hq")
        sys.exit(2)
    print(f"APPLY OK — gw_events=ok px_events=ok guards={g}")


if __name__ == "__main__":
    main()
