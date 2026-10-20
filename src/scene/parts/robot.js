// Robot asisten "Bantuin AI" — bukan manusia: badan logam, kepala kapsul, mata LED, antena, panel dada menyala.
import { pose, ROBOT_COLORS } from './robot_spec.js';

export function buildRobot(THREE, agent, standing, M, MB) {
  const g = new THREE.Group();
  const glow = agent.color;                  // hijau neon Bantuin
  const metal = ROBOT_COLORS.metal, dark = ROBOT_COLORS.dark, mid = ROBOT_COLORS.mid;
  const { hipY, tz, fz, ty, hy } = pose(standing); // koordinat kunci per pose
  const shiny = (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.75, roughness: 0.28 });
  const glowMat = (c) => new THREE.MeshBasicMaterial({ color: c }); // eslint-disable-line no-unused-vars -- helper materi glow
  const halo = (r, c, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.28, depthWrite: false })); m.position.set(x, y, z); g.add(m); };
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const cyl = (rt, rb, h, mat, x, y, z, seg = 14) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); g.add(m); return m; };
  const sph = (r, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), mat); m.position.set(x, y, z); g.add(m); return m; };

  // Koordinat dasar per pose (dari robot_spec.js)

  // ── Kaki ──
  if (standing) {
    [-1, 1].forEach((sd) => {
      const leg = box(0.1, 0.5, 0.1, M(mid), sd * 0.075, 0.26, 0);
      leg.userData.isLeg = true; leg.userData.phase = sd > 0 ? 0 : Math.PI;
      box(0.13, 0.06, 0.2, M(dark), sd * 0.075, 0.03, 0.03);
    });
  } else {
    [-1, 1].forEach((sd) => {
      box(0.11, 0.1, 0.26, M(mid), sd * 0.085, 0.44, -0.08);
      box(0.1, 0.3, 0.1, M(mid), sd * 0.085, 0.24, -0.2);
      box(0.13, 0.06, 0.18, M(dark), sd * 0.085, 0.07, -0.24);
    });
  }
  box(0.26, 0.1, 0.16, M(dark), 0, hipY, tz);

  // ── Torso: dua pelat logam + panel dada menyala ──
  { const tr = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.2), shiny(0xd5dde5)); tr.position.set(0, ty, tz); tr.castShadow = true; g.add(tr); }
  box(0.36, 0.03, 0.22, MB(glow), 0, ty - 0.17, tz);          // garis aksen neon pinggang
  box(0.36, 0.05, 0.22, M(mid), 0, ty + 0.19, tz);           // bahu
  box(0.2, 0.14, 0.012, MB(0x07141a), 0, ty + 0.02, tz + fz * 0.106);
  const bars = [0.04, 0.08, 0.06];
  bars.forEach((h, i) => box(0.035, h, 0.014, MB(glow), -0.055 + i * 0.055, ty + 0.02 - 0.03 + h / 2, tz + fz * 0.112));
  box(0.05, 0.05, 0.014, MB(0xffffff), 0.1, ty + 0.12, tz + fz * 0.108);     // lampu status

  // ── Lengan segmen + sendi bulat ──
  const armY = ty + 0.04;
  [-1, 1].forEach((sd) => {
    sph(0.06, M(dark), sd * 0.215, armY + 0.12, tz);
    if (standing) {
      box(0.075, 0.2, 0.075, M(mid), sd * 0.215, armY, tz);
      sph(0.045, M(dark), sd * 0.215, armY - 0.12, tz);
      box(0.065, 0.16, 0.065, M(metal), sd * 0.215, armY - 0.22, tz);
      box(0.09, 0.07, 0.07, M(dark), sd * 0.215, armY - 0.33, tz);
    } else {
      box(0.075, 0.16, 0.075, M(mid), sd * 0.2, armY - 0.03, tz - 0.06).rotation.x = 0.5;
      box(0.065, 0.2, 0.065, M(metal), sd * 0.18, armY - 0.06, tz - 0.22).rotation.x = 1.45;
      box(0.09, 0.05, 0.08, M(dark), sd * 0.18, armY - 0.05, tz - 0.34);
    }
  });

  // ── Leher + kepala kapsul ──
  cyl(0.045, 0.055, 0.07, M(dark), 0, hy - 0.13, tz);
  const hd = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.1, 6, 16), shiny(0xe6edf3)); hd.position.set(0, hy, tz); hd.scale.set(1, 1, 0.9); hd.castShadow = true; g.add(hd);
    [-1, 1].forEach((sd) => cyl(0.05, 0.05, 0.05, M(dark), sd * 0.17, hy, tz).rotation.z = Math.PI / 2); // telinga/speaker
  // Layar wajah gelap + 2 mata LED + senyum
  box(0.23, 0.15, 0.012, MB(0x050d12), 0, hy + 0.0, tz + fz * 0.134);
  [-1, 1].forEach((sd) => { box(0.055, 0.065, 0.014, MB(glow), sd * 0.058, hy + 0.025, tz + fz * 0.143); halo(0.05, glow, sd * 0.058, hy + 0.025, tz + fz * 0.15); });
  box(0.1, 0.014, 0.014, MB(glow), 0, hy - 0.045, tz + fz * 0.143);
  box(0.03, 0.014, 0.014, MB(glow), -0.06, hy - 0.035, tz + fz * 0.143);
  box(0.03, 0.014, 0.014, MB(glow), 0.06, hy - 0.035, tz + fz * 0.143);

  // ── Antena dengan bola menyala ──
  cyl(0.012, 0.012, 0.16, shiny(0x556070), 0, hy + 0.25, tz);
  sph(0.035, MB(0xffffff), 0, hy + 0.34, tz); halo(0.075, glow, 0, hy + 0.34, tz);

  g.userData.isRobot = true;
  return g;
}
