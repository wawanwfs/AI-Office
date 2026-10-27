// Selection & hover ring parameters (extracted from OfficeScene.js).
// Pure functions/constants only — no THREE, no canvas.

export const SEL_RING = {
  SIZE: 128,          // canvas px
  PLANE: 3.1,         // world units
  INNER: 46,          // gradient inner radius
  OUTER: 62,          // gradient outer radius
  MID: 0.68,          // gradient mid stop
  COLOR: 0xFFD75E,
  RGB: '255,205,80',
  OPACITY: 0.9,
  Y: 0.03,
};

export const HOVER_RING = {
  SIZE: 128,
  PLANE: 2.6,
  INNER: 44,
  OUTER: 62,
  MID: 0.7,
  COLOR: 0x9FE8FF,
  RGB: '120,220,255',
  OPACITY: 0.85,
  Y: 0.02,
};

const clampIdx = (i, n) => (i >= 0 && i < n) ? i : null;

// Which anchor object to attach the ring to: walker (moving),
// home + seat offset (sitting), or null (not visible in office).
export function selAnchorOf(a, SEAT_OFF = 0.55) {
  if (!a) return null;
  if (a.walker && a.walker.visible) return { x: a.walker.position.x, z: a.walker.position.z, off: 0 };
  if (a.sittingChar && a.sittingChar.visible) return { x: a.home.x, z: a.home.z, off: SEAT_OFF };
  return null;
}

// Resolve selected index to an agent, or null when out of range.
export function selectedAgent(agentData, selectedIdx) {
  const i = clampIdx(selectedIdx, agentData ? agentData.length : 0);
  return i === null ? null : agentData[i];
}

// Tinggi lantai ring di bawah agent: y walker saat berjalan (ikut bob &
// naik-turun lantai), y home saat duduk, 0 bila tak keduanya. Murni &
// null-safe — satu sumber kebenaran komponen Y untuk hover ring & sel ring
// (menggantikan formula inline `(walker.visible?pos.y:home.y)||0` yang
// duplikat 3× dan bisa melontarkan exception bila walker.position hilang).
export function ringFloorY(a) {
  if (!a) return 0;
  if (a.walker && a.walker.visible && a.walker.position) return a.walker.position.y || 0;
  if (a.home && Number.isFinite(a.home.y)) return a.home.y;
  return 0;
}

// Posisi penuh cincin hover utk satu hasil raycast hover: agent biasa →
// selAnchorOf + ringFloorY (satu sumber kebenaran dgn sel ring); hover nexus
// (agent null + isNexus) → posisi nexus statis. Selain itu null (ring disembunyikan).
// Murni & null-safe — menggantikan formula duplikat di handler pointermove
// DAN blok follow per-frame (2× → 1).
export function hoverRingPos(agent, isNexus, nexusPos) {
  if (agent) {
    const a = selAnchorOf(agent);
    if (a) return { x: a.x, y: ringFloorY(agent) + HOVER_RING.Y, z: a.z + a.off };
    return null;
  }
  if (isNexus && nexusPos && Number.isFinite(nexusPos.x) && Number.isFinite(nexusPos.y) && Number.isFinite(nexusPos.z)) {
    return { x: nexusPos.x, y: nexusPos.y + HOVER_RING.Y, z: nexusPos.z };
  }
  return null;
}

// Anchor cincin (hover/terpilih) utk FIGUR PESERTA RAPAT (createMeeting.figures,
// urutan = agentData): kursi rapat (seat) yang ditempati figur. Posisi dari
// figure.position itu sendiri (dipindah ke kursi oleh meeting.begin →
// placeFigure) — bukan dari home agen (mejanya kosong saat rapat).
// Return null bila figur tak valid/tersembunyi → ring disembunyikan.
// Murni & null-safe [regresi siklus 119].
export function meetingFigureAnchor(fig) {
  if (!fig || fig.visible === false || !fig.position) return null;
  const y = Number.isFinite(fig.position.y) ? fig.position.y : 0;
  return { x: fig.position.x, y, z: fig.position.z, off: 0 };
}
