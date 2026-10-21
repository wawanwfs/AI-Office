// Painter kanvas plafon prosedural — murni (ctx di-inject, tanpa THREE/DOM).
// Diekstrak dari IIFE CEILING OfficeScene; urutan & parameter perintah gambar
// identik kode lama (tampilan tak berubah).
const CEIL_SIZE = 512, CEIL_TILES = 4, CEIL_CELL = 128;

function drawCeiling(ctx){
  const g = ctx.createLinearGradient(0,0,0,512);
  g.addColorStop(0,'#0C1B33');g.addColorStop(1,'#0A1628');
  ctx.fillStyle=g;ctx.fillRect(0,0,512,512);
  // vignette lembut ke tepi (AO palsu di langit-langit)
  const v=ctx.createRadialGradient(256,256,80,256,256,340);
  v.addColorStop(0,'rgba(20,36,64,0.35)');v.addColorStop(1,'rgba(4,9,18,0.55)');
  ctx.fillStyle=v;ctx.fillRect(0,0,512,512);
  // seam grid panel 4x4 sel per tile
  ctx.strokeStyle='rgba(70,95,140,0.35)';ctx.lineWidth=2;
  for(let i=0;i<=4;i++){
    ctx.beginPath();ctx.moveTo(i*128,0);ctx.lineTo(i*128,512);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,i*128);ctx.lineTo(512,i*128);ctx.stroke();
  }
  // garis aksen tipis lebih terang di sisi seam (bevel halus)
  ctx.strokeStyle='rgba(120,150,200,0.12)';ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    ctx.beginPath();ctx.moveTo(i*128+2,0);ctx.lineTo(i*128+2,512);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,i*128+2);ctx.lineTo(512,i*128+2);ctx.stroke();
  }
}

export { drawCeiling, CEIL_SIZE, CEIL_TILES, CEIL_CELL };
