// Audio wake listeners — diekstrak dari OfficeScene.js agar diuji unit.
//
// Konteks bug (ditemukan siklus 57): OfficeScene memasang listener sekali-pakai
//   window.addEventListener('keydown', __ensureAudioEarly, {once:true});
//   window.addEventListener('pointerdown', __ensureAudioEarly, {once:true});
// tapi destroy() TIDAK melepasnya. Listener {once:true} hanya hilang setelah
// event pertama; bila scene di-destroy SEBELUM interaksi pertama (HMR/remount,
// React StrictMode), listener tua tetap tertempel. Scene baru me-reset
// window.__officeSceneDestroyed = false, sehingga saat pengguna pertama kali
// menekan tombol/klik, listener LAMA ikut jalan dan memanggil ensure() pada
// engine audio lama yang sudah di-dispose → AudioContext duplikat bocor
// (menggerus batas MaxAudioContextsExceeded browser).
//
// Helper ini membungkus pasangan pasang/lepas agar simetrinya teruji unit.

/**
 * Pasang listener wake audio sekali-pakai di window.
 * @param {() => void} ensureFn  dipanggil pada interaksi pertama (keydown/pointerdown)
 * @param {{window?: Window, capture?: boolean}} opts  injeksi window utk test
 * @returns {() => void} dispose — melepas listener yang BELUM terpicu (aman dipanggil dua kali)
 */
export function installAudioWake(ensureFn, opts = {}) {
  const win = opts.window || (typeof window !== 'undefined' ? window : null);
  if (!win || typeof ensureFn !== 'function') return () => {};
  const capture = !!opts.capture;
  let armed = true;
  const handler = () => {
    if (!armed) return;
    armed = false;
    win.removeEventListener('keydown', handler, { capture });
    win.removeEventListener('pointerdown', handler, { capture });
    try { ensureFn(); } catch { /* interaksi wake tak boleh melempar */ }
  };
  win.addEventListener('keydown', handler, { once: true, capture });
  win.addEventListener('pointerdown', handler, { once: true, capture });
  return () => {
    if (!armed) return;
    armed = false;
    win.removeEventListener('keydown', handler, { capture });
    win.removeEventListener('pointerdown', handler, { capture });
  };
}
