import { describe, it, expect } from 'vitest';
import { advanceSimClock, setSimManual, SIM_SEC_PER_MIN, MANUAL_RESUME_MS } from '../scene/parts/sim_clock.js';

describe('advanceSimClock', () => {
  it('tick pertama hanya mencatat last, tidak melangkah', () => {
    const s = advanceSimClock({ acc: 0, last: null, manual: false, lastManualSet: 0, time: 480 }, 1000);
    expect(s.last).toBe(1000);
    expect(s.time).toBe(480);
    expect(s.stepped).toBeFalsy();
  });
  it('berjalan 1 menit simulasi tiap SIM_SEC_PER_MIN detik nyata', () => {
    let s = { acc: 0, last: null, manual: false, lastManualSet: 0, time: 480 };
    s = advanceSimClock(s, 1000);
    s = advanceSimClock(s, 1000 + SIM_SEC_PER_MIN * 1000);
    expect(s.time).toBe(481);
    expect(s.stepped).toBe(true);
    expect(s.acc).toBeCloseTo(0);
  });
  it('akumulasi parsial disimpan (sub-menit tak hilang)', () => {
    let s = { acc: 0, last: null, manual: false, lastManualSet: 0, time: 480 };
    s = advanceSimClock(s, 0);
    s = advanceSimClock(s, 2500); // setengah menit simulasi
    expect(s.time).toBe(480);
    s = advanceSimClock(s, 5000); // total 5 dtk → langkah
    expect(s.time).toBe(481);
  });
  it('wrap tengah malam 1439 → 0', () => {
    let s = { acc: 0, last: null, manual: false, lastManualSet: 0, time: 1439 };
    s = advanceSimClock(s, 0);
    s = advanceSimClock(s, SIM_SEC_PER_MIN * 1000);
    expect(s.time).toBe(0);
  });
  it('melompat loncatan besar tanpa hang: cap 288 langkah (24 jam)', () => {
    let s = { acc: 0, last: null, manual: false, lastManualSet: 0, time: 0 };
    s = advanceSimClock(s, 0);
    s = advanceSimClock(s, 1000 * 3600 * 24); // 24 jam nyata
    expect(s.time).toBe(288); // cap 288 langkah (bukan ribuan → tanpa hang)
  });
  it('dua menit simulasi dalam satu tick', () => {
    let s = { acc: 0, last: null, manual: false, lastManualSet: 0, time: 100 };
    s = advanceSimClock(s, 0);
    s = advanceSimClock(s, SIM_SEC_PER_MIN * 2 * 1000);
    expect(s.time).toBe(102);
  });
});

describe('mode manual (slider)', () => {
  it('slider menempatkan mode manual & waktu tepat', () => {
    const s = setSimManual(900, 5000);
    expect(s.manual).toBe(true);
    expect(s.time).toBe(900);
    expect(s.acc).toBe(0);
  });
  it('saat manual: waktu tidak berjalan walau waktu lewat', () => {
    let s = setSimManual(900, 5000);
    s = advanceSimClock(s, 5000 + 3000);
    expect(s.time).toBe(900);
    expect(s.manual).toBe(true);
    expect(s.last).toBe(8000);
  });
  it('resume setelah MANUAL_RESUME_MS: autoplay lanjut dari posisi baru, tak loncat', () => {
    let s = setSimManual(900, 5000);
    s = advanceSimClock(s, 5000 + MANUAL_RESUME_MS + 1);
    expect(s.manual).toBe(false);
    expect(s.time).toBe(900); // akumulasi direset, belum melangkah
    s = advanceSimClock(s, 5000 + MANUAL_RESUME_MS + 1 + SIM_SEC_PER_MIN * 1000);
    expect(s.time).toBe(901);
  });
  it('sentuhan slider baru memperpanjang mode manual', () => {
    let s = setSimManual(900, 5000);
    s = advanceSimClock(s, 12000); // hampir resume
    s = setSimManual(905, 13000); // sentuh lagi
    s = advanceSimClock(s, 13000 + MANUAL_RESUME_MS - 500);
    expect(s.manual).toBe(true); // belum resume karena sentuhan baru
  });
});
