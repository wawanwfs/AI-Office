// Siklus 181 — indeks agen berikutnya utk siklus fokus keyboard C/Shift+C.
// Murni (tanpa THREE/scene) agar di-unit-test: wrap melingkar dgn titik awal
// "tanpa seleksi" (-1): maju → agen pertama (0), mundur → agen terakhir.
// Indeks -2 (nexus founder) TIDAK diteruskan ke sini — scene memetakan
// getSelected() -2 ke null via probe __agentCycle; cycleAgent hanya menerima
// -1 (tanpa seleksi) atau indeks agen sah dari selectedIdx.

export function nextAgentIndex(cur, len, backward = false) {
  if (!Number.isInteger(cur) || !Number.isInteger(len) || len <= 0) return -1;
  const back = backward === true; // ketat: hanya true eksak = mundur (input korup → maju)
  let next = back ? cur - 1 : cur + 1;
  if (next < 0) next = len - 1;      // wrap mundur (juga dari -1 → agen terakhir)
  else if (next >= len) next = 0;    // wrap maju dari agen terakhir → pertama
  return next;
}
