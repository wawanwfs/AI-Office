// Unit test logika murni scene: routing koridor & jadwal meeting.
import { describe, it, expect } from 'vitest';
import { routePath, FRONT, GANGS, bandOf } from '../scene/parts/routing.js';
import { OBSTACLES, inObstacle, seatOccupied } from '../scene/parts/obstacles.js';
import { MEETING_WINDOWS, isMeetingTime, meetingWindowIndex } from '../scene/parts/meeting.js';

// Meja agent per band (dipakai untuk cek lintasan tidak menembus zona meja).
const DESKS = [
  { band: 0, zs: [-3] },     // baris belakang
  { band: 1, zs: [1.5] },    // baris tengah
  { band: 2, zs: [6] },      // baris depan
];
// Zona meja agent ±0.9 di z, x bebas — lintasan aman bila setiap segmen
// vertikal (x tetap) hanya menyentuh z di koridor (FRONT/GANGS) atau di z tujuan.
function crossingDesks(path, a, b) {
  const deskZ = [ -3, 1.5, 6 ];
  const pts = [a, ...path];
  let violations = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    // hanya segmen vertikal yang bisa menembus baris meja
    if (Math.abs(p.x - q.x) > 1e-6) continue;
    const z0 = Math.min(p.z, q.z), z1 = Math.max(p.z, q.z);
    const x = p.x;
    for (const dz of deskZ) {
      // meja ditembus bila segmen vertikal melintas melewati z meja TANPA
      // berada di koridor/gang (jarak x ke meja rekan tak relevan: baris penuh)
      if (z0 < dz - 0.05 && z1 > dz + 0.05) {
        const nearCorridor = [FRONT, GANGS].flat().some((cz) => Math.abs(cz - dz) < 1.3);
        // lintasan via koridor depan/gang legal (koridor memang sejajar baris meja);
        // pelanggaran = vertikal murni menembus z meja di x mana pun
        if (!nearCorridor) violations.push({ x, dz, seg: [p, q] });
      }
    }
  }
  return violations;
}

describe('routing.routePath', () => {
  it('lintasan beda band menyentuh koridor & gang, tidak ada segmen menembus baris meja', () => {
    const cases = [
      [{ x: -4, z: -3 }, { x: 8, z: 6 }],   // belakang → depan
      [{ x: 4, z: 1.5 }, { x: -10, z: -3 }],// tengah → belakang
      [{ x: -8, z: 6 }, { x: 10, z: 1.5 }], // depan → tengah
      [{ x: 0, z: -3 }, { x: 4, z: 6 }],    // melintasi 2 band
    ];
    for (const [a, b] of cases) {
      const path = routePath(a, b);
      expect(path.length).toBeGreaterThan(0);
      // semua waypoint di koridor depan baris atau gang antar-baris
      for (const p of path) {
        const inCorr = FRONT.includes(p.z) || GANGS.includes(p.z);
        const atEndpoint = Math.abs(p.z - a.z) < 0.3 || Math.abs(p.z - b.z) < 0.3;
        expect(inCorr || atEndpoint, `waypoint ${JSON.stringify(p)} harus di koridor/gang atau titik ujung`).toBe(true);
      }
      expect(crossingDesks(path, a, b)).toEqual([]);
    }
  });

  it('satu band dekat: langsung tanpa waypoint (tidak menembus apa pun)', () => {
    const path = routePath({ x: 4, z: 6 }, { x: 5, z: 6 });
    expect(path).toEqual([]);
  });

  it('satu band jauh: lewat koridor depan band asal', () => {
    const a = { x: -2, z: 6 }, b = { x: 10, z: 6 };
    const path = routePath(a, b);
    expect(path).toEqual([{ x: -2, z: FRONT[2] }, { x: 10, z: FRONT[2] }]);
    expect(crossingDesks(path, a, b)).toEqual([]);
  });

  it('bandOf klasifikasi tiga baris dengan benar', () => {
    expect(bandOf(-5)).toBe(0);
    expect(bandOf(0)).toBe(1);
    expect(bandOf(5)).toBe(2);
  });
});

describe('meeting windows', () => {
  it('dua jendela rapat 10:00–10:30 dan 14:00–14:30', () => {
    expect(MEETING_WINDOWS).toEqual([[600, 630], [840, 870]]);
  });
  it('isMeetingTime tepat di tepi jendela', () => {
    expect(isMeetingTime(600)).toBe(true);
    expect(isMeetingTime(630)).toBe(true);
    expect(isMeetingTime(599)).toBe(false);
    expect(isMeetingTime(631)).toBe(false);
    expect(isMeetingTime(840)).toBe(true);
    expect(isMeetingTime(871)).toBe(false);
  });
  it('meetingWindowIndex mengembalikan 0/1 di dalam, -1 di luar', () => {
    expect(meetingWindowIndex(610)).toBe(0);
    expect(meetingWindowIndex(850)).toBe(1);
    expect(meetingWindowIndex(700)).toBe(-1);
  });
});

describe('obstacles', () => {
  it('footprint furnitur terdefinisi & titik pusatnya terdeteksi', () => {
    expect(OBSTACLES.length).toBe(5);
    // pusat counter pantry, printer, sofa lounge
    expect(inObstacle(-10.5, 2.55)).toBe(true);   // pantry counter
    expect(inObstacle(3.0, -7.9)).toBe(true);     // printer
    expect(inObstacle(10.5, 6.0)).toBe(true);     // sofa lounge
    expect(inObstacle(-9.5, 7.5)).toBe(true);     // counter café
  });

  it('titik bebas (koridor, meja kosong) tidak dianggap rintangan', () => {
    expect(inObstacle(0, 4.85)).toBe(false);      // koridor depan band 2
    expect(inObstacle(-4, -0.75)).toBe(false);    // gang
    expect(inObstacle(0, 6)).toBe(false);         // baris meja (bukan furnitur)
  });

  it('seatOccupied: zona ±0.9 sekitar home rekan terisi, offsite tidak', () => {
    const agents = [
      { agent: { name: 'A' }, home: { x: 4, z: 6 }, state: 'sitting' },
      { agent: { name: 'B' }, home: { x: -4, z: -3 }, state: 'offsite' },
    ];
    expect(seatOccupied(4.5, 6.2, agents, { name: 'X' })).toBe(true);   // dekat A
    expect(seatOccupied(-4.3, -2.8, agents, { name: 'X' })).toBe(false); // B offsite
    expect(seatOccupied(4, 6, agents, agents[0].agent)).toBe(false);     // self dikecualikan
  });
});
