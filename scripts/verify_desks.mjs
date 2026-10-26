// Verifikasi numerik: semua meja DI DALAM dinding kampus 34x27 (±17/±13.5)
// dan tidak menabrak obstacle/reception/cafe/lounge/server room.
import { DESKS } from '../src/scene/parts/desk_layout.js';
import { EXTENDED_SPECIALISTS } from '../src/scene/parts/extended_desks.js';
import { OBSTACLES, inObstacle } from '../src/scene/parts/obstacles.js';
import { floorElevationAt } from '../src/scene/parts/floor_elevation.js';

const WALL_X = 17, WALL_Z = 13.5;
const MARGIN = 1.4; // meja+agen butuh ruang ~1.2m dari dinding

const all = [
  ...DESKS.map(d => ({ ...d, name: 'CORE' })),
  ...EXTENDED_SPECIALISTS.map(s => ({ ...s.desk, name: s.name, role: s.role })),
];

let bad = [];
for (const d of all) {
  const outWall = Math.abs(d.x) > WALL_X - MARGIN || Math.abs(d.z) > WALL_Z - MARGIN;
  const outElev = !Number.isFinite(floorElevationAt(d.z, d.x));
  const hitObs = inObstacle(d.x, d.z);
  // reception desk (RCX 8, RCZ 6.5 area 2x1.5) & zona lounge (8-12.4, 4.3-9.4) & cafe (-11.4..-6.9, 6.2..9.4)
  const hitRec = d.x > 6.8 && d.x < 9.4 && d.z > 5.3 && d.z < 7.8;
  const hitServer = d.x > 1.2 && d.x < 4.5 && d.z < -7.0;
  if (outWall || outElev || hitObs || hitRec || hitServer) {
    bad.push({ ...d, outWall, hitObs, hitRec, hitServer });
  }
}

// Cek tabrakan antar meja (jarak < 1.8)
let collide = [];
for (let i = 0; i < all.length; i++)
  for (let j = i + 1; j < all.length; j++) {
    const dx = all[i].x - all[j].x, dz = all[i].z - all[j].z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.8) collide.push(`${all[i].name || i}/${all[j].name || j}: ${dist.toFixed(2)}`);
  }

console.log('TOTAL DESKS:', all.length);
console.log('OUT_OF_ROOM:', bad.length ? JSON.stringify(bad) : 'NONE');
console.log('COLLISIONS:', collide.length ? collide.join(' | ') : 'NONE');
const floors = { L1: 0, L2: 0, L3: 0 };
all.forEach(d => { const z = d.z; floors[z < -0.8 ? 'L1' : z <= 4.5 ? 'L2' : 'L3']++; });
console.log('PER_FLOOR:', JSON.stringify(floors));
console.log(bad.length || collide.length ? 'FAIL' : 'ALL_DESKS_OK');
