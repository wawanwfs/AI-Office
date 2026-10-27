// Auto-advance jam simulasi — murni & diuji unit.
// Slider manual menempatkan simulasi ke mode MANUAL: berhenti sampai MANUAL_RESUME_MS
// ms tak ada sentuhan slider, lalu autoplay lanjut (akumulasi di-reset, tak loncat).
export const SIM_SEC_PER_MIN = 5; // 1 menit simulasi / 5 dtk nyata (1 hari kerja ≈ 12 mnt nyata)
export const MANUAL_RESUME_MS = 8000;

export function advanceSimClock(prev, nowMs) {
  let p = prev || { acc: 0, last: null, manual: false, lastManualSet: 0, time: 0 };
  // anti-poisoning: timestamp non-finite (NaN/±Infinity) tidak boleh memajukan / menulari jam
  if (!Number.isFinite(nowMs)) return { ...p, last: Number.isFinite(p.last) ? p.last : null, stepped: false };
  // state rusak non-finite (dari poison sebelumnya) → reset ke nilai aman agar wrap/waktu tetap valid
  if (!Number.isFinite(p.time) || !Number.isFinite(p.acc)) p = { ...p, time: Number.isFinite(p.time) ? p.time : 0, acc: Number.isFinite(p.acc) ? p.acc : 0 };
  // mode MANUAL: tunggu sampai pengguna diam MANUAL_RESUME_MS, lalu autoplay lanjut dari posisi baru
  if (p.manual) {
    if (nowMs - p.lastManualSet > MANUAL_RESUME_MS) {
      return { ...p, manual: false, acc: 0, last: nowMs };
    }
    return { ...p, last: nowMs };
  }
  if (p.last == null) return { ...p, last: nowMs }; // tick pertama: jangan akumulasi
  const acc = p.acc + (nowMs - p.last) / 1000;
  let time = p.time, acc2 = acc, steps = 0;
  while (acc2 >= SIM_SEC_PER_MIN && steps < 288) { // cap 24 jam simulasi per tick
    acc2 -= SIM_SEC_PER_MIN;
    time = (time + 1) % 1440;
    steps++;
  }
  return { ...p, acc: acc2, last: nowMs, time, stepped: steps > 0 };
}

export function setSimManual(time, nowMs) {
  const t = Number.isFinite(time) ? time : 0; // anti-poisoning: waktu non-finite → 0
  const n = Number.isFinite(nowMs) ? nowMs : 0; // timestamp non-finite → 0 (bukan NaN)
  return { acc: 0, last: n, manual: true, lastManualSet: n, time: t };
}
