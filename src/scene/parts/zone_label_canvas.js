// Kanvas label zona (512×96) — diekstrak murni dari createZones (flooring.js)
// agar bisa di-unit-test: ctx 2D di-inject (mock recorder), tanpa THREE/DOM.
// Urutan & parameter perintah gambar identik kode inline lama.

export const ZL_BG = 'rgba(5,10,22,0.75)';
export const ZL_BORDER = '#F59E0B';
export const ZL_W = 512, ZL_H = 96;

// drawZoneLabel(ctx, label): teks label putih center/middle di (256,50).
// (Latar roundRect & fitZoneLabel tetap di flooring.js — butuh measureText.)
export function drawZoneLabel(zx, label) {
  zx.textAlign = 'center'; zx.textBaseline = 'middle';
  zx.fillStyle = '#FFFFFF'; zx.fillText(label, 256, 50);
}
