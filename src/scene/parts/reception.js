// parts/reception.js — builder murni RECEPTION DESK (meja + logo WFS, monitor,
// kursi, karakter NEXUS "WAHYU FS", label Founder, glow teal + PointLight).
// Diekstrak 1:1 dari OfficeScene.js (urutan/posisi/warna identik; tampilan tak berubah).
// Pola sama cafe/serverroom/lounge/bookshelf: konteks di-inject, tanpa dependensi global.
// Footprint meja didaftarkan ke OBSTACLES agar agen tak berjalan menembus meja.
import { OBSTACLES } from './obstacles.js';
import { uiTexture, uiMaterial } from './ui_colorspace.js';

export function createReception({ THREE, office, M, MB, drawResepsiLogo, makeLabel, buildChar, looksOf, blobMat }) {
  const reception = new THREE.Group();
  const RCX = 8, RCZ = 6.5;
  // Main desk body (curved front)
  const rcDesk = new THREE.Mesh(new THREE.BoxGeometry(2.5, .9, .6), M(0x1A2A3A));
  rcDesk.position.set(RCX, .45, RCZ); rcDesk.castShadow = true; reception.add(rcDesk);
  if (blobMat) {
    const rcShadow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.2), blobMat);
    rcShadow.rotation.x = -Math.PI / 2;
    rcShadow.position.set(RCX, 0.012, RCZ);
    rcShadow.renderOrder = 2;
    rcShadow.userData.blob = true;
    reception.add(rcShadow);
  }
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
    const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; uiTexture(t); return t;
  })();
  const rcLogoMesh = uiMaterial(new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, .5625),
    new THREE.MeshBasicMaterial({ map: wfsLogoTex, transparent: true })
  ));
  rcLogoMesh.position.set(RCX, .5, RCZ + .31); reception.add(rcLogoMesh);
  const rcLogoFront = rcLogoMesh.clone(); rcLogoFront.position.set(RCX, .5, RCZ - .31); rcLogoFront.rotation.y = Math.PI; reception.add(rcLogoFront);

  // Teal glow strip under desk front
  const rcGlow = new THREE.Mesh(new THREE.BoxGeometry(2.2, .02, .02), MB(0x4D9FFF));
  rcGlow.position.set(RCX, .05, RCZ + .3); reception.add(rcGlow);
  const rcLight = new THREE.PointLight(0x4D9FFF, 0.4, 3.5, 2);
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

  // Reception chair (behind desk)
  const rcChairSeat = new THREE.Mesh(new THREE.BoxGeometry(.4, .04, .4), M(0x37474F));
  rcChairSeat.position.set(RCX - .4, .44, RCZ - .4); reception.add(rcChairSeat);
  const rcChairBack = new THREE.Mesh(new THREE.BoxGeometry(.4, .42, .04), M(0x37474F));
  rcChairBack.position.set(RCX - .4, .67, RCZ - .59); reception.add(rcChairBack);
  const rcPole = new THREE.Mesh(new THREE.BoxGeometry(.05, .38, .05), M(0x94A3B8));
  rcPole.position.set(RCX - .4, .2, RCZ - .4); reception.add(rcPole);
  const rcBase = new THREE.Mesh(new THREE.CylinderGeometry(.22, .26, .04, 10), M(0x64748B));
  rcBase.position.set(RCX - .4, .02, RCZ - .4); reception.add(rcBase);

  // RECEPTION AGENT — "NEXUS" (white/silver, the coordinator)
  const nexusAgent = { name: 'WAHYU FS', color: 0xF59E0B, hex: '#F59E0B', role: 'Founder / CEO', hair: 0x1a1a1a, shirt: 0xB45309, pants: 0x292524 };
  const nexusChar = buildChar(nexusAgent, false);
  const hMult = (looksOf ? looksOf(nexusAgent).h : 1.04) || 1.04;
  if (nexusChar.scale && nexusChar.scale.set) {
    nexusChar.scale.set(2.2, 2.2 * hMult, 2.2);
  } else if (nexusChar.scale && nexusChar.scale.setScalar) {
    nexusChar.scale.setScalar(2.2);
  }
  nexusChar.position.set(RCX - .4, .04, RCZ - .4); // behind desk
  nexusChar.rotation.y = Math.PI; // face +Z toward visitors
  reception.add(nexusChar);

  // Label Founder (plat sama seperti agent lain)
  const nxLabel = makeLabel(nexusAgent);
  nxLabel.scale.set(3.2, .8, 1); nxLabel.position.set(RCX - .4, 3.3, RCZ - .4);
  reception.add(nxLabel);

  office.add(reception);

  return { reception, rcLight, nexusChar, nxLabel, nexusAgent };
}
