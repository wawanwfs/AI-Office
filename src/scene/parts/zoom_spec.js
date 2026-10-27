// Zoom radius: satu sumber formula radius kamera utk wheel & tombol zoom.
// Murni & null-safe (formula mentah dilindungi clamp — lihat di bawah).

// (Siklus 122 — dokumentasi) RADIUS_GOAL 12 & 130 = batas tampilan ekstrem
// yang dipakai handler wheel/zoomIn/zoomOut OfficeScene. 12 = terdekat
// (macro, di dalam meja), 130 = terjauh (kampus utuh dgn langit).

// Radius kamera setelah satu langkah zoom.
// delta > 0 = menjauh (wheel ke bawah / zoomOut), delta < 0 = mendekat.
// Clamp 12..130 — mirror eksak batas lama handler wheel
// (Math.max(12, Math.min(130, sph.radius + deltaY * .04)));
// tombol zoomIn/zoomOut memakai langkah diskrit ±4 via delta.
export function zoomRadius(current, delta) {
  const cur = (typeof current === 'number' && Number.isFinite(current)) ? current : 42.5;
  const d = (typeof delta === 'number' && Number.isFinite(delta)) ? delta : 0;
  return Math.max(12, Math.min(130, cur + d));
}

// (Siklus 121) Zoom saat goal kamera aktif: zoom JUJUR —
// 1. goal follow (agen berjalan / figur rapat) TIDAK dibatalkan: radius
//    goal ikut diubah (clamp 12..130) sehingga lerp per-frame membawa
//    radius ke nilai baru DAN kamera tetap mengikuti target. Dulu:
//    focusGoal=null diam-diam — kamera berhenti mengikuti agen yang
//    baru saja difokuskan pengguna (bug UX), __saved menjadi yatim
//    (masih ada tanpa goal → Escape memutar pose lama tanpa tujuan,
//    seleksi & ring tetap menyala).
// 2. goal reset (kembali ke rumah): radius goal ikut diubah — dulu
//    lerp .06/frame menarik radius BALIK ke r goal tiap frame (scroll
//    terasa "sticky"/melawan), kini goal bergerak bersama input.
// 3. goal titik statis (lantai/tim/nexus): radius goal ikut diubah —
//    dulu goal DIBATALKAN (lerp terhenti di tengah jalan; kadang
//    ketinggalan nilai phi goal yang belum sempat dilerp → framing
//    beda dgn tombol lantai asli).
// Return goal baru (objek sama, r dimutasi) / goal baru dgn radius /
// null bila tak ada goal (pemanggil hanya mengubah sph.radius).
export function zoomFocusGoal(goal, delta, clampMin = 12, clampMax = 130) {
  if (!goal || goal.reset) return null;
  const cur = (typeof goal.r === 'number' && Number.isFinite(goal.r)) ? goal.r : 42.5;
  goal.r = Math.max(clampMin, Math.min(clampMax, cur + delta));
  return goal;
}
