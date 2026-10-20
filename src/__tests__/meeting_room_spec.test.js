import { describe, it, expect } from 'vitest';
import {
  ROOM_CX, ROOM_CZ, GLASS_X, GLASS_Z, GLASS_H, TABLE,
  SEAT_DX, SEAT_DZ, meetingSeats, glassPanels, framePosts,
} from '../scene/parts/meeting_room_spec.js';

describe('meeting_room_spec', () => {
  it('pusat ruangan di (8, -3) — nilai historis', () => {
    expect(ROOM_CX).toBe(8);
    expect(ROOM_CZ).toBe(-3);
  });

  it('konstanta kaca sesuai nilai historis', () => {
    expect(GLASS_X).toBe(2.8);
    expect(GLASS_Z).toBe(2.75);
    expect(GLASS_H).toBe(3.5);
  });

  it('TABEL meja rapat 3.9×0.07×1.55 di y 0.72, kaki ±1.55', () => {
    expect(TABLE).toEqual({ w: 3.9, h: 0.07, d: 1.55, y: 0.72, legDX: 1.55 });
  });

  it('SEAT_DX tiga posisi & SEAT_DZ 1.1', () => {
    expect(SEAT_DX).toEqual([-1.4, 0, 1.4]);
    expect(SEAT_DZ).toBe(1.1);
  });

  it('meetingSeats menghasilkan 6 kursi (3 per sisi)', () => {
    const s = meetingSeats();
    expect(s).toHaveLength(6);
    expect(s.filter((x) => x.ry === 0)).toHaveLength(3);
    expect(s.filter((x) => x.ry === Math.PI)).toHaveLength(3);
  });

  it('kursi berada di depan & belakang meja (z = CZ ± 1.1)', () => {
    const s = meetingSeats();
    for (const dx of SEAT_DX) {
      expect(s).toContainEqual({ x: ROOM_CX + dx, z: ROOM_CZ - 1.1, ry: 0 });
      expect(s).toContainEqual({ x: ROOM_CX + dx, z: ROOM_CZ + 1.1, ry: Math.PI });
    }
  });

  it('kursi menghadap meja: belakang meja ry=0 (menghadap +z), depan ry=π', () => {
    const s = meetingSeats();
    for (const seat of s) {
      if (seat.z < ROOM_CZ) expect(seat.ry).toBe(0);
      else expect(seat.ry).toBe(Math.PI);
    }
  });

  it('kursi berada di atas papan meja (di dalam lebar meja)', () => {
    for (const seat of meetingSeats()) {
      expect(Math.abs(seat.x - ROOM_CX)).toBeLessThanOrEqual(TABLE.w / 2);
    }
  });

  it('glassPanels: 3 panel — kiri sepanjang z + 2 panel depan dengan celah pintu', () => {
    const p = glassPanels();
    expect(p).toHaveLength(3);
    expect(p[0]).toEqual({ w: 0.06, h: 3.5, d: 5.5, x: ROOM_CX - 2.8, z: ROOM_CZ });
    expect(p[1].x).toBeLessThan(ROOM_CX);
    expect(p[2].x).toBeGreaterThan(ROOM_CX);
    expect(p[1].w).toBe(1.8);
  });

  it('celah pintu antara dua panel depan ≥ 1 unit (agen bisa lewat)', () => {
    const [, a, b] = glassPanels();
    const gap = (b.x - b.w / 2) - (a.x + a.w / 2);
    expect(gap).toBeGreaterThanOrEqual(1);
  });

  it('panel kaca vertikal mencakup tinggi penuh (pusat = h/2)', () => {
    for (const p of glassPanels()) {
      expect(p.h).toBe(GLASS_H);
      expect(p.h / 2).toBe(1.75);
    }
  });

  it('framePosts: 4 tiang di sudut kaca (CX ± 2.8, CZ ± 2.75)', () => {
    const f = framePosts();
    expect(f).toHaveLength(4);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      expect(f).toContainEqual({ x: ROOM_CX + sx * 2.8, z: ROOM_CZ + sz * 2.75 });
    }
  });

  it('panel depan berpusat pada garis kaca z = CZ + GLASS_Z', () => {
    const [, a, b] = glassPanels();
    expect(a.z).toBeCloseTo(ROOM_CZ + GLASS_Z);
    expect(b.z).toBeCloseTo(ROOM_CZ + GLASS_Z);
  });

  it('custom center: meetingSeats(cx, cz) menggeser semua titik', () => {
    const s = meetingSeats(100, 50);
    expect(s[0]).toEqual({ x: 100 - 1.4, z: 50 - 1.1, ry: 0 });
  });
});
