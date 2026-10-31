// src/lib/taskboard_gate.js
// Gerbang lazy-load TaskBoard (siklus 189).
//
// Konteks: TaskBoard.jsx = komponen terbesar app (~1815 baris + lib kanban_*)
// dan ikut ter-bundle di chunk awal meski panelnya hanya terbuka saat dipakai
// (shortcut T, tombol dock, klik kartu Dashboard/TeamStats/ProjectPanel/
// AgentInspector, klik whiteboard 3D). Lazy-load memotong ~90 KB (≈34 KB
// gzip) dari bundle awal — tapi memunculkan risiko baru: event buka yang
// dikirim SEBELUM chunk selesai dimuat akan HILANG (tidak ada listener) →
// pengguna klik "Papan Task" dan tidak terjadi apa-apa (jebakan klasik
// lazy modal). Solusi: gerbang buffer+replay — modul ini SATU-SATUNYA
// penerima event papan sejak mount App:
//  1. Sebelum chunk siap: event TIDAK diteruskan; detailnya dibuffer
//     (maks 16 — meluap → buang terua, simpan terbaru; replay terakhir
//     cukup karena setiap event open/toggle set state final, bukan delta).
//  2. Pasca chunk siap: listener TaskBoard asli memasang dirinya; gate
//     me-replay event yang terbuffer lalu lepas pasang diri — aliran event
//     kembali 1:1 seperti sebelum lazy-load.
// Anti-poisoning: detail non-object dibungkus {}; CustomEvent salah
// konstruktor dianggap bukan event papan (tolak aman, tanpa throw).

/** Batas buffer event lazy (open/toggle/cycle-div). 16 jauh melampaui klik beruntun manusia. */
export const TASKBOARD_GATE_LIMIT = 16

let ready = false
let buffer = []

/** True bila chunk TaskBoard sudah siap (gate tak lagi membuffer). */
export function isTaskBoardGateReady() {
  return ready
}

/**
 * Menerima event papan dari sumber mana pun. Dipanggil App (satu titik)
 * SEBELUM dispatch — gate memutuskan buffer / teruskan.
 * @param {string} type   'wfs-open-task-board' | 'wfs-toggle-task-board' | 'wfs-cycle-div-preset'
 * @param {object} detail detail CustomEvent (boleh undefined)
 * @returns {boolean} true = diteruskan segera (chunk siap), false = dibuffer
 */
export function taskBoardGateReceive(type, detail) {
  const d = (detail && typeof detail === 'object') ? detail : {}
  if (ready) return true
  if (buffer.length >= TASKBOARD_GATE_LIMIT) buffer.shift() // buang terua, simpan terbaru
  buffer.push({ type, detail: d })
  return false
}

/** Tutup buffer: replay berurutan (sinkron) lalu lepas pasang permanen. */
export function taskBoardGateFlush() {
  ready = true
  const pending = buffer
  buffer = []
  for (const ev of pending) {
    try { window.dispatchEvent(new CustomEvent(ev.type, { detail: ev.detail })) } catch { /* jangan gugur di event korup */ }
  }
}

/** Reset state gate (khusus unit test — produksi tidak memanggil). */
export function taskBoardGateReset() {
  ready = false
  buffer = []
}

/**
 * Router dispatch SATU TITIK untuk semua pemicu papan (App, tombol dock,
 * klik kartu, shortcut) — menggantikan `window.dispatchEvent(new CustomEvent(...))`
 * tersebar. Chunk siap → dispatch langsung (jalur identik dulu). Belum siap →
 * dibuffer, replay otomatis pasca `taskBoardGateFlush()`.
 * @param {string} type   tipe event ('wfs-open-task-board', …)
 * @param {object} detail detail event (opsional)
 */
export function dispatchTaskBoardEvent(type, detail) {
  if (taskBoardGateReceive(type, detail)) {
    try { window.dispatchEvent(new CustomEvent(type, { detail })) } catch { /* event korup: abaikan, pola OfficeScene */ }
  }
}
