// Unit test untuk logika murni siklus siang-malam (src/scene/parts/daycycle.js).
import { describe, it, expect } from 'vitest';
import { SCHEDULE, statusAt, daylight, mixHex } from '../scene/parts/daycycle.js';

describe('daycycle: statusAt', () => {
  it('menampilkan label sesuai jadwal pada menit kunci', () => {
    expect(statusAt(0)).toBe('Shift malam · WFS online');
    expect(statusAt(600)).toBe('Stand-up pagi');
    expect(statusAt(720)).toBe('Istirahat makan siang');
    expect(statusAt(840)).toBe('Sprint review');
  });

  it('label tetap berlaku sampai batas berikutnya (menit menit-1)', () => {
    expect(statusAt(599)).toBe('Fokus pagi');
    expect(statusAt(719)).toBe('Deep work · semua online');
    expect(statusAt(779)).toBe('Istirahat makan siang');
    expect(statusAt(1439)).toBe('Shift malam · WFS online'); // akhir hari
  });

  it('jadwal monoton naik dan menutup siklus 24 jam kembali ke shift malam', () => {
    for (let i = 1; i < SCHEDULE.length; i++) {
      expect(SCHEDULE[i][0]).toBeGreaterThan(SCHEDULE[i - 1][0]);
    }
    expect(SCHEDULE[0][1]).toBe(SCHEDULE[SCHEDULE.length - 1][1]);
  });
});

describe('daycycle: daylight', () => {
  it('gelap (0.3) dini hari & malam, terang penuh (1) jam kerja', () => {
    expect(daylight(0)).toBeCloseTo(0.3);
    expect(daylight(300)).toBeCloseTo(0.3);
    expect(daylight(600)).toBe(1);
    expect(daylight(1000)).toBe(1);
    expect(daylight(1200)).toBeCloseTo(0.3);
  });

  it('transisi fajar (06:00-08:00) & senja (17:00-19:00) monoton', () => {
    let prev = -1;
    for (let m = 360; m <= 480; m += 10) {
      const d = daylight(m);
      expect(d).toBeGreaterThan(prev);
      expect(d).toBeGreaterThanOrEqual(0.3);
      expect(d).toBeLessThanOrEqual(1);
      prev = d;
    }
    prev = 1.01;
    for (let m = 1020; m <= 1140; m += 10) {
      const d = daylight(m);
      expect(d).toBeLessThan(prev);
      expect(d).toBeGreaterThanOrEqual(0.3);
      prev = d;
    }
  });

  it('transisi mulai dan selesai di nilai batas (smoothstep)', () => {
    expect(daylight(360)).toBeCloseTo(0.3);
    expect(daylight(480)).toBeCloseTo(1);
    expect(daylight(1020)).toBeCloseTo(1);
    expect(daylight(1140)).toBeCloseTo(0.3);
  });
});

describe('daycycle: mixHex', () => {
  it('t=0 / t=1 mengembalikan warna asal', () => {
    expect(mixHex(0x102030, 0xffeedd, 0)).toBe(0x102030);
    expect(mixHex(0x102030, 0xffeedd, 1)).toBe(0xffeedd);
  });

  it('t=0.5 mencampur tiap kanal independently', () => {
    // (0x00 + 0xff)/2 = 0x80 per kanal
    expect(mixHex(0x000000, 0xffffff, 0.5)).toBe((0x80 << 16) | (0x80 << 8) | 0x80);
    // kanal merah 0x10 vs 0x30 → 0x20
    expect((mixHex(0x100000, 0x300000, 0.5) >> 16) & 0xff).toBe(0x20);
  });

  it('hasil selalu bilangan 24-bit valid untuk segala t di [0,1]', () => {
    for (let i = 0; i <= 10; i++) {
      const v = mixHex(0x123456, 0x654321, i / 10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffff);
    }
  });
});

describe('daycycle: mixHex — anti-poisoning (t non-finite)', () => {
  it('t NaN → warna asal a (t=0)', () => {
    expect(mixHex(0x102030, 0xffeedd, NaN)).toBe(0x102030);
  });
  it('t ±Infinity → warna asal a', () => {
    expect(mixHex(0x102030, 0xffeedd, Infinity)).toBe(0x102030);
    expect(mixHex(0x102030, 0xffeedd, -Infinity)).toBe(0x102030);
  });
  it('hasil tetap 24-bit valid setelah guard', () => {
    const v = mixHex(0x123456, 0x654321, NaN);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(0xffffff);
  });
});
