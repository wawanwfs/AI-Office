// ═══════════════════════════════════════════════════
// CHARACTER PROPORTION SPEC — konstanta proporsi karakter
// Manusia (standing & sitting), anchor aksesori/badge/lanyard.
// Murni data + helper, tanpa THREE.
// ═══════════════════════════════════════════════════

// Nama dengan rambut panjang (strand di sisi kepala)
export const LONG_HAIR_RE = /DEWI|MAYA|RINA|LINA|SARI/i;

export function isLongHair(name) {
  return LONG_HAIR_RE.test(String(name ?? ''));
}

// ── STANDING — proporsi lebih manusiawi ──
// Sumbu: kaki y=.26 (h .52), hips y=.56, torso y=.79 (h .34),
// leher y=.99, kepala y=1.14 (h .22), jaw y=1.01, hidung y=1.13,
// telinga sd .13 y=1.13, mata y=1.16, mulut y=1.06,
// rambut top y=1.265, badge (.11,.86,.095), lanyard (.04,.84,.096)
export const STANDING = {
  legY: 0.26, legH: 0.52, legDX: 0.075,
  hipsY: 0.56,
  torsoY: 0.79,
  collarY: 0.965,
  buttonY: 0.8,
  armY: 0.8, forearmY: 0.62, handY: 0.51, armDX: 0.215,
  neckY: 0.99,
  headY: 1.14, jawY: 1.01,
  noseY: 1.13,
  earY: 1.13,
  eyeY: 1.16, pupilY: 1.155, browY: 1.215, eyeDX: 0.06,
  mouthY: 1.06,
  hairTopY: 1.265, hairBackY: 1.16, fringeY: 1.235,
  strandY: 1.05,
  badge: { x: 0.11, y: 0.86, z: 0.095 },
  lanyard: { x: 0.04, y: 0.84, z: 0.096 },
  // anchor addAccessories(g, agent, headY, fz, torsoY)
  accHeadY: 1.14, accFz: 1, accTorsoY: 0.8,
};

// ── SITTING — menghadap -Z (ke monitor) ──
// paha y=.44 z=-.08, shin y=.24 z=-.2, hips y=.5, torso y=.74,
// leher y=.955, kepala y=1.1, jaw y=.97, mata y=1.12 (z -.112),
// rambut top y=1.225, badge (.11,.8,.115), lanyard (.04,.78,.116)
export const SITTING = {
  thighY: 0.44, thighZ: -0.08, thighDX: 0.085,
  shinY: 0.24, shinZ: -0.2,
  shoeY: 0.07, shoeZ: -0.24,
  hipsY: 0.5,
  torsoY: 0.74, torsoZ: 0.02,
  collarY: 0.93,
  buttonY: 0.76,
  armY: 0.68, forearmY: 0.56, handY: 0.55, armDX: 0.215, handDX: 0.16,
  neckY: 0.955,
  headY: 1.1, jawY: 0.97,
  noseY: 1.09, noseZ: -0.105,
  earY: 1.09,
  eyeY: 1.12, pupilY: 1.115, browY: 1.175, eyeDX: 0.06, eyeZ: -0.112,
  mouthY: 1.02, mouthZ: -0.118,
  hairTopY: 1.225, hairBackY: 1.12, fringeY: 1.19,
  strandY: 0.98,
  badge: { x: 0.11, y: 0.8, z: 0.115 },
  lanyard: { x: 0.04, y: 0.78, z: 0.116 },
  accHeadY: 1.1, accFz: -1, accTorsoY: 0.74,
};

// Anchor aksesori per pose
export function accessoryAnchor(standing) {
  const P = standing ? STANDING : SITTING;
  return { headY: P.accHeadY, fz: P.accFz, torsoY: P.accTorsoY };
}

// Kepala & torso (dipakai buildChar untuk tinggi lompatan/nameplate dll)
export function charMetrics(standing) {
  const P = standing ? STANDING : SITTING;
  return { headY: P.headY, torsoY: P.torsoY };
}
