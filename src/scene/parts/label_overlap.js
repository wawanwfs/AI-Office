// Anti-overlap label: pass kolisi berpasangan (diekstrak dari OfficeScene.js).
// pts: array {x, y, offX, offY, zone?, zt?, sw?, sh?, zw?, zh?} — koordinat & offset dalam piksel layar.
// Murni: mutasi offX/offY saja, tanpa THREE/canvas — unit-testable.

// PAD = breathing room: box diperluas per sisi supaya label tak "menempel" (<5px gap)
export const PAD_AGENT = 30;
export const PAD_ZONE = 46; // zona lebih sensitif: breathing room lebih besar

export const K_AGENT_AGENT = 1.2;   // dorongan dua arah agent↔agent
export const K_AGENT_BARRIER = 2.4; // agent bergeser penuh dari penghalang
export const K_ZONE_FROM_ZONE = 1.8;// zona digeser menjauh dari penghalang lain
export const K_AGENT_PUSHED = 1.6;  // agent didorong keluar dari zona
export const K_ZONE_TAG_ALONG = 0.8;// zona ikut geser sedikit saat agent vs zona
export const K_ZONE_TAG_X = 1.1;

// Satu pass penuh (5 iterasi kolisi berpasangan) — mutasi offX/offY pts.
export function overlapPass(pts, iters = 5) {
  for (let iter = 0; iter < iters; iter++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = 0; j < i; j++) {
        const zi = (pts[i].zone || pts[j].zone), PAD = zi ? PAD_ZONE : PAD_AGENT,
          lwi = (pts[i].sw || pts[i].zw || 0) + PAD, lhi = (pts[i].sh || pts[i].zh || 0) + PAD,
          lwj = (pts[j].sw || pts[j].zw || 0) + PAD, lhj = (pts[j].sh || pts[j].zh || 0) + PAD;
        const dx = Math.abs(pts[i].x - pts[j].x), dy = Math.abs((pts[i].y + pts[i].offY) - (pts[j].y + pts[j].offY));
        if (dx < (lwi + lwj) / 2 && dy < (lhi + lhj) / 2) {
          // geser vertikal dulu; bila vertikal mentok, geser horizontal ke arah bebas
          const h2 = ((lhi + lhj) / 2) - dy, w2 = ((lwi + lwj) / 2) - dx;
          if (pts[i].zone && pts[j].zone) { // dua penghalang (zona vs bubble): zona label yang digeser menjauh
            const zi2 = pts[i].zt ? i : (pts[j].zt ? j : -1), other = zi2 === i ? j : i;
            if (zi2 >= 0) {
              const h2b = ((lhi + lhj) / 2) - dy, w2b = ((lwi + lwj) / 2) - dx, up = pts[zi2].y < pts[other].y ? -1 : 1;
              pts[zi2].offY += up * h2b * K_ZONE_FROM_ZONE; const dz2 = (pts[zi2].x >= pts[other].x) ? 1 : -1; pts[zi2].offX += dz2 * w2b;
            }
          }
          else if (!pts[i].zone && !pts[j].zone) { // agent-agent: saling dorong dua arah
            pts[i].offY += h2 * K_AGENT_AGENT; pts[j].offY -= h2 * K_AGENT_AGENT;
            const dir = (pts[i].x >= pts[j].x) ? 1 : -1; pts[i].offX += dir * w2 * K_AGENT_AGENT; pts[j].offX -= dir * w2 * K_AGENT_AGENT;
          }
          else if (!pts[i].zone) { // agent vs penghalang: agent bergeser penuh
            pts[i].offY += h2 * K_AGENT_BARRIER; const dir = (pts[i].x >= pts[j].x) ? 1 : -1; pts[i].offX += dir * w2 * K_AGENT_AGENT;
            // jika penghalang adalah label zona, zona ikut geser sedikit — kluster padat zona+agent bisa over-cap agent
            if (pts[j].zt) { pts[j].offY -= h2 * K_ZONE_TAG_ALONG; pts[j].offX -= dir * w2 * K_ZONE_TAG_X; }
          }
          else if (!pts[j].zone) {
            pts[j].offY -= h2 * K_AGENT_PUSHED; const dir = (pts[j].x >= pts[i].x) ? 1 : -1; pts[j].offX += dir * w2 * 0.9;
          }
        }
      }
    }
  }
}
