// Konversi unit waktu untuk jam dinding 3D (parts/clock_canvas.js).
// drawClockFace mengharapkan DETIK sejak tengah malam (minutes = nowSeconds/60),
// sedangkan scene menyimpan timeOfDay sebagai MENIT simulasi (0–1440).
// Bug lama: menit dimasukkan langsung sebagai detik → jam 14:30 tergambar
// sebagai 00:14 (jarum jam hampir di angka 12 terus-menerus).
export const simMinutesToClockSeconds = (m) => m * 60;

// ── Siklus 265: SATU sumber waktu untuk KETIGA jarum ──
// Bug (audit sumber-waktu jam, lanjutan pola "dua sumber kebenaran" kelas 251):
// drawClockFace menarik jarum JAM & MENIT dari nowSeconds = waktu SIMULASI,
// tapi jarum DETIK dari dateMs = Date.now() (WAKTU NYATA) via default-param.
// Sim berjalan 1 menit-sim / SIM_SEC_PER_MIN(5) dtk nyata → dua sumber beda
// laju 12×: dalam satu putaran detik NYATA menit-sim sudah maju 12 menit
// (detik "menyalip" menitnya sendiri); saat slider manual (sim beku) jam &
// menit diam tapi detik terus berputar — jam tampak rusak.
//
// simClockSeconds(m, fracSec): detik-jam = menit-sim × 60 + fracSec — fracSec
// adalah SISA DETIK-SIM di menit berjalan (OfficeScene: __sim.acc dengan laju
// SIM_SEC_PER_MIN dtk nyata/menit-sim → 1 dtk nyata = 12 dtk-sim). Di-clamp
// [0..CLOCK_FRAC_MAX) supaya jarum detik tak pernah melewati menit-sim yang
// ditunjuk jarum menit (satu sumber: semua jarum dari timeOfDay + acc).
// Anti-poisoning konsisten modul lain: menit non-finite → 0; frac non-finite/
// ≤0 → tidak ditambahkan. frac di-clamp < 60 (satu menit-sim = 60 detik-sim):
// menit-sim yang ditunjuk jarum menit TIDAK boleh terlewati oleh jarum detik.
export const SIM_SEC_PER_MIN = 5; // paritas sim_clock.js — diguard vitest (clock_units.test.js)
export const CLOCK_FRAC_MAX = 59.999; // batas atas detik-sim dalam satu menit
export function simClockSeconds(m, fracSec = 0) {
  const base = simMinutesToClockSeconds(Number.isFinite(m) ? m : 0);
  if (!Number.isFinite(fracSec) || fracSec <= 0) return base;
  const f = Math.min(fracSec, CLOCK_FRAC_MAX);
  return base + (Number.isFinite(f) ? f : CLOCK_FRAC_MAX);
}
