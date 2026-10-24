// Lantai zona & label area — ditulis ulang dari data tabel.
import { ZONES, zoneLabelY, zoneLabelScale } from './floor_zones.js';
import { drawZoneLabel } from './zone_label_canvas.js';

// Auto-shrink font label zona: mulai 44px, turun 2px per langkah sampai teks
// muat dalam 460px ATAU batas bawah 20px. Murni (ctx di-inject) agar bisa
// di-unit-test; dipakai createZones untuk kanvas label zona 512×96.
export const ZONE_LABEL_BASE_PX = 44, ZONE_LABEL_MIN_PX = 20, ZONE_LABEL_MAX_W = 460, ZONE_LABEL_STEP = 2;
export function fitZoneLabel(ctx, text) {
  let fs = ZONE_LABEL_BASE_PX;
  const font = (px) => '800 ' + px + 'px "Segoe UI",Arial,sans-serif';
  ctx.font = font(fs);
  while (ctx.measureText(text).width > ZONE_LABEL_MAX_W && fs > ZONE_LABEL_MIN_PX) {
    fs -= ZONE_LABEL_STEP;
    ctx.font = font(fs);
  }
  return fs;
}

// drawZoneLabel diekstrak murni ke parts/zone_label_canvas.js (diuji unit); di sini cukup injek ctx.

export function createZones(ctx){
  const { THREE, office } = ctx;
  ZONES.forEach(z=>{
    const patch=new THREE.Mesh(new THREE.BoxGeometry(z.w,.02,z.d),
      new THREE.MeshLambertMaterial({color:z.color,transparent:true,opacity:z.op||.55}));
    patch.position.set(z.x,.015,z.z);patch.receiveShadow=true;office.add(patch);
    const zc=document.createElement('canvas');zc.width=512;zc.height=96;
    const zx=zc.getContext('2d');
    zx.fillStyle='rgba(5,10,22,0.75)';
    zx.beginPath();zx.roundRect(4,4,504,88,20);zx.fill();
    zx.strokeStyle='#F59E0B';zx.lineWidth=3;zx.stroke();
    fitZoneLabel(zx,z.label);
    drawZoneLabel(zx,z.label);
    const zt=new THREE.CanvasTexture(zc);zt.minFilter=THREE.LinearFilter;
    const zl=new THREE.Sprite(new THREE.SpriteMaterial({map:zt,transparent:true,depthTest:false}));
    zl.center.set(.5,1);
    // label zona ditempatkan di tepi DEPAN zona (bukan tengah) supaya tidak menumpuk
    // name tag agent yang duduk/berdiri di dalam area zona
    const zly=zoneLabelY(z);
    zl.renderOrder=25; // di atas label agent (20) & layar presentasi board (5): label zona tak tertutup
    const zsc=zoneLabelScale(z.label); // label panjang lebih besar
    zl.scale.set(3.4*zsc,.64*zsc,1);
    zl.visible=ctx.namesVisible!==false; // ikut preferensi nama (persist wfs_names)
    zl.position.set(z.x,1.15,zly);office.add(zl);
    (window.__zoneLabels=window.__zoneLabels||[]).push(zl); // dipakai anti-tumpuk label
    zl.userData.label=z.label;
    (window.__zoneBase=window.__zoneBase||new Map()).set(zl,{y:zl.position.y,x:zl.position.x});
  });
}
