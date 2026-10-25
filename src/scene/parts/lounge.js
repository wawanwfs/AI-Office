// Welcome & lounge kantor WFS Project (kanan depan): karpet lounge berlapis,
// coffee table kaca+kayu + majalah & cangkir, 2 kursi santai, lampu berdiri,
// meja majalah, TV info dgn dashboard live dari /wfs-project.
// Builder berbasis konteks (THREE, office, M, MB, drawTvDashboard) — pola sama dgn cafe.js.
export function createLounge(ctx) {
  const { THREE, office, M, MB, drawTvDashboard, blobMat } = ctx;
  const lounge = new THREE.Group();
  lounge.position.y = 1.20; // Elevasi Lantai 3 (Welcome Lounge)
  // Karpet lounge (bulat-ish: dua kotak bertumpuk warna hangat)
  const lgRug = new THREE.Mesh(new THREE.BoxGeometry(3.2, .015, 3.0), M(0x8D5524, { transparent: true, opacity: .75 }));
  lgRug.position.set(9.7, .02, 7.4); lgRug.receiveShadow = true; lounge.add(lgRug);
  const lgRugIn = new THREE.Mesh(new THREE.BoxGeometry(2.4, .017, 2.2), M(0xC98A3D, { transparent: true, opacity: .75 }));
  lgRugIn.position.set(9.7, .025, 7.4); lounge.add(lgRugIn);
  // Coffee table (kaca + kayu) di depan sofa
  const ctB = new THREE.Mesh(new THREE.BoxGeometry(1.0, .06, .6), M(0x6D4C41));
  ctB.position.set(9.55, .36, 6.4); lounge.add(ctB);
  if (blobMat) {
    const ctShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), blobMat);
    ctShadow.rotation.x = -Math.PI / 2;
    ctShadow.position.set(9.55, 0.012, 6.4);
    ctShadow.renderOrder = 2;
    ctShadow.userData.blob = true;
    lounge.add(ctShadow);
  }
  const ctTop = new THREE.Mesh(new THREE.BoxGeometry(1.1, .03, .7), M(0xB0BEC5, { transparent: true, opacity: .55 }));
  ctTop.position.set(9.55, .42, 6.4); lounge.add(ctTop);
  [[-.42, -.22], [.42, -.22], [-.42, .22], [.42, .22]].forEach(([ox, oz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.05, .34, .05), M(0x4E342E));
    leg.position.set(9.55 + ox, .17, 6.4 + oz); lounge.add(leg);
  });
  // Majalah + cangkir di coffee table
  const mag = new THREE.Mesh(new THREE.BoxGeometry(.24, .012, .3), M(0xF4511E));
  mag.position.set(9.4, .45, 6.35); mag.rotation.y = .4; lounge.add(mag);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(.04, .035, .08, 8), M(0xFAFAFA));
  mug.position.set(9.75, .475, 6.5); lounge.add(mug);
  // 2 kursi santai menghadap sofa/meja
  const armChair = (cx, cz, ry) => {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(.6, .3, .6), M(0x00695C)); seat.position.y = .3; g.add(seat);
    const cush = new THREE.Mesh(new THREE.BoxGeometry(.52, .1, .52), M(0x26A69A)); cush.position.y = .5; g.add(cush);
    const back = new THREE.Mesh(new THREE.BoxGeometry(.6, .55, .12), M(0x00695C)); back.position.set(0, .72, -.26); g.add(back);
    [[-.26, -.26], [.26, -.26], [-.26, .26], [.26, .26]].forEach(([ox, oz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(.05, .15, .05), M(0x4E342E));
      leg.position.set(ox, .075, oz); g.add(leg);
    });
    g.position.set(cx, 0, cz); g.rotation.y = ry;
    g.traverse(o => { if (o.isMesh && !o.material.isMeshBasicMaterial) o.castShadow = true; });
    lounge.add(g); return g;
  };
  const chair1 = armChair(8.7, 7.7, Math.PI * .5);   // menghadap +X (ke arah sofa)
  const chair2 = armChair(9.6, 8.6, Math.PI);        // menghadap -Z (ke coffee table)
  // Lampu berdiri (pole + shade hangat) di sudut lounge
  const flPole = new THREE.Mesh(new THREE.CylinderGeometry(.025, .03, 1.5, 8), M(0x37474F));
  flPole.position.set(11.2, .75, 8.6); lounge.add(flPole);
  const flShade = new THREE.Mesh(new THREE.CylinderGeometry(.18, .24, .28, 10, 1, true),
    M(0xFFE0B2, { side: THREE.DoubleSide, transparent: true, opacity: .9 }));
  flShade.position.set(11.2, 1.6, 8.6); lounge.add(flShade);
  const flBulb = new THREE.PointLight(0xFFC97A, .5, 4, 2);
  flBulb.position.set(11.2, 1.5, 8.6); lounge.add(flBulb);
  // Meja majalah rendah + TV info layar (di dinding kanan area lounge)
  const magRack = new THREE.Mesh(new THREE.BoxGeometry(.5, .45, .35), M(0x5D4037));
  magRack.position.set(11.9, .225, 7.0); lounge.add(magRack);
  const mags = [0xF4511E, 0x1E88E5, 0x43A047].map((c, i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(.06, .22, .28), M(c));
    b.position.set(11.72, .36, 7.0 - (i - 1) * .0); b.rotation.z = 0; lounge.add(b); return b;
  });
  const tvFrame = new THREE.Mesh(new THREE.BoxGeometry(.06, .75, 1.3), M(0x101418));
  tvFrame.position.set(12.35, 2.0, 6.4); lounge.add(tvFrame);
  // TV lounge: dashboard live dari /wfs-project (data nyata, refresh 60 dtk + saat tab visible).
  // Statis lama ("uptime: 99.98%", "agents: 14 online") = angka hardcode menyesatkan → dihapus.
  // drawTv diekstrak murni ke parts/tv_canvas.js (diuji unit); di sini cukup injek ctx.
  const tvC = document.createElement('canvas'); tvC.width = 256; tvC.height = 144;
  const tvx = tvC.getContext('2d');
  function drawTv() { drawTvDashboard(tvx, window.__tvData); window.__lastTvDrawAt = Date.now() }
  drawTv();
  const tvTex = new THREE.CanvasTexture(tvC); tvTex.minFilter = THREE.LinearFilter;
  async function tvPull(force = false) {
    if (!force && document.visibilityState === 'hidden') return;
    try {
      const r = await fetch('/wfs-project');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      window.__tvData = { ...d, at: Date.now() };
      drawTv(); tvTex.needsUpdate = true;
    } catch (e) { window.__tvPullErr = String(e && e.stack || e); }
  }
  tvPull(true);
  const tvIv = setInterval(tvPull, 60000);
  const tvOnVis = () => { if (document.visibilityState === 'visible') tvPull() };
  document.addEventListener('visibilitychange', tvOnVis);
  const tvScr = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .68), new THREE.MeshBasicMaterial({ map: tvTex }));
  tvScr.position.set(12.31, 2.0, 6.4); tvScr.rotation.y = -Math.PI / 2; lounge.add(tvScr);
  office.add(lounge);
  return {
    lounge, rug: lgRug, rugInner: lgRugIn, coffeeBase: ctB, coffeeTop: ctTop, magazine: mag, mug,
    chairs: [chair1, chair2], lampPole: flPole, lampShade: flShade, lampBulb: flBulb,
    magRack, mags, tvFrame, tvScreen: tvScr, tvTex, tvCanvas: tvC, tvPull, tvIv, tvOnVis,
  };
}
