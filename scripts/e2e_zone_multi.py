#!/usr/bin/env python3
"""Verifikasi DETERMINISTIK posisi label zona di beberapa sudut kamera.

e2e_zonepos.py kamera-nya acak tiap run (auto-rotate default on) sehingga hasil
tak bisa direproduksi. Harness ini:
  1. Inject localStorage['wfs_autorot']='0' SEBELUM halaman load (addScriptToEvaluateOnNewDocument)
     → auto-rotate mati, theta/phi tak bergeser antar frame.
  2. Set sudut kamera eksplisit via window.__cam.sph (theta/phi/radius) + upd().
  3. Ukur posisi layar label zona via proyeksi matriks kamera (CDP) — tanpa menebak.
  4. Lolos bila semua zona dalam margin viewport (atau behind=True sesaat — dilewati).

Pemakaian: uv run scripts/e2e_zone_multi.py [theta phi radius] (default 3 preset: iso/front/top)
"""
import json, os, subprocess, time, urllib.request, sys

src = open(os.path.join(os.path.dirname(__file__), "e2e_shot.py")).read()
g = {}
exec(src.split("if __name__")[0], g)

PORT = 9224
URL = "http://127.0.0.1:9503"
CHROME = g.get("CHROME") or "/usr/bin/google-chrome"

PRESETS = {
    "iso":   (2.446, 1.0,  40),
    "front": (0.0,   1.2,  40),
    "top":   (2.446, 0.35, 40),
}

EXPR = """
(function(){
 function proj(m, x, y, z){const e=m.elements;
  const w=1/(e[3]*x+e[7]*y+e[11]*z+e[15]);
  return {x:(e[0]*x+e[4]*y+e[8]*z+e[12])*w, y:(e[1]*x+e[5]*y+e[9]*z+e[13])*w, z:(e[2]*x+e[6]*y+e[10]*z+e[14])*w};}
 const H=window.innerHeight, W=window.innerWidth;
 const cam=window.__camCam; if(!cam)return {err:'no cam'};
 cam.updateMatrixWorld();
 const mwi=cam.matrixWorldInverse.elements, pm=cam.projectionMatrix.elements;
 const out=[];
 (window.__zoneLabels||[]).forEach(zt=>{
  const p=zt.position;
  const c=proj({elements:mwi}, p.x, p.y, p.z);
  const pr=proj({elements:pm}, c.x, c.y, c.z);
  const dz=cam.position.distanceTo(zt.position);
  const k=H/(2*Math.tan(cam.fov*Math.PI/360));
  out.push({label:zt.userData.label, x:Math.round((pr.x*0.5+0.5)*W), y:Math.round((-pr.y*0.5+0.5)*H), behind:pr.z>1, sy:Math.round(zt.scale.y*k/dz), sx:Math.round(zt.scale.x*k/dz), vis:zt.visible});
 });
 return {H, W, zones:out, theta: window.__cam?window.__cam.sph.theta:null};
})()
"""

LOCK_JS = "try{localStorage.setItem('wfs_autorot','0')}catch(e){}"
SET_CAM = """(function(){
  const c=window.__cam; if(!c||!c.sph) return 'no cam';
  c.sph.theta=%f; c.sph.phi=%f; c.sph.radius=%f; c.upd();
  return 'ok';
})()"""


def run_view(cmd, name, theta, phi, radius):
    r = cmd("Runtime.evaluate", expression=SET_CAM % (theta, phi, radius), returnByValue=True)
    val = r.get("result", {}).get("result", {}).get("value")
    time.sleep(3)  # beri guard beberapa frame utk konvergen
    r = cmd("Runtime.evaluate", expression=EXPR, returnByValue=True)
    res = r.get("result", {}).get("result", {})
    if "value" not in res:
        print(f"[{name}] EVAL_FAIL:", json.dumps(r)[:300]); return False
    data = res["value"] if isinstance(res["value"], dict) else json.loads(res["value"])
    if "err" in data:
        print(f"[{name}] ERR:", data["err"]); return False
    ok = True
    print(f"=== view {name} (theta={theta:.3f} phi={phi:.2f} r={radius}) ===")
    for z in data["zones"]:
        top = z["y"] - z["sy"] / 2
        bot = z["y"] + z["sy"] / 2
        flag = ""
        if z["behind"]:
            flag += " BEHIND(skipped-by-design)"
        else:
            if top < 0 or bot > data["H"]:
                flag += " OFFSCREEN"; ok = False
            elif top < 140:
                flag += " ABOVE_TOP_MARGIN"; ok = False
            if bot > data["H"] - 110:
                flag += " BELOW_BOT_MARGIN"; ok = False
            if z["x"] - z["sx"] / 2 < 0 or z["x"] + z["sx"] / 2 > data["W"]:
                flag += " X_OFFSCREEN"; ok = False
        print(f"{z['label']!r:16} cx={z['x']:5} cy={z['y']:4} sx={z['sx']:4} sy={z['sy']:3} vis={z['vis']}{flag}")
    return ok


def main():
    views = []
    if len(sys.argv) == 4:
        views = [("custom", *map(float, sys.argv[1:4]))]
    else:
        views = [(k, *v) for k, v in PRESETS.items()]
    env = dict(os.environ, DISPLAY=":99")
    xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                          "--window-size=1366,768", "--disable-dev-shm-usage", URL],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(2)
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        ws = g["WS"]([t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0])
        mid = [0]

        def cmd(method, **params):
            mid[0] += 1
            ws.send(json.dumps({"id": mid[0], "method": method, "params": params}))
            for _ in range(300):
                r = json.loads(ws.recv())
                if r.get("id") == mid[0]:
                    return r

        cmd("Page.enable"); cmd("Runtime.enable")
        cmd("Page.addScriptToEvaluateOnNewDocument", source=LOCK_JS)
        cmd("Page.reload")
        time.sleep(18)
        all_ok = True
        for name, th, ph, rd in views:
            all_ok = run_view(cmd, name, th, ph, rd) and all_ok
        print("E2E_ZONE_MULTI:", "OK" if all_ok else "FAIL")
        sys.exit(0 if all_ok else 1)
    finally:
        p.kill(); xv.kill()


if __name__ == "__main__":
    main()
