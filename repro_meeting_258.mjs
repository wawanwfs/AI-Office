// repro_meeting_258.mjs — repro pass oklusi dgn angka EKSAK probe_occ_state_258 poll#1
// RIAN (587.3,505.3) w73.4 h22.4 dist34.5 vs zona MEETING (627,504.5) w76.6 h17
// W=1366 → coords centered: x−683. Dy=0.8, dx=39.7 → ix*iy=667 ≥ areaZ*0.12=156.
import { occlusionPass } from './src/scene/parts/label_occlusion.js';

const W = 1366, H = 768;
const cx = (px) => px - W / 2;
const cy = (px) => 384 - px; // probe y = 384 − pts_y (NDC y-up)

const rian = {
  a: { name: 'RIAN' }, zone: false,
  x: cx(587.3), y: cy(505.3), offX: 0, offY: 0,
  sw: 73.4, sh: 22.4, dist: 34.5,
};
const meeting = {
  a: null, zone: true, zt: { id: 'MEETING' },
  x: cx(627), y: cy(504.5), offX: 0, offY: 0,
  zw: 76.6, zh: 17, baseY: 0, baseX: 0,
};
const pts = [rian, meeting];
const n = occlusionPass(pts);
console.log('faded count:', n);
console.log('rian.occ =', rian.occ);
console.log('meeting.occ =', meeting.occ);

// manual check
const dx = Math.abs(rian.x - meeting.x), dy = Math.abs(rian.y - meeting.y);
const ox = (rian.sw + meeting.zw) / 2, oy = (rian.sh + meeting.zh) / 2;
const ix = Math.max(0, ox - dx), iy = Math.max(0, oy - dy);
console.log({ dx: +dx.toFixed(1), dy: +dy.toFixed(1), ox: +ox.toFixed(1), oy: +oy.toFixed(1), ix: +ix.toFixed(1), iy: +iy.toFixed(1), area: +(ix * iy).toFixed(0), thr: +(meeting.zw * meeting.zh * 0.12).toFixed(0) });
