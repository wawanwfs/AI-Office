// Painter kanvas logo WFS Project — murni (ctx di-inject, tanpa THREE/DOM).
// Urutan & parameter perintah gambar identik kode inline lama (tampilan tak berubah).

// Logo kecil resepsionis 1024x320 (hexagon gradien + W + WFS + PROJECT)
export function drawResepsiLogo(ctx) {
  ctx.fillStyle='#0F1B2E';ctx.fillRect(0,0,1024,320);
  ctx.strokeStyle='#D4AF37';ctx.lineWidth=8;ctx.strokeRect(6,6,1012,308);
  const g=ctx.createLinearGradient(40,40,240,280);g.addColorStop(0,'#FBBF24');g.addColorStop(1,'#F97316');
  const hx=(cx,cy,r)=>{ctx.beginPath();for(let i=0;i<6;i++){const a=Math.PI/6+i*Math.PI/3;ctx.lineTo(cx+r*Math.cos(a),cy+r*Math.sin(a));}ctx.closePath();};
  hx(150,160,115);ctx.fillStyle=g;ctx.fill();hx(150,160,98);ctx.fillStyle='#0F1B2E';ctx.fill();
  ctx.fillStyle=g;ctx.font='900 130px Arial,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('W',150,168);
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
  ctx.fillStyle='#fff';ctx.font='900 150px Arial,sans-serif';ctx.fillText('WFS',300,175);
  ctx.fillStyle='#FBBF24';ctx.font='800 78px Arial,sans-serif';ctx.fillText('PROJECT',306,265);
}

// Logo besar dinding belakang 2048x640 (hexagon gradien + W + WFS + PROJECT + tagline)
export function drawWallLogo(ctx) {
  ctx.fillStyle='#0F1B2E';ctx.fillRect(0,0,2048,640);
  ctx.strokeStyle='#D4AF37';ctx.lineWidth=14;ctx.strokeRect(12,12,2024,616);
  const hex=(cx,cy,r)=>{ctx.beginPath();for(let i=0;i<6;i++){const a=Math.PI/6+i*Math.PI/3;ctx.lineTo(cx+r*Math.cos(a),cy+r*Math.sin(a));}ctx.closePath();};
  const grad=ctx.createLinearGradient(100,60,460,580);grad.addColorStop(0,'#FBBF24');grad.addColorStop(1,'#F97316');
  hex(300,320,230);ctx.fillStyle=grad;ctx.fill();
  hex(300,320,196);ctx.fillStyle='#0F1B2E';ctx.fill();
  ctx.fillStyle=grad;ctx.font='900 250px "Segoe UI",Arial,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('W',300,335);
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
  ctx.fillStyle='#FFFFFF';ctx.font='900 310px "Segoe UI",Arial,sans-serif';ctx.fillText('WFS',610,290);
  ctx.fillStyle='#FBBF24';ctx.font='800 170px "Segoe UI",Arial,sans-serif';ctx.fillText('PROJECT',616,470);
  ctx.fillStyle='rgba(255,255,255,.75)';ctx.font='600 62px "Segoe UI",Arial,sans-serif';ctx.fillText('SOFTWARE HOUSE  \u00b7  AI TEAM',620,570);
}

// Judul dinding belakang 1024x200 (teks WFS putih + PROJECT amber, latar transparan)
export function drawWallTitle(ctx) {
  ctx.clearRect(0,0,1024,200);
  ctx.font='900 130px "Segoe UI",Arial,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle='#FFFFFF';
  ctx.fillText('WFS',300,100);
  ctx.fillStyle='#F59E0B';
  ctx.fillText('PROJECT',730,100);
}
