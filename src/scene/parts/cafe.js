// Kafe / coffee bar kantor WFS Project (depan kiri): counter L, countertop,
// espresso machine, kettle + cangkir, menu board kanvas, 4 bar stool, snack fridge.
// Builder berbasis konteks (THREE, office, M, MB, drawMenuBoard) — pola sama dgn decor.js.
import { drawMenuBoard } from './sign_canvas.js';
import { uiTexture, uiMaterial } from './ui_colorspace.js';

export function createCafe(ctx) {
  const { THREE, office, M, MB, blobMat } = ctx;
  const cafe = new THREE.Group();
  cafe.position.y = 1.20; // Elevasi Lantai 3 (Executive Penthouse / Cafe Deck)
  const CFX = -9.5, CFZ = 7.5;
  // Counter L-shape
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(3.2, .95, .6), M(0x6D4C41));
  c1.position.set(CFX, .475, CFZ); c1.castShadow = true; cafe.add(c1);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(.6, .95, 1.6), M(0x6D4C41));
  c2.position.set(CFX + 1.6, .475, CFZ - 1); c2.castShadow = true; cafe.add(c2);
  if (blobMat) {
    const c1Shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.9), blobMat);
    c1Shadow.rotation.x = -Math.PI / 2;
    c1Shadow.position.set(CFX, 0.012, CFZ);
    c1Shadow.renderOrder = 2;
    c1Shadow.userData.blob = true;
    cafe.add(c1Shadow);

    const c2Shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), blobMat);
    c2Shadow.rotation.x = -Math.PI / 2;
    c2Shadow.position.set(CFX + 1.6, 0.012, CFZ - 1);
    c2Shadow.renderOrder = 2;
    c2Shadow.userData.blob = true;
    cafe.add(c2Shadow);
  }
  // Countertop
  const ct1 = new THREE.Mesh(new THREE.BoxGeometry(3.4, .05, .75), M(0xFFECB3));
  ct1.position.set(CFX, .975, CFZ); cafe.add(ct1);
  const ct2 = new THREE.Mesh(new THREE.BoxGeometry(.75, .05, 1.75), M(0xFFECB3));
  ct2.position.set(CFX + 1.6, .975, CFZ - 1); cafe.add(ct2);
  // Espresso machine
  const em = new THREE.Mesh(new THREE.BoxGeometry(.5, .35, .35), M(0x263238));
  em.position.set(CFX - .8, 1.17, CFZ - .05); cafe.add(em);
  const emG = new THREE.Mesh(new THREE.BoxGeometry(.1, .08, .02), MB(0x10E5A0));
  emG.position.set(CFX - .8, 1.1, CFZ + .13); cafe.add(emG);
  // Kettle + cups
  const kt = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, .18, 10), M(0x90A4AE));
  kt.position.set(CFX - .1, 1.09, CFZ); cafe.add(kt);
  const cups = [];
  for (let i = 0; i < 3; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(.04, .035, .06, 8), M(i === 0 ? 0xEF5350 : 0xFAFAFA));
    cup.position.set(CFX + .5 + i * .22, 1.03, CFZ + .15); cafe.add(cup); cups.push(cup);
  }
  // Menu board above counter
  const mbc = document.createElement('canvas'); mbc.width = 256; mbc.height = 140;
  drawMenuBoard(mbc.getContext('2d'));
  const mb = uiMaterial(new THREE.Mesh(new THREE.PlaneGeometry(1.7, .95), new THREE.MeshBasicMaterial({ map: uiTexture(new THREE.CanvasTexture(mbc)) })));
  mb.position.set(CFX, 2.3, CFZ + .35); cafe.add(mb);
  const mbB = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, .04), M(0x2A2A2A));
  mbB.position.set(CFX, 2.3, CFZ + .32); cafe.add(mbB);
  // Bar stools (oranye, 4 buah di depan counter)
  const stools = [[-1.1], [-.35], [.4], [1.15]].map(([ox]) => {
    const st = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .06, 12), M(0xFB8C00));
    seat.position.y = .62; st.add(seat);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .6, 8), M(0x555555));
    pole.position.y = .3; st.add(pole);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .03, 12), M(0x555555));
    base.position.y = .015; st.add(base);
    st.position.set(CFX + ox, 0, CFZ + 1); st.castShadow = true;
    cafe.add(st); return st;
  });
  // Coolbox / snack fridge
  const fr = new THREE.Mesh(new THREE.BoxGeometry(.55, 1.1, .5), M(0xECEFF1));
  fr.position.set(CFX + 2.5, .55, CFZ - .2); fr.castShadow = true; cafe.add(fr);
  if (blobMat) {
    const frShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7), blobMat);
    frShadow.rotation.x = -Math.PI / 2;
    frShadow.position.set(CFX + 2.5, 0.012, CFZ - 0.2);
    frShadow.renderOrder = 2;
    frShadow.userData.blob = true;
    cafe.add(frShadow);
  }
  const frG = new THREE.Mesh(new THREE.BoxGeometry(.4, .5, .02), MB(0x4FC3F7));
  frG.position.set(CFX + 2.5, .72, CFZ + .06); cafe.add(frG);
  office.add(cafe);
  return { cafe, CFX, CFZ, c1, c2, ct1, ct2, em, emG, kt, cups, menuBoard: mb, menuBoardBack: mbB, stools, fridge: fr, fridgeGlow: frG };
}
