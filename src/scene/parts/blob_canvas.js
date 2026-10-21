// painter kanvas bayangan kontak (blob shadow) — murni, ctx di-inject
// Urutan & parameter perintah gambar identik kode inline lama di OfficeScene.
export const BLOB_SIZE = 128;
export const BLOB_CENTER = 64;

export function drawBlobShadow(ctx) {
  const g = ctx.createRadialGradient(BLOB_CENTER, BLOB_CENTER, 4, BLOB_CENTER, BLOB_CENTER, 62);
  g.addColorStop(0, 'rgba(10,14,18,0.55)');
  g.addColorStop(0.55, 'rgba(10,14,18,0.30)');
  g.addColorStop(1, 'rgba(10,14,18,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, BLOB_SIZE, BLOB_SIZE);
}
