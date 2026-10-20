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
