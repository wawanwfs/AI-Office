// Timing percakapan kolaborasi — diekstrak murni (tanpa THREE/scene) dari
// converse() di motion.js agar bisa di-unit-test. Konsumen: motion.js.

// Langkah dialog aktif: baris ke-berapa yang seharusnya tampil pada walkPause ini.
export const talkStep = (walkPause, lineSec) => {
  // Guard anti-poisoning (konsisten dgn motion_math.angleDelta): input non-finite
  // (NaN/±Infinity) atau lineSec <= 0 → 0, jangan biarkan Infinity/NaN merambat
  // ke indeks baris dialog (lines[Infinity] → undefined).
  if (!Number.isFinite(walkPause) || !Number.isFinite(lineSec) || lineSec <= 0) return 0;
  return Math.max(0, Math.floor(walkPause / lineSec));
};

// Percakapan selesai: melewati semua baris + jeda akhir 1.2 detik.
export const CONVERSE_TAIL = 1.2;
export const isConverseOver = (walkPause, lineCount, lineSec) => {
  // Guard anti-poisoning: data timing rusak → false (tidak selesai) alih-alih
  // perbandingan NaN yang diam-diam salah / Infinity yang mengakhiri mendadak.
  if (!Number.isFinite(walkPause) || !Number.isFinite(lineSec) || !Number.isInteger(lineCount) || lineCount < 0) return false;
  return walkPause > lineSec * lineCount + CONVERSE_TAIL;
};

// Baris diucapkan bergantian: genap = pengunjung (ad), ganjil = tuan rumah (partner).
export const speakerIsVisitor = (step) => step % 2 === 0;
