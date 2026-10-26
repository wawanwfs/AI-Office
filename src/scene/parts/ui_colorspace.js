// WYSIWYG warna permukaan UI 3D (siklus 111).
//
// Renderer memakai ACESFilmicToneMapping + outputColorSpace sRGB. Tanpa penandaan
// eksplisit, CanvasTexture dibaca sebagai data LINEAR sehingga warna sRGB yang
// dilukis painter (mis. badge hijau #10E5A0) di-tonemap & di-shift → di layar 3D
// jadi teal/pudar (terukur sebelum patch: badge TV (16,229,160) tampil (111,177,186)).
//
// Dua tindakan untuk permukaan UI (layar/teks/badge):
//   1. uiTexture(tex) — tandai colorSpace 'srgb' (konstanta string THREE.SRGBColorSpace;
//      tanpa import THREE agar stub test yang tidak punya SRGBColorSpace tetap jalan).
//   2. matToneMappedFalse / uiMaterial — material unlit layar tidak ikut tone mapping.
// Tekstur dekoratif (terrazzo, langit, dinding, AO) sengaja TIDAK disentuh — pencahayaan
// artistik dipertahankan.

// Konstanta string three r152+: THREE.SRGBColorSpace === 'srgb'.
export const SRGB = 'srgb';

// Tandai tekstur kanvas sebagai sRGB. Return tex yang sama (chainable).
export function uiTexture(tex) {
  if (tex) {
    try { tex.colorSpace = SRGB; } catch { /* stub tanpa properti — abaikan */ }
  }
  return tex;
}

// Matikan tone mapping pada material unlit layar/teks (mutasi in-place, chainable).
export function uiMaterial(mat) {
  if (mat) {
    try { mat.toneMapped = false; } catch { /* stub — abaikan */ }
  }
  return mat;
}
