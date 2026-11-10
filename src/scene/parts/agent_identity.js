// Siklus 370: identitas agen — SATU SUMBER pemetaan id gateway ↔ nama scene.
//
// Dulu tabel ini TERSALIN 3x dan saling drift:
//   1. running_tasks.js  SCENE_NAME_TO_ID (26 entri, nama→id)
//   2. OfficeScene.js    SCENE_BY_ID focusAgent (15 entri, id→nama)
//   3. App.jsx           SCENE_BY_ID __wfsSceneSelect (15 entri, id→nama)
// Salinan 2 & 3 tidak punya 12 spesialis extended (arch1, sre1, …) — fokus
// agen via id spesialis gagal diam-diam. Penambahan agen baru harus diedit
// di 2–3 tempat.
//
// PENTING: pasangan TIDAK boleh diturunkan dari urutan TEAMS.members[i] ↔
// agentIds[i] — TEAMS mengurutkan members per-lead (core-be: GILANG, BUDI,
// RIZKY, FERRY vs agentIds be1, be2, db1, be-lead) sehingga pasangan indeks
// salah vs gateway (/wfs-api/agents: be1 = Budi Santoso). Kebenaran = tabel
// eksplisit di bawah (paritas /wfs-api/agents + nama scene agents_spec &
// extended_desks).
//
// Urutan pasangan mengikuti gateway (/wfs-api/agents) lalu 12 spesialis scene.
export const AGENT_ID_SCENE_PAIRS = [
  ['ceo', 'WAHYU FS'],
  ['pm1', 'SARI'],
  ['be1', 'BUDI'],
  ['be2', 'RIZKY'],
  ['fe1', 'DEWI'],
  ['fe2', 'ANDI'],
  ['mob1', 'YOGA'],
  ['ux1', 'MAYA'],
  ['devops1', 'TONI'],
  ['qa1', 'RINA'],
  ['ai-cs', 'BANTUIN AI'],
  ['ai-train', 'TRAINER AI'],
  ['integ', 'INTEGRATOR BOT'],
  ['mkt1', 'LINA'],
  ['cs-h', 'SUPPORT'],
  // 12 spesialis extended (scene-only, gateway ID untuk fallback resolusi)
  ['arch1', 'ARIS'],
  ['ux2', 'CLARA'],
  ['prod1', 'RIAN'],
  ['dsgn1', 'TARI'],
  ['db1', 'FERRY'],
  ['be-lead', 'GILANG'],
  ['infra1', 'HENDRA'],
  ['sre1', 'DONI'],
  ['sec1', 'SECBOT'],
  ['secops1', 'BAGAS'],
  ['rel1', 'NINA'],
  ['gov1', 'CITRA'],
];

// alias founder (bukan anggota TEAMS — dipertahankan dari tabel lama)
const FOUNDER_ALIAS = { CEO: 'ceo', 'WAHYU FAJAR S.': 'ceo' };

// nama scene (uppercase) → id gateway
export const SCENE_NAME_TO_ID = Object.assign(
  FOUNDER_ALIAS,
  Object.fromEntries(AGENT_ID_SCENE_PAIRS.map(([id, name]) => [name.toUpperCase(), id]))
);

// id gateway → nama scene (WAHYU FS ikut — penelepon memutuskan seleksi -2)
export const SCENE_ID_TO_NAME = Object.fromEntries(
  AGENT_ID_SCENE_PAIRS.map(([id, name]) => [id, name])
);
