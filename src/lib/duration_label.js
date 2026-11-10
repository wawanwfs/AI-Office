// Satu sumber label durasi "X dtk lalu" / "Y mnt lalu" untuk teks Indonesia
// (chip HUD koneksi, badge TV lounge, dsb). Sebelumnya dua salinan terpisah:
// connection_spec ("dtk/mnt lalu") & tv_canvas ("dtk/mnt", tanpa "lalu", lalu
// disambung ' LALU' manual) — risiko drift teks saat salah satu diubah.
// Murni & anti-poisoning: input non-finite / bukan angka / negatif → null
// (pemanggil mempertahankan teks aman sendiri), konsisten dgn pola guard
// modul lain (fmtUptime/pctDone/faceYaw). Numerik string dinormalisasi.
export function durLabel(sec) {
  if (sec === null || sec === undefined || sec === '') return null;
  const n = Number(sec);
  if (!Number.isFinite(n)) return null;
  const s = Math.max(0, Math.floor(n));
  return s < 60 ? `${s} dtk lalu` : `${Math.floor(s / 60)} mnt lalu`;
}
