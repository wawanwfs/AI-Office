// Ring canvas painters (extracted from OfficeScene.js ensureSelRing/ensureHoverRing).
// Pure — ctx di-inject, tanpa THREE/DOM. Urutan & parameter perintah gambar
// identik kode inline lama (radial gradient transparan→RGB→transparan,
// fillRect penuh). Mesh THREE tetap dibuat OfficeScene.

// Seleksi: stop tengah 0.95 (kode lama hardcode); Hover: 0.9.
export function paintRing(ctx, spec, midOpacity) {
  const c = spec.SIZE / 2 // 64: pusat gradient (kode lama hardcode 64,64)
  const g = ctx.createRadialGradient(c, c, spec.INNER, c, c, spec.OUTER)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(spec.MID, `rgba(${spec.RGB},${midOpacity})`)
  g.addColorStop(1, `rgba(${spec.RGB},0)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, spec.SIZE, spec.SIZE)
}
