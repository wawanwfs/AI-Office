// Timing percakapan kolaborasi — diekstrak murni (tanpa THREE/scene) dari
// converse() di motion.js agar bisa di-unit-test. Konsumen: motion.js.

// Langkah dialog aktif: baris ke-berapa yang seharusnya tampil pada walkPause ini.
export const talkStep = (walkPause, lineSec) =>
  Math.max(0, Math.floor(walkPause / lineSec));

// Percakapan selesai: melewati semua baris + jeda akhir 1.2 detik.
export const CONVERSE_TAIL = 1.2;
export const isConverseOver = (walkPause, lineCount, lineSec) =>
  walkPause > lineSec * lineCount + CONVERSE_TAIL;

// Baris diucapkan bergantian: genap = pengunjung (ad), ganjil = tuan rumah (partner).
export const speakerIsVisitor = (step) => step % 2 === 0;
