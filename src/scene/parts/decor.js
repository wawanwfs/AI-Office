// Dekorasi tambahan kantor WFS Project: poster motivasi, tanaman besar sudut,
// partisi kaca antar tim, rug area tengah, lampu lantai hangat.
// Builder berbasis konteks (THREE, office, M, drawPoster) — pola sama dgn furniture.js.
import { drawPoster } from './poster_canvas.js';

export function createDecor(ctx) {
  const { THREE, office, M } = ctx;
  const add = (m) => office.add(m);

  // Poster motivasi (teks, warna, x) — kanvas 256×340 + plane 1.1×1.45 di dinding belakang
  const posterMeshes = [['SHIP IT', '#F59E0B', 3.0], ['CODE\nCOFFEE', '#F472B6', 5.2]].map(([txt, col, x]) => {
    const pc = document.createElement('canvas'); pc.width = 256; pc.height = 340;
    drawPoster(pc.getContext('2d'), txt, col);
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.45), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pc) }));
    pm.position.set(x + 5.0, 2.4, 9.2); pm.rotation.y = Math.PI;
    add(pm); return pm;
  });

  // Tanaman besar di sudut (pot + 5 helai daun per tanaman)
  const plants = [[11.4, -8.6], [-11.4, 8.6], [11.4, 8.6]].map(([x, z]) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(.35, .28, .55, 10), M(0x8B5E3C));
    pot.position.set(x, .28, z); add(pot);
    const leaves = [];
    for (let i = 0; i < 5; i++) {
      const lf = new THREE.Mesh(new THREE.SphereGeometry(.38 - i * .03, 8, 6), M(i % 2 ? 0x2E7D32 : 0x43A047));
      lf.position.set(x + Math.sin(i * 1.9) * .15, .85 + i * .32, z + Math.cos(i * 1.9) * .15);
      add(lf); leaves.push(lf);
    }
    return { pot, leaves };
  });

  // Partisi kaca rendah antar kelompok tim (tampilan zona)
  const partitions = [[-6, -0.8], [-2, -0.8], [2, -0.8]].map(([x, z]) => {
    const gl = new THREE.Mesh(new THREE.BoxGeometry(.04, .9, 2.2), new THREE.MeshLambertMaterial({ color: 0x9ad8ff, transparent: true, opacity: .18 }));
    gl.position.set(x, .5, z + 0.3); gl.rotation.y = 0; gl.renderOrder = 2;
    add(gl); return gl;
  });

  // Rug dekoratif area tengah (biru luar + oranye dalam)
  const rug = new THREE.Mesh(new THREE.BoxGeometry(3.6, .015, 2.4),
    new THREE.MeshLambertMaterial({ color: 0x1565C0, transparent: true, opacity: .85 }));
  rug.position.set(0, .02, 4.5); rug.receiveShadow = true; add(rug);
  const rugInner = new THREE.Mesh(new THREE.BoxGeometry(2.6, .017, 1.6),
    new THREE.MeshLambertMaterial({ color: 0xEF6C00, transparent: true, opacity: .85 }));
  rugInner.position.set(0, .022, 4.5); add(rugInner);

  // Lampu lantai hangat di area lounge
  const loungeLight = new THREE.PointLight(0xFFC97A, .9, 9, 1.6);
  loungeLight.position.set(-9.5, 2.4, -1); add(loungeLight);

  return { posterMeshes, plants, partitions, rug, rugInner, loungeLight };
}
