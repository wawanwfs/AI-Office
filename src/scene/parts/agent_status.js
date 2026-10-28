// Status live agen untuk kartu AgentInspector — diekstrak murni (tanpa THREE/DOM)
// agar bisa di-unit-test deterministik. Sumber kebenaran = entri agentData scene
// (window.__agentData), yang mengandung { state, lunch, walker }.
//
// BUG yang diperbaiki (siklus 140): kartu AgentInspector sebelumnya SELALU
// menampilkan "Aktif Bekerja" (hardcoded) untuk semua agen — agen yang sedang
// rapat, makan siang, berjalan keliling, atau pulang tetap dilabeli "Aktif
// Bekerja". Kini label mengikuti state machine motion.js sungguhan.
//
// Peta state (sumber: parts/motion.js handlers + parts/meeting.js + daycycle.js):
//   sitting      → duduk di meja (mengerjakan task)  → Aktif Bekerja
//   walking_out  → perjalanan keluar meja; bila flag lunch aktif → Makan Siang
//   walking_back → jalan kembali ke meja             → Kembali ke Meja
//   meeting      → peserta rapat aktif (figur di kursi rapat) → Dalam Rapat
//   leaving      → meninggalkan kantor (shift pulang) → Pulang
//   offsite      → di luar kantor (shift malam)       → Di Luar Kantor
//   entri tidak ditemukan / state tak dikenal         → Standby

export const STATUS_HEX = {
  work: '#10E5A0',   // hijau  — var(--green)
  meet: '#60A5FA',   // biru   — konsisten chip review kanban
  lunch: '#F59E0B',  // oranye — konsisten chip running kanban
  walk: '#4D9FFF',   // biru muda — warna aksen kantor
  dim: '#8b93a3',    // abu — status netral/pasif
};

const STANDBY = { label: 'Standby', tone: 'dim', hex: STATUS_HEX.dim };

export function agentLiveStatus(ad) {
  if (!ad || typeof ad !== 'object') return STANDBY;
  const st = ad.state;
  // Guard anti-poisoning: state non-string (korup) → no-op aman, bukan crash.
  if (typeof st !== 'string') return STANDBY;
  if (st === 'offsite') return { label: 'Di Luar Kantor', tone: 'dim', hex: STATUS_HEX.dim };
  if (st === 'meeting') return { label: 'Dalam Rapat', tone: 'meet', hex: STATUS_HEX.meet };
  // Flag lunch dipasang daycycle sendToLunch & dilepas endLunch; agen lunch
  // berstatus walking_out (jalan ke kafe) ATAU diam di kafe (stepRoute selesai).
  if (ad.lunch) return { label: 'Makan Siang', tone: 'lunch', hex: STATUS_HEX.lunch };
  if (st === 'walking_out') return { label: 'Berjalan', tone: 'walk', hex: STATUS_HEX.walk };
  if (st === 'walking_back') return { label: 'Kembali ke Meja', tone: 'walk', hex: STATUS_HEX.walk };
  if (st === 'leaving') return { label: 'Pulang', tone: 'dim', hex: STATUS_HEX.dim };
  if (st === 'sitting') return { label: 'Aktif Bekerja', tone: 'work', hex: STATUS_HEX.work };
  return STANDBY;
}

// Cari entri agentData milik agen berdasarkan nama (case-insensitive — scene
// memakai nama uppercase BUDI dst, UI membawa nama asli). Return null bila
// tidak ada (mis. Wahyu FS reception bukan entri agentData).
export function findAgentLiveEntry(agentData, name) {
  if (!Array.isArray(agentData) || !name) return null;
  const q = String(name).toUpperCase();
  return agentData.find((ad) => ad && ad.agent &&
    String(ad.agent.name || '').toUpperCase() === q) || null;
}

// ── Lantai LIVE (siklus 142) ──────────────────────────────────────────────
// Bug: badge "Lokasi Lantai" AgentInspector memakai agent.floor yang di-set
// SEKALI saat scene build (OfficeScene.js — posisi MEJA), padahal agen berpindah
// lantai live: rapat selalu L1 (z=-3), makan siang kafe L3 (z=5.6), jalan-jalan
// kampus lintas lantai, pulang → offsite. Founder yang klik "FOKUS" dibawa ke
// lantai kosong. Fix: lantai dihitung dari posisi walker/sittingChar scene
// (floorElevationAt) tiap kali kartu polling membaca — SATU sumber kebenaran.
//
// levelOf(z): batas lantai SAMA dengan penugasan meja OfficeScene.js:1052
// (z < -0.8 → L1, z <= 4.5 → L2, sisanya L3). Guard anti-poisoning: z non-finite
// → null (pemanggil fallback ke agent.floor, bukan mengarang lantai).
export function levelOf(z) {
  if (typeof z !== 'number' || !Number.isFinite(z)) return null;
  if (z < -0.8) return 1;
  if (z <= 4.5) return 2;
  return 3;
}

// Nama zona per lantai — konsisten dgn label eksisting komponen (L1 · Ops & AI,
// L2 · Engineering, L3 · Executive). Lantai tak dikenal → null (pemanggil
// menampilkan fallback meja, bukan teks palsu).
export function floorZoneName(level) {
  if (level === 1) return 'Ops & AI';
  if (level === 2) return 'Engineering';
  if (level === 3) return 'Executive';
  return null;
}

// Lantai live entri agentData: prioritas walker (agen sedang berjalan — sittingChar
// disembunyikan), fallback sittingChar (duduk/rapat), terakhir home (duduk).
// level di-cache di ad.floorLive oleh scene? TIDAK — scene tidak menulis; UI
// murni membaca. Entri tak punya koordinat valid → null.
export function agentLiveLevel(ad) {
  if (!ad || typeof ad !== 'object') return null;
  const w = ad.walker && ad.walker.visible && ad.walker.position;
  const s = ad.sittingChar && ad.sittingChar.visible && ad.sittingChar.position;
  const pos = (w && Number.isFinite(w.z)) ? w
    : (s && Number.isFinite(s.z)) ? s
    : (ad.home && Number.isFinite(ad.home.z)) ? ad.home : null;
  return pos ? levelOf(pos.z) : null;
}
