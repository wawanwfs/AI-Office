// Auto-advance jam simulasi — murni & diuji unit.
// Slider manual menempatkan simulasi ke mode MANUAL: berhenti sampai MANUAL_RESUME_MS
// ms tak ada sentuhan slider, lalu autoplay lanjut (akumulasi di-reset, tak loncat).
export const SIM_SEC_PER_MIN = 5; // 1 menit simulasi / 5 dtk nyata (1 hari kerja ≈ 12 mnt nyata)
export const MANUAL_RESUME_MS = 8000;

export function advanceSimClock(prev, nowMs) {
  const p = prev || { acc: 0, last: 0, manual: false, lastManualSet: 0, time: 0 };
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
  return { acc: 0, last: nowMs, manual: true, lastManualSet: nowMs, time };
}
