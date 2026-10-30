// Orbit kamera via keyboard — siklus 177.
//
// (Latar) Audit jalur input kamera (174/175/176) menutup semua tepi pointer,
// TAPI satu jalur input kamera sama sekali tidak ada: PUTAR kamera hanya bisa
// lewat drag pointer — di keyboard tidak ada orbit sama sekali (shortcut ada
// zoom +/-, preset 1/2/3, reset 0, Esc — tidak ada "putar"). Pengguna tanpa
// mouse (papan sentuh rusak, aksesibilitas, precisi) tak punya cara memutar
// kantor. Panah browser default (scroll halaman) tidak berguna di kanvas
// fullscreen ini — halaman tak pernah scroll.
//
// Kontrak (mirror pola zoom_spec: murni + anti-poisoning + delegasi):
// - orbitStep(sph, key, step) mengembalikan objek BARU {theta, phi} — tidak
//   mengmutasi input (murni, bisa diuji unit tanpa scene).
// - theta: kiri = +, kanan = − (arah putaran sama dgn drag: pointermove ke
//   kanan menambah x → sph.theta -= dx*0.005 — drag kanan = dunia bergeser
//   kanan = kamera berputar ke kiri... konvensi drag: theta berkurang saat
//   cursor ke kanan. Panah kanan = kamera orbit ke kanan = dunia tampak
//   bergeser kiri = theta BERTAMBAH? Dipilih: panah kanan = theta − step
//   (arah sama dgn drag ke kanan — konsistensi mental "arah panah = arah
//   dunia bergeser", sama dgn pola wheel zoom: panah atas = dekat bukan
//   "mundur"). Kiri = kebalikannya.
// - phi: atas = − (kamera naik/melihat lebih dari atas), bawah = +
//   (kamera turun). Clamp phi eksak dgn updCam produksi:
//   [0.18, Math.PI/2.3] — bawah dan atas tak pernah keluar batas kamera
//   (tanpa ini panah bawah berulang menembus lantai / membalik kamera).
// - Anti-poisoning: theta/phi non-finite (state teracuni) → pulih ke basis
//   aman {theta: PI*0.78, phi: 0.92} tanpa langkah (mirror zoomRadius).
// - step non-finite → langkah 0 (orbit gegabah tidak menggeser kamera).
// - orbitFocusGoal(goal, dTheta, dPhi): zoom jujur kelas 121 TIDAK berlaku
//   di orbit — goal follow/statis TETAP UTUH (orbit memutar pandangan
//   SEKELILING target, tidak mengubah target/radius). Fungsi ini eksplisit
//   no-op (mengembalikan goal sama) supaya wiring produksi & test punya satu
//   sumber kebenaran kontrak "orbit tidak mengganggu goal".
export const ORBIT_KEY_STEP = 0.12;   // rad per tekan panah (~7°, terasa halus)
export const ORBIT_KEY_STEP_FAST = 0.36; // Shift+panah (~21°, 3× cepat)
export const PHI_MIN = 0.18;          // eksak clamp produksi updCam
export const PHI_MAX = Math.PI / 2.3; // eksak clamp produksi updCam
// Basis pemulihan = pose kamera home isometrik (sph awal desktop OfficeScene).
const THETA_BASE = Math.PI * 0.78;
const PHI_BASE = 0.92;

const fin = (v) => typeof v === 'number' && Number.isFinite(v);

export function orbitStep(sph, key, step = ORBIT_KEY_STEP) {
  const okT = fin(sph && sph.theta);
  const okP = fin(sph && sph.phi);
  // State teracuni → pulih ke basis tanpa langkah (anti-poisoning).
  if (!okT || !okP) return { theta: THETA_BASE, phi: PHI_BASE };
  const s = fin(step) ? step : 0;
  let theta = sph.theta;
  let phi = sph.phi;
  if (key === 'ArrowLeft') theta = theta + s;
  else if (key === 'ArrowRight') theta = theta - s;
  else if (key === 'ArrowUp') phi = phi - s;
  else if (key === 'ArrowDown') phi = phi + s;
  else return { theta, phi }; // tombol lain bukan orbit
  // Clamp phi eksak dgn updCam produksi — panah berulang tak pernah
  // menembus lantai (phi maks) atau membalik kamera (phi min).
  return { theta, phi: Math.max(PHI_MIN, Math.min(PHI_MAX, phi)) };
}

// Orbit TIDAK menyentuh goal (kontrak eksplisit): target/radius/follow utuh —
// orbit memutar SEKELILING target. Kembali dari wiring/test ke sini bila
// kontrak berubah.
export function orbitFocusGoal(goal) {
  return goal;
}
