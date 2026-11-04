#!/usr/bin/env python3
"""e2e_zone_lod.py — siklus 246: bukti live LOD label zona berbasis jarak kamera.

Latar: A/B kamera rendah siklus 245 (temuan B3) — billboard label zona (skala
dunia tetap) membengkak & menutupi rak server saat kamera rendah (radius 9).

Probe (CDP :99, chrome-headless-shell, pola e2e_zone_multi):
  T1 KAMERA RUMAH (radius 42.5): scale tiap label zona == baseScale eksak
     (kontrak visual lama utuh — kondisi 99% pemakaian tidak berubah).
  T2 KAMERA RENDAH server room (tgt pusat zona, radius 9): scale SERVER ROOM
     == baseScale × 0.45 (clamp — baseScale 4.25×0.8) → ~55% lebih kecil;
     ukuran piksel layar turun tajam dibanding baseScale.
  T3 PULIH: kembali ke radius 42.5 → scale == baseScale lagi (LOD dua arah).
  T4 anti-regresi wiring: seluruh label punya userData.baseScale di awal.
Urutan: T4 pertama (wiring), lalu T1 → T2 → T3 (state kamera disentuh terakhir).
"""
import json, os, subprocess, time, urllib.request, sys, base64

# Reuse transport WS ter-hardening (timeout, EOF guard, framing) — SATU SUMBER,
# pola e2e_zone_multi.py. Jangan implementasi WS inline di sini.
_src = open(os.path.join(os.path.dirname(__file__), "e2e_shot.py")).read()
_g = {}
exec(_src.split("if __name__")[0], _g)
WS = _g["WS"]

WS_TIMEOUT_S = 60
CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9481
URL = "http://127.0.0.1:9503/app/"

ZONES_EXPR = """
(function(){
  const ls=(window.__zoneLabels||[]).map(zt=>({
    label:zt.userData.label,
    sx:zt.scale.x, sy:zt.scale.y,
    base:zt.userData.baseScale?{x:zt.userData.baseScale.x,y:zt.userData.baseScale.y}:null,
    vis:zt.visible, op:zt.material.opacity
  }));
  return {n:ls.length, zones:ls, r:window.__cam?window.__cam.sph.radius:null};
})()
"""

# Posisi & ukuran layar aktual (proyeksi) + scale sprite — utk T2.
PROJ_EXPR = """
(function(){
  const cam=window.__camCam; if(!cam)return {err:'no cam'};
  cam.updateMatrixWorld();
  const mwi=cam.matrixWorldInverse.elements, pm=cam.projectionMatrix.elements;
  function proj(m,x,y,z){const e=m.elements;const w=1/(e[3]*x+e[7]*y+e[11]*z+e[15]);
    return {x:(e[0]*x+e[4]*y+e[8]*z+e[12])*w,y:(e[1]*x+e[5]*y+e[9]*z+e[13])*w,z:(e[2]*x+e[6]*y+e[10]*z+e[14])*w};}
  const H=window.innerHeight,W=window.innerWidth;
  const out=[];
  (window.__zoneLabels||[]).forEach(zt=>{
    const p=zt.position;
    const c=proj({elements:mwi},p.x,p.y,p.z); const pr=proj({elements:pm},c.x,c.y,c.z);
    if(pr.z>1)return;
    const dz=cam.position.distanceTo(zt.position);
    const k=H/(2*Math.tan(cam.fov*Math.PI/360));
    out.push({label:zt.userData.label,dist:+dz.toFixed(2),sx:zt.scale.x,
      pxW:Math.round(zt.scale.x*k/dz),pxH:Math.round(zt.scale.y*k/dz),
      x:Math.round((pr.x*0.5+0.5)*W),y:Math.round((-pr.y*0.5+0.5)*H)});
  });
  return {zones:out};
})()
"""

SET_CAM = """(function(){
  const c=window.__cam; if(!c||!c.sph) return 'no cam';
  if(c.tgt) c.tgt.set(%s);
  c.sph.theta=%f; c.sph.phi=%f; c.sph.radius=%f; c.upd();
  return 'ok';
})()"""


def pump(cmd, frames=3):
    try:
        cmd("Runtime.evaluate",
            expression=f"new Promise(r=>{{let i=0;const t=()=>{{if(++i>={frames})r(true);else requestAnimationFrame(t)}};requestAnimationFrame(t)}})",
            awaitPromise=True)
    except TimeoutError:
        pass  # SwiftShader lambat: rAF batch > WS deadline — cukup sleep di bawah
    time.sleep(4.0)


def main():
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if subprocess.run(["xdpyinfo", "-display", ":99"], timeout=10, stdout=subprocess.DEVNULL,
                      stderr=subprocess.DEVNULL).returncode != 0:
        xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                          "--enable-unsafe-swiftshader", "--window-size=1366,768",
                          "--disable-dev-shm-usage", URL],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ok = True
    try:
        time.sleep(2)
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        wsu = [t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0]
        s = WS(wsu)
        mid = [0]

        def cmd(method, **params):
            mid[0] += 1
            s.send(json.dumps({"id": mid[0], "method": method, "params": params}))
            for _ in range(600):
                r = json.loads(s.recv())
                if r.get("id") == mid[0]:
                    return r

        def ev(expr, await_promise=False):
            r = cmd("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=await_promise)
            res = r.get("result", {}).get("result", {})
            if "value" not in res:
                print("EVAL_FAIL:", json.dumps(r)[:400]); return None
            return res["value"]

        cmd("Page.enable"); cmd("Runtime.enable")
        cmd("Runtime.evaluate", expression="try{localStorage.setItem('wfs_autorot','0')}catch(e){}")
        cmd("Page.reload")
        time.sleep(18)

        # ── T4: wiring baseScale (SEBELUM kamera disentuh) ──
        d = ev(ZONES_EXPR)
        checks = []
        base_map = {z["label"]: z["base"] for z in d["zones"]}
        t4 = d["n"] == 5 and all(z["base"] for z in d["zones"])
        checks.append(("T4 wiring: 5 label zona semuanya punya userData.baseScale", t4,
                       f"n={d['n']} base={sum(1 for z in d['zones'] if z['base'])}/5"))

        def setcam(tgt, theta, phi, radius):
            ev(SET_CAM % (tgt, theta, phi, radius))
            pump(cmd, frames=2)
            time.sleep(2.0)

        # ── T1: kamera rumah → scale == baseScale eksak ──
        setcam("0, 1.4, 0.3", 2.446, 1.0, 42.5)
        d1 = ev(ZONES_EXPR)
        t1 = all(abs(z["sx"] - base_map[z["label"]]["x"]) < 1e-6 and
                 abs(z["sy"] - base_map[z["label"]]["y"]) < 1e-6 for z in d1["zones"])
        checks.append(("T1 kamera rumah (r=42.5): scale == baseScale eksak (kontrak lama utuh)", t1,
                       "; ".join(f"{z['label'][:6]}={z['sx']:.2f}/{base_map[z['label']]['x']:.2f}" for z in d1["zones"][:3])))

        # ── T2: kamera rendah server room → scale == base×0.45 & px turun ──
        # Siklus 248 — konvergensi LOD dua-tick diterapkan KONSISTEN: setelah
        # setcam, tunggu SATU tick relayout penuh (pump + read-back frames via
        # __animFrames; SwiftShader 0.3 FPS = 1 tick bisa >4 s) lalu pump LAGI
        # sebelum membaca scale. Dulu hanya pump+sleep 4s sekali → pada VM
        # lambat tick relayout pertama kadang tiba SETELAH pembacaan (race),
        # T2 palsu-merah padahal LOD benar (iterasi deterministik 3×:
        # tick1 kadang 4.25, tick2 selalu 1.913).
        setcam("2.5, 1.2, -8", 2.0, 1.25, 9.0)
        pump(cmd, frames=2)  # tick kedua — pastikan relayout LOD sudah konvergen
        time.sleep(2.0)
        p2 = ev(PROJ_EXPR)
        sr2 = next((z for z in p2["zones"] if z["label"] == "SERVER ROOM"), None)
        b = base_map["SERVER ROOM"]
        exp = b["x"] * 0.45
        t2 = sr2 is not None and abs(sr2["sx"] - exp) < 1e-6 and sr2["dist"] < 15
        checks.append(("T2 kamera rendah server room (r=9, dist<15): scale SERVER ROOM == base×0.45 (clamp)",
                       t2, f"scale={sr2['sx']:.3f} exp={exp:.3f} dist={sr2['dist']} pxW={sr2['pxW']}px" if sr2 else "SERVER ROOM tak terlihat"))

        # ── T3: pulih ke rumah → scale == base lagi (LOD dua arah) ──
        setcam("0, 1.4, 0.3", 2.446, 1.0, 42.5)
        d3 = ev(ZONES_EXPR)
        t3 = all(abs(z["sx"] - base_map[z["label"]]["x"]) < 1e-6 and
                 abs(z["sy"] - base_map[z["label"]]["y"]) < 1e-6 for z in d3["zones"])
        checks.append(("T3 pulih (r=42.5): scale == baseScale lagi (LOD dua arah)", t3,
                       "; ".join(f"{z['label'][:6]}={z['sx']:.2f}" for z in d3["zones"][:3])))

        print()
        for name, passed, detail in checks:
            print(("PASS" if passed else "FAIL"), "|", name, "|", detail)
            ok = ok and passed
        print()
        print("E2E_ZONE_LOD:", "OK" if ok else "FAIL")

        # ── Mode --shot: PNG kamera rendah server room (label visible) utk vision ──
        if "--shot" in sys.argv:
            setcam("2.5, 1.2, -8", 2.0, 1.25, 9.0)
            out = os.path.expanduser("~/.hermes/cache/scratch/zone_lod_lowcam.png")
            shot = cmd("Page.captureScreenshot", format="png")
            data = shot.get("result", {}).get("data")
            if not data:
                print("SHOT_FAIL:", json.dumps(shot)[:300]); sys.exit(1)
            with open(out, "wb") as f:
                f.write(base64.b64decode(data))
            print("SHOT_SAVED:", out, os.path.getsize(out), "bytes")
        sys.exit(0 if ok else 1)
    finally:
        p.kill()
        if xv:
            xv.kill()


if __name__ == "__main__":
    main()
