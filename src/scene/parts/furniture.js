// Perabot kantor WFS Project — ditulis ulang dengan pola "builder" berbasis data.
// Setiap builder menerima konteks { THREE, office, M, MB, rng } dan mengembalikan referensi yang dibutuhkan scene.
import { POSTERS, POSTER_Y, POSTER_W, POSTER_H, CANVAS_W, CANVAS_H, posterLineY, posterOffset, posterFacing } from './poster_spec.js';
export function createFurniture(ctx /* hooks disiapkan utk ekstensi */) {
  const { THREE, office, M, MB, rng } = ctx;
  const box = (w, h, d, mat, x, y, z, parent = office, cast = false) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (cast) m.castShadow = true;
    parent.add(m);
    return m;
  };

  // ── Dispenser air minum ──
  const dispenser = new THREE.Group();
  box(0.3, 0.6, 0.3, M(0xdfe6ee), -10.5, 0.3, 0, dispenser);
  box(0.24, 0.28, 0.24, M(0x7fb8ea), -10.5, 0.74, 0, dispenser);
  box(0.08, 0.06, 0.08, M(0x4a6a86), -10.5, 0.5, 0.17, dispenser);
  office.add(dispenser);

  // ── Tanaman pot ──
  const addPlant = (px, pz, big = false) => {
    const k = big ? 1.3 : 1;
    box(0.3 * k, 0.24 * k, 0.3 * k, M(0xcfd8dc), px, 0.12 * k, pz, office, true);
    const count = big ? 5 : 3;
    for (let i = 0; i < count; i++) {
      const w = (0.1 + rng.r(0, 0.12)) * k;
      const h = (0.22 + rng.r(0, 0.26)) * k;
      const leaf = box(w, h, 0.1 * k, M(rng.n() > 0.5 ? 0x5fae63 : 0x2f7d3a),
        px + rng.r(-0.07, 0.07) * k, 0.3 * k + i * 0.17 * k, pz + rng.r(-0.07, 0.07) * k);
      leaf.rotation.y = rng.r(0, Math.PI);
      leaf.castShadow = true;
    }
  };
  [[-11, 8, true], [-11, -8], [11, -8], [-2, -8], [-6, 8, true]].forEach(([x, z, b]) => addPlant(x, z, b));

  // ── Rak buku rendah (dinding kiri) ──
  const spines = [0x3f7cf0, 0xe8504f, 0xf0a42a, 0x7a4cf5, 0x16c07a];
  for (let row = 0; row < 3; row++) {
    const y = 0.5 + row * 0.55;
    box(1.9, 0.05, 0.32, M(0xcfd8e3), -11.5, y, -5);
    spines.forEach((c, i) => box(0.13, 0.34 + rng.r(0, 0.16), 0.22, M(c), -12.2 + i * 0.31, y + 0.2, -5));
  }

  // ── Printer/fotokopi ──
  const printer = new THREE.Group();
  box(0.62, 0.5, 0.45, M(0xb4b9bf), 3, 0.25, -8, printer);
  box(0.74, 0.46, 0.52, M(0xe2e5e8), 3, 0.73, -8, printer, true);
  box(0.74, 0.05, 0.54, M(0xc7ccd1), 3, 0.98, -8, printer);
  box(0.5, 0.03, 0.34, M(0xfafafa), 3, 0.62, -7.7, printer);
  box(0.22, 0.12, 0.02, M(0x2f3338), 3, 0.78, -7.73, printer);
  box(0.04, 0.04, 0.02, MB(0x00e676), 3.26, 0.78, -7.73, printer);
  office.add(printer);

  // ── Sofa lounge ──
  const SX = 10.5, SZ = 6;
  const sofa = new THREE.Group();
  box(0.72, 0.36, 2.1, M(0x35454f), SX, 0.18, SZ, sofa, true);
  box(0.56, 0.13, 1.9, M(0x475d69), SX - 0.06, 0.42, SZ, sofa);
  box(0.13, 0.42, 1.9, M(0x475d69), SX + 0.35, 0.56, SZ, sofa);
  [-1, 1].forEach((s) => box(0.72, 0.26, 0.16, M(0x35454f), SX, 0.3, SZ + s * 1.06, sofa));
  box(0.5, 0.045, 1.0, M(0xdce3ea), SX - 0.72, 0.38, SZ, sofa);
  [[-0.2, -0.42], [-0.2, 0.42], [0.2, -0.42], [0.2, 0.42]].forEach(([dx, dz]) =>
    box(0.045, 0.36, 0.045, M(0xb5c3d1), SX - 0.72 + dx, 0.18, SZ + dz, sofa));
  [[0xff5252, -0.15, 0.2], [0x448aff, 0.15, -0.15]].forEach(([c, dz, ry]) => {
    const mag = box(0.3, 0.016, 0.22, M(c), SX - 0.72, 0.4, SZ + dz, sofa);
    mag.rotation.y = ry;
  });
  office.add(sofa);

  // ── Pantry mini (counter + kopi + microwave) ──
  const pantry = new THREE.Group();
  box(1.7, 0.8, 0.5, M(0xdde4ec), -10.5, 0.4, 2.5, pantry, true);
  box(1.8, 0.045, 0.6, M(0xe9edf1), -10.5, 0.82, 2.5, pantry);
  box(0.26, 0.36, 0.22, M(0x30343a), -10.8, 1.02, 2.5, pantry, true);
  box(0.28, 0.03, 0.24, M(0x1f2226), -10.8, 1.2, 2.5, pantry);
  box(0.15, 0.04, 0.04, M(0x666c72), -10.8, 0.88, 2.42, pantry);
  box(0.03, 0.03, 0.01, MB(0x0deef3), -10.72, 1.1, 2.39, pantry);
  box(0.2, 0.08, 0.2, M(0xffffff), -10.2, 0.88, 2.5, pantry);
  [0xff5252, 0xf5a623, 0x00e676].forEach((c) =>
    box(0.045, 0.045, 0.045, M(c), -10.2 + rng.r(-0.06, 0.06), 0.93, 2.5 + rng.r(-0.06, 0.06), pantry));
  box(0.36, 0.22, 0.26, M(0xe3e6e9), -10.5, 0.95, 2.5, pantry);
  box(0.3, 0.18, 0.02, M(0x101214), -10.5, 0.95, 2.36, pantry);
  office.add(pantry);

  // ── Poster dinding samping (slogan WFS) — data di parts/poster_spec.js ──
  POSTERS.forEach((p) => {
    box(0.04, 0.72, 0.52, M(0x262a31), p.x, POSTER_Y, p.z, office, true);
    const cv = document.createElement('canvas');
    cv.width = CANVAS_W; cv.height = CANVAS_H;
    const g = cv.getContext('2d');
    g.fillStyle = '#14172b'; g.fillRect(0, 0, CANVAS_W, CANVAS_H);
    g.strokeStyle = p.c; g.lineWidth = 3; g.strokeRect(6, 6, 108, 148);
    g.fillStyle = p.c; g.font = 'bold 15px sans-serif'; g.textAlign = 'center';
    g.shadowColor = p.c; g.shadowBlur = 6;
    p.t.split(' ').forEach((w, i) => g.fillText(w, 60, posterLineY(i)));
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(POSTER_W, POSTER_H), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) }));
    plane.position.set(p.x + posterOffset(p.x), POSTER_Y, p.z);
    plane.rotation.y = posterFacing(p.x);
    office.add(plane);
  });

  return { addPlant, dispenser, printer, sofa, pantry };
}
