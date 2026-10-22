// parts/reception.js — builder murni RECEPTION DESK (meja + logo WFS, monitor,
// kursi, karakter NEXUS "WAHYU FS", label Founder, glow teal + PointLight).
// Diekstrak 1:1 dari OfficeScene.js (urutan/posisi/warna identik; tampilan tak berubah).
// Pola sama cafe/serverroom/lounge/bookshelf: konteks di-inject, tanpa dependensi global.
// Footprint meja didaftarkan ke OBSTACLES agar agen tak berjalan menembus meja.
import { OBSTACLES } from './obstacles.js';

export function createReception({ THREE, office, M, MB, drawResepsiLogo, makeLabel, buildChar }) {
  const reception = new THREE.Group();
  const RCX = 8, RCZ = 6.5;
  // Main desk body (curved front)
  const rcDesk = new THREE.Mesh(new THREE.BoxGeometry(2.5, .9, .6), M(0x1A2A3A));
  rcDesk.position.set(RCX, .45, RCZ); rcDesk.castShadow = true; reception.add(rcDesk);
  // Top surface
  const rcTop = new THREE.Mesh(new THREE.BoxGeometry(2.6, .04, .7), M(0xDDE4EC));
  rcTop.position.set(RCX, .92, RCZ); rcTop.castShadow = true; reception.add(rcTop);
  // Side panel
  const rcSide = new THREE.Mesh(new THREE.BoxGeometry(.6, .9, .04), M(0x1A2A3A));
  rcSide.position.set(RCX + 1.25, .45, RCZ - .3); rcSide.castShadow = true; reception.add(rcSide);
  // Footprint resepsionis didaftarkan ke OBSTACLES (obstacles.js) supaya
  // freeSpot/destinasi jalan tidak pernah menempatkan agen DI DALAM meja.
  OBSTACLES.push([RCX - 1.3, RCX + 1.55, RCZ - .35, RCZ + .35]);

  // Logo WFS Project di depan meja resepsionis
  const wfsLogoTex = (() => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 320; const x = c.getContext('2d');
    drawResepsiLogo(x);
    const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; return t;
  })();
  const rcLogoMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, .5625),
    new THREE.MeshBasicMaterial({ map: wfsLogoTex, transparent: true })
  );
  rcLogoMesh.position.set(RCX, .5, RCZ + .31); reception.add(rcLogoMesh);
  const rcLogoFront = rcLogoMesh.clone(); rcLogoFront.position.set(RCX, .5, RCZ - .31); rcLogoFront.rotation.y = Math.PI; reception.add(rcLogoFront);

  // Teal glow strip under desk front
  const rcGlow = new THREE.Mesh(new THREE.BoxGeometry(2.2, .02, .02), MB(0x0DEEF3));
  rcGlow.position.set(RCX, .05, RCZ + .3); reception.add(rcGlow);
  const rcLight = new THREE.PointLight(0x0DEEF3, 0.4, 3.5, 2);
  rcLight.position.set(RCX, .1, RCZ + .5); reception.add(rcLight);

  // Reception monitor (behind desk, facing NEXUS)
  const rcMonBase = new THREE.Mesh(new THREE.BoxGeometry(.2, .02, .1), M(0xAABBCC));
  rcMonBase.position.set(RCX - .4, .95, RCZ + .05); reception.add(rcMonBase);
  const rcMonStand = new THREE.Mesh(new THREE.BoxGeometry(.03, .18, .03), M(0xAABBCC));
  rcMonStand.position.set(RCX - .4, 1.05, RCZ + .05); reception.add(rcMonStand);
  const rcMonBody = new THREE.Mesh(new THREE.BoxGeometry(.6, .4, .03), M(0x2A2A2A));
  rcMonBody.position.set(RCX - .4, 1.35, RCZ + .08); reception.add(rcMonBody);
  // Screen glow
  const rcScreenGlow = new THREE.Mesh(new THREE.BoxGeometry(.55, .35, .01), MB(0x0A1628));
  rcScreenGlow.position.set(RCX - .4, 1.35, RCZ + .06); reception.add(rcScreenGlow);

  // Keyboard + mouse
  const rcKb = new THREE.Mesh(new THREE.BoxGeometry(.3, .02, .1), M(0x333333));
  rcKb.position.set(RCX - .4, .95, RCZ + .15); reception.add(rcKb);
  const rcMouse = new THREE.Mesh(new THREE.BoxGeometry(.05, .02, .07), M(0x333333));
  rcMouse.position.set(RCX - .1, .95, RCZ + .15); reception.add(rcMouse);

  // Reception chair (positioned in NEXUS fix above)
  const rcChairSeat = new THREE.Mesh(new THREE.BoxGeometry(.4, .04, .4), M(0x37474F));
  reception.add(rcChairSeat);
  const rcChairBack = new THREE.Mesh(new THREE.BoxGeometry(.4, .42, .04), M(0x37474F));
  reception.add(rcChairBack);

  // RECEPTION AGENT — "NEXUS" (white/silver, the coordinator)
  const nexusAgent = { name: 'WAHYU FS', color: 0xF59E0B, hex: '#F59E0B', role: 'Founder / CEO', hair: 0x1a1a1a, shirt: 0xB45309, pants: 0x292524 };
  const nexusChar = buildChar(nexusAgent, false);
  nexusChar.scale.setScalar(1.7);
  nexusChar.position.set(RCX - .4, 0, RCZ - .4); // behind desk
  nexusChar.rotation.y = Math.PI; // face +Z toward visitors
  reception.add(nexusChar);

  // Reception chair (behind desk)
  rcChairSeat.position.set(RCX - .4, .44, RCZ - .4);
  rcChairBack.position.set(RCX - .4, .67, RCZ - .59);

  // Label Founder (plat sama seperti agent lain)
  const nxLabel = makeLabel(nexusAgent);
  nxLabel.scale.set(3.2, .8, 1); nxLabel.position.set(RCX - .4, 3.3, RCZ - .4);
  reception.add(nxLabel);

  office.add(reception);

  return { reception, rcLight, nexusChar, nxLabel };
}
