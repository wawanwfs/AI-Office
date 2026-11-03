// parts/pedestal.js — Pedestal dasar kampus WFS (pola builder murni structure/terraces):
// konteks di-inject { THREE, M, MB, group }, tanpa dependensi global — unit-testable.
//
// Latar belakang (vision_analyze siklus 238): tepi dek kampus 34×27 m "terpotong
// kertas" terhadap void latar 0x010A28 — dek terlihat mengambang tanpa bobot.
// Perbaikan ADITIF (tanpa menyentuh mesh lama): plinth tegas di bawah dek,
// bayangan kontak lembut menjalar di sekeliling dasar, dan glow rim bawah.
//
// GEOMETRI (revisi 239 setelah audit visual: versi pertama TAK TERLIHAT —
// plinth top -0.08 tertanam di volume dek L1 (bawah dek -0.20), wajah depan
// plinth z=-13.52 di belakang bibir dek (z=-13.9), warna nyaris = void):
//   • plinth top -0.24 → SELURUHNYA di bawah dek terendah (bawah dek L1 = -0.20)
//   • wajah depan z=-14.05 → 0.15 m DI DEPAN bibir dek → tak tertutup overhang
//   • tinggi wajah 0.9 m ≈ 22 px pada zoom home → jelas terbaca
//   • warna 0x0D1B2E lebih terang dari void 0x010A28 + lip emas (bahasa terraces)
// Semua di Y NEGATIF — tidak menambah permukaan walkable, agen & jalur tak tersentuh.
import { drawPlatformShadow } from './pedestal_canvas.js';

// Parameter satu sumber (diuji unit); nilai dalam satuan dunia scene (meter).
export const PLINTH = {
  W: 35.0,           // lebih lebar dari dek 34 m (bibir menggigit ±0.5 m)
  H: 0.9,            // tebal pedestal (wajah terlihat ±22 px di zoom home)
  TOP_Y: -0.24,      // di bawah dasar dek L1 (-0.20) → tidak tertanam di dek mana pun
  FRONT_Z: -14.05,   // 0.15 m di depan bibir dek L1 (z=-13.9) → tak terocclude
  LEN: 30.2,         // menjangkau dari depan (-14.05) sampai belakang kampus (z=16.15)
};
export const LIP = { H: 0.05, COLOR: 0xD4AF37 }; // garis emas di bibir atas (bahasa trim terraces)
export const SHADOW = {
  MARGIN: 3.2,       // menjalar per sisi di luar plinth
  Y: -1.16,          // sedikit di bawah dasar plinth (TOP_Y - H - 0.02)
  OPACITY: 0.5,
};
export const GLOW = { W: 33.6, H: 0.1, COLOR: 0x00E5FF, PROUD: 0.07 }; // cyan = bahasa LED L2

export function createPedestal({ THREE, M, MB, group }) {
  const g = new THREE.Group();
  const made = [];
  const P = PLINTH;
  const cz = P.FRONT_Z + P.LEN / 2;           // pusat Z plinth
  const cy = P.TOP_Y - P.H / 2;               // pusat Y plinth

  // 1) PLINTH — kotak tegas di bawah seluruh kampus
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(P.W, P.H, P.LEN), M(0x0D1B2E));
  plinth.position.set(0, cy, cz);
  plinth.receiveShadow = true;
  made.push(plinth);
  g.add(plinth);

  // 2) LIP emas di bibir atas plinth (kohesif dgn trim emas terasering)
  const lip = new THREE.Mesh(new THREE.BoxGeometry(P.W, LIP.H, 0.06), M(LIP.COLOR));
  lip.position.set(0, P.TOP_Y + LIP.H / 2, P.FRONT_Z + 0.03);
  made.push(lip);
  g.add(lip);

  // 3) BAYANGAN KONTAK — plane radial-gradient di bawah dasar plinth
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  drawPlatformShadow(sc.getContext('2d'));
  const shTex = new THREE.CanvasTexture(sc);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(P.W + SHADOW.MARGIN * 2, P.LEN + SHADOW.MARGIN * 2),
    new THREE.MeshBasicMaterial({ map: shTex, transparent: true, opacity: SHADOW.OPACITY, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, SHADOW.Y, cz);
  shadow.renderOrder = 1;
  shadow.userData.blob = true;
  made.push(shadow);
  g.add(shadow);

  // 4) GLOW RIM BAWAH — strip cyan di wajah depan plinth (sisi kamera), sedikit proud
  const glow = new THREE.Mesh(new THREE.BoxGeometry(GLOW.W, GLOW.H, 0.04), MB(GLOW.COLOR));
  glow.position.set(0, P.TOP_Y - P.H + GLOW.H / 2 + 0.06, P.FRONT_Z - GLOW.PROUD);
  glow.material.transparent = true;
  glow.material.opacity = 0.9;
  made.push(glow);
  g.add(glow);

  if (group) group.add(g);
  return { group: g, plinth, lip, shadow, glow, made };
}
