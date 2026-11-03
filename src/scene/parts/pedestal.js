// parts/pedestal.js — Pedestal dasar kampus WFS (pola builder murni structure/terraces):
// konteks di-inject { THREE, M, MB, group }, tanpa dependensi global — unit-testable.
//
// Latar belakang (vision_analyze siklus 238): tepi dek kampus 34×27 m "terpotong
// kertas" terhadap void latar 0x010A28 — dek terlihat mengambang tanpa bobot.
// Perbaikan ADITIF (tanpa menyentuh mesh lama): plinth tegas di bawah bibir dek
// ( lebih gelap dari dek, bening-atas↔gelap-bawah ), bayangan kontak lembut
// menjalar di sekeliling dasar, dan glow rim bawah (diam-diam menyala — aksen
// tech, terang di kedua mode siang/malam karena MeshBasicMaterial).
// Semua di Y NEGATIF — tidak menambah permukaan walkable, agen & jalur tak tersentuh.
import { drawPlatformShadow } from './pedestal_canvas.js';

// Parameter satu sumber (diuji unit); nilai dalam satuan dunia scene (meter).
export const PLINTH = {
  W: 34.9,          // sedikit lebih lebar dari dek 34 m (bibir menggigit ±0.45 m)
  H: 0.55,          // tebal pedestal
  TOP_Y: -0.06,     // sedikit di bawah permukaan dek L1 (Y=0) → tak z-fight
  INSET_Z_NORTH: 0.45, // sisi belakang (z=+13.5) sedikit diinset — bayangan mengarah kamera
  GAP: 0.02,        // celah tipis agar tepi atas plinth tak menyatu dgn bibir dek
};
export const SHADOW = {
  MARGIN: 2.6,      // menjalar per sisi di luar plinth
  Y: -0.585,        // sedikit di bawah dasar plinth (top - 0.55 - 0.025)
  OPACITY: 0.42,
};
export const GLOW = { W: 33.6, H: 0.05, Y: -0.55, Z: -13.68, COLOR: 0x1BA8FF };

export function createPedestal({ THREE, M, MB, group }) {
  const g = new THREE.Group();
  const made = [];

  // 1) PLINTH — kotak tegas lebih gelap dari dek; bibir atas menggigit tepi dek
  //    (kamera iso memandang dari -Z/+Y: sisi depan & kiri/kanan yang terlihat).
  const P = PLINTH;
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(P.W, P.H, 27.0 + P.INSET_Z_NORTH),
    M(0x0B1526)
  );
  const cz = (-13.5 - P.GAP) + (27.0 + P.INSET_Z_NORTH) / 2; // pusat Z: bibir depan pas di bawah bibir dek
  plinth.position.set(0, P.TOP_Y - P.GAP - P.H / 2, cz);
  made.push(plinth);
  g.add(plinth);

  // strip aksen tipis di bibir atas depan plinth (garis "fondasi")
  const lip = new THREE.Mesh(new THREE.BoxGeometry(P.W, 0.02, 0.06), M(0x16233B));
  lip.position.set(0, P.TOP_Y - P.GAP + 0.01, -13.5 - P.GAP - 0.03);
  made.push(lip);
  g.add(lip);

  // 2) BAYANGAN KONTAK — plane radial-gradient di bawah dasar plinth
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  drawPlatformShadow(sc.getContext('2d'));
  const shTex = new THREE.CanvasTexture(sc);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(P.W + SHADOW.MARGIN * 2, 27.0 + P.INSET_Z_NORTH + SHADOW.MARGIN * 2),
    new THREE.MeshBasicMaterial({ map: shTex, transparent: true, opacity: SHADOW.OPACITY, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, SHADOW.Y, cz);
  shadow.renderOrder = 1;
  shadow.userData.blob = true;
  made.push(shadow);
  g.add(shadow);

  // 3) GLOW RIM BAWAH — strip tech di bibir bawah depan plinth (sisi kamera)
  const glow = new THREE.Mesh(new THREE.BoxGeometry(GLOW.W, GLOW.H, 0.04), MB(GLOW.COLOR));
  glow.position.set(0, GLOW.Y, GLOW.Z);
  glow.material.transparent = true;
  glow.material.opacity = 0.85;
  made.push(glow);
  g.add(glow);

  if (group) group.add(g);
  return { group: g, plinth, lip, shadow, glow, made };
}
