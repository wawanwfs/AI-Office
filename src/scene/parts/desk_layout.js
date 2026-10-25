// Layout posisi meja kerja 14 agen — diekstrak dari OfficeScene.js (render identik).
// Urutan historis: 8 utama (BANTUIN AI … TONI) lalu 6 extra (RINA … SUPPORT HUMAN).
// Agen menghadap -Z (ke monitor); kursi di belakang agen (+Z dari meja);
// monitor di depan meja (-Z dari pusat meja).

export const DESKS = [
  { x: -8, z: -3 },  // BANTUIN AI
  { x: -4, z: -3 },  // BUDI
  { x: -8, z: 1.5 }, // RIZKY
  { x: -4, z: 1.5 }, // DEWI
  { x: 0,  z: -3 },  // ANDI
  { x: 0,  z: 1.5 }, // YOGA
  { x: -8, z: 6 },   // MAYA
  { x: -4, z: 6 },   // TONI
  { x: 4,  z: -3 },  // RINA
  { x: 4,  z: 1.5 }, // LINA
  { x: 4,  z: 6 },   // SARI
  { x: 8,  z: -3 },  // TRAINER AI
  { x: 8,  z: 1.5 }, // INTEGRATOR BOT
  { x: 0,  z: 6 },   // SUPPORT HUMAN (slot baris 3 bebas tabrakan meja resepsi)
];

// Kolom x meja (kiri→kanan), baris z unik
export const deskColumns = (desks = DESKS) =>
  [...new Set(desks.map(d => d.x))].sort((a, b) => a - b);

export const deskRows = (desks = DESKS) =>
  [...new Set(desks.map(d => d.z))].sort((a, b) => a - b);

// Grid penuh kolom×baris = 15 slot; 14 agen berarti tepat satu kursi kosong
export const deskGrid = (desks = DESKS) => {
  const cols = deskColumns(desks), rows = deskRows(desks);
  const taken = new Set(desks.map(d => `${d.x},${d.z}`));
  const empty = [];
  for (const x of cols) for (const z of rows)
    if (!taken.has(`${x},${z}`)) empty.push({ x, z });
  return { cols, rows, empty, total: cols.length * rows.length };
};
