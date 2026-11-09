// Selection & hover ring parameters (extracted from OfficeScene.js).
// Pure functions/constants only — no THREE, no canvas.
import { clamp01 } from '../../lib/math_util.js'

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

// Siklus 260: Kontrak laju rotasi cincin seleksi berbasis WAKTU-NYATA (rad/s),
// bukan rad/frame (bug kelas 251/259 ketiga: 0.012 rad/frame di SwiftShader/kiosk
// 0.4 FPS butuh ~21.8 menit per putaran penuh — cincin praktis beku; di 144 Hz
// 2.4× terlalu cepat). 60 FPS × 0.012 = 0.72 rad/s (putaran penuh ≈ 8.73 dtk).
export const SEL_RING_ROT_RATE = 0.72; // rad/detik

export function stepRingRotation(rotZ, dt) {
  const current = (typeof rotZ === 'number' && Number.isFinite(rotZ)) ? rotZ : 0;
  if (!(typeof dt === 'number' && Number.isFinite(dt)) || dt <= 0) return current;
  return current + SEL_RING_ROT_RATE * dt;
}

// Siklus 260: Laju damping eksponensial waktu-nyata (/detik) setara faktor per-frame 60 FPS:
// alpha = 1 - exp(-rate * dt) → rate = -ln(1 - alpha) * 60
// Untuk selRing: alpha = 0.25 → rate = -ln(0.75) * 60 ≈ 17.2609 /s
// Untuk hoverRing: alpha = 0.45 → rate = -ln(0.55) * 60 ≈ 35.8702 /s
export const SEL_RING_DAMP_RATE = 17.26;
export const HOVER_RING_DAMP_RATE = 35.87;

export function ringDampFactor(rate, dt) {
  if (!(typeof dt === 'number' && Number.isFinite(dt)) || dt <= 0) return 0;
  if (!(typeof rate === 'number' && Number.isFinite(rate)) || rate <= 0) return 0;
  const f = 1 - Math.exp(-rate * dt);
  return clamp01(f);
}

export function stepRingPosition(pos, target, factor) {
  if (!pos || !target) return false;
  const tx = Number.isFinite(target.x) ? target.x : pos.x;
  const ty = Number.isFinite(target.y) ? target.y : pos.y;
  const tz = Number.isFinite(target.z) ? target.z : pos.z;
  const f = (typeof factor === 'number' && Number.isFinite(factor)) ? clamp01(factor) : 0;
  if (f <= 0) return false;
  pos.x += (tx - pos.x) * f;
  pos.y += (ty - pos.y) * f;
  pos.z += (tz - pos.z) * f;
  return true;
}

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
// Siklus 260: mendukung fig mentah ATAU objek owner { figure } (unwrapping aman
// dari findMeetingFigureOwner sehingga hover ring tidak langsung lenyap di animate).
// Return null bila figur tak valid/tersembunyi → ring disembunyikan.
// Murni & null-safe [regresi siklus 119 / siklus 260].
export function meetingFigureAnchor(fig) {
  const f = (fig && fig.figure) ? fig.figure : fig;
  if (!f || f.visible === false || !f.position) return null;
  const y = Number.isFinite(f.position.y) ? f.position.y : 0;
  return { x: f.position.x, y, z: f.position.z, off: 0 };
}

export const FOUNDER_CHAIR_POS = { x: 7.6, y: 1.20, z: 6.1 };

// Siklus 260: Resolusi target posisi (x, y, z) cincin seleksi emas untuk
// 3 kondisi: Founder (-2), Peserta Rapat (mfa), Agen biasa duduk/jalan.
// Return null bila agen tak terlihat (offsite) atau index tak valid.
export function selRingTarget(agentData, selectedIdx, meetingFigures, founderPos = FOUNDER_CHAIR_POS) {
  if (selectedIdx === -2) {
    if (!founderPos || !Number.isFinite(founderPos.x) || !Number.isFinite(founderPos.y) || !Number.isFinite(founderPos.z)) {
      return null;
    }
    return { x: founderPos.x, y: founderPos.y + SEL_RING.Y, z: founderPos.z };
  }
  if (!Array.isArray(agentData) || selectedIdx < 0 || selectedIdx >= agentData.length) {
    return null;
  }
  const a = agentData[selectedIdx];
  if (!a) return null;
  const mfa = meetingFigureAnchor(meetingFigures ? meetingFigures[selectedIdx] : null);
  if (mfa) {
    return { x: mfa.x, y: mfa.y + SEL_RING.Y, z: mfa.z };
  }
  const p = selAnchorOf(a);
  if (!p) return null;
  return { x: p.x, y: ringFloorY(a) + SEL_RING.Y, z: p.z + p.off };
}

// Siklus 260: Satu sumber kebenaran target posisi cincin hover biru di animate() & handler pointermove
export function hoverRingTarget(hoveredAgent, isMfHover, nexusPos, isNexus = false) {
  if (isMfHover) {
    const mfa = meetingFigureAnchor(isMfHover);
    if (mfa) return { x: mfa.x, y: mfa.y + HOVER_RING.Y, z: mfa.z };
    return null;
  }
  return hoverRingPos(hoveredAgent, isNexus, nexusPos);
}
