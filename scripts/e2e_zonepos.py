# Ukur posisi layar label zona via proyeksi matriks kamera (tanpa menebak dari screenshot).
import json, os, subprocess, time, urllib.request

src = open(os.path.join(os.path.dirname(__file__), "e2e_shot.py")).read()
g = {}
exec(src.split("if __name__")[0], g)

PORT = 9223
URL = "http://127.0.0.1:9503"
CHROME = g.get("CHROME") or "/usr/bin/google-chrome"

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
 (function(){var bs=(window.__bubbles||window.__chatBubbles||[]);if(bs.forEach){bs.forEach(function(bb){var sp=bb.sprite||bb;var p=sp.position;var c=proj({elements:mwi},p.x,p.y,p.z);var pr=proj({elements:pm},c.x,c.y,c.z);var k=H/(2*Math.tan(cam.fov*Math.PI/360));var dz=cam.position.distanceTo(sp.position);out.push({label:"BUBBLE",x:Math.round((pr.x*0.5+0.5)*W),y:Math.round((-pr.y*0.5+0.5)*H),behind:pr.z>1,sy:sp.scale.y?Math.round(sp.scale.y*k):0,sx:sp.scale.x?Math.round(sp.scale.x*k):0});});}})();
 (window.__zoneLabels||[]).forEach(zt=>{
  const p=zt.position;
  const c=proj({elements:mwi}, p.x, p.y, p.z);
  const pr=proj({elements:pm}, c.x, c.y, c.z);
  const dz=cam.position.distanceTo(zt.position);
  const k=H/(2*Math.tan(cam.fov*Math.PI/360));
  out.push({label:zt.userData.label, x:Math.round((pr.x*0.5+0.5)*W), y:Math.round((-pr.y*0.5+0.5)*H), behind:pr.z>1, sy:Math.round(zt.scale.y*k/dz), sx:Math.round(zt.scale.x*k/dz), vis:zt.visible, op:zt.material?zt.material.opacity:null, mat:zt.material?zt.material.type:null});});
 return {H, W, zones:out};})()
"""

def _x99_alive():
    """Cek X server :99 hidup (bukan cuma socket basi — pelajaran siklus 127/
    128: socket basi membuat Xvfb baru gagal bind → chrome tak punya display)."""
    return subprocess.run(["xdpyinfo", "-display", ":99"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

def main():
    env = dict(os.environ, DISPLAY=":99")
    xv = None if _x99_alive() else subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
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
        time.sleep(15)
        r = cmd("Runtime.evaluate", expression=EXPR, returnByValue=True)
        res = r.get("result", {}).get("result", {})
        if "value" not in res:
            print("EVAL_FAIL:", json.dumps(r)[:400]); return
        data = res["value"] if isinstance(res["value"], dict) else json.loads(res["value"])
        if "err" in data:
            print("ERR:", data["err"]); return
        for z in data["zones"]:
            top = z["y"] - z["sy"] / 2
            bot = z["y"] + z["sy"] / 2
            flag = ""
            if z["y"] - z["sy"]/2 < 0: flag += " OFFSCREEN_TOP"
            elif top < 140: flag += " ABOVE_TOP_MARGIN"
            if bot > data["H"] - 110: flag += " BELOW_BOT_MARGIN"
            print(f"{z['label']!r:26} cx={z['x']:5} cy={z['y']:4} sx={z['sx']:4} sy={z['sy']:3} behind={z['behind']}{flag}")
    finally:
        p.kill()
        if xv: xv.kill()

if __name__ == "__main__":
    main()
