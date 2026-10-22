import { wallFadeTick } from './wall_fade.js';
import { drawWallTex } from './wall_canvas.js';
import { drawWallLogo } from './logo_canvas.js';
import { drawWelcomeSign } from './sign_canvas.js';

// Builder murni dinding kantor (diekstrak dari OfficeScene.js — pola sama dgn structure/cafe/reception):
// 4 dinding solid + tiang, jendela sky-view + frame, sheen kaca, logo WFS, papan sambutan,
// lampu sorot logo, dan mekanisme fade dinding depan/kanan (wallDefs + collect + __wallFade).
// Konteks di-inject; urutan, posisi, warna & parameter mesh identik kode lama (tampilan tak berubah).
export function createWalls({ THREE, office, skyTex, glassSheen, fl, ceil }){
  const __wallObjs=[];
  const W=(geo,mat,x,y,z,ry)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);if(ry)m.rotation.y=ry;office.add(m);__wallObjs.push(m);return m};
  const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  const tex=(base,line,wpx=512,hpx=256,step=64)=>{
    const c=document.createElement('canvas');c.width=wpx;c.height=hpx;
    drawWallTex(c.getContext('2d'),base,line,wpx,hpx,step);
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
  };
  const lit=(map)=>new THREE.MeshBasicMaterial({map}); // tidak bergantung pencahayaan -> selalu terang & terbaca
  const upperA=tex('#E6EAF1','rgba(130,145,170,.30)');upperA.repeat.set(6,1);
  const woodA=tex('#8A6244','rgba(40,25,10,.40)',512,256,32);woodA.repeat.set(6,1);
  const upperB=tex('#E6EAF1','rgba(130,145,170,.30)');upperB.repeat.set(5,1);
  const woodB=tex('#8A6244','rgba(40,25,10,.40)',512,256,32);woodB.repeat.set(5,1);
  const NAVY=0x24304A, GOLD=0xD4AF37, TRIM=0xF4F6FA;
  const wallBack=[];
  const WB=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);office.add(m);wallBack.push(m);return m};

  // ---- DINDING BELAKANG (z=+9.5), menghadap -Z ----
  W(B(26,4,.2),lit(upperA),0,2,9.6);
  W(B(26,1.15,.24),lit(woodA),0,.575,9.5);
  W(B(26,.08,.3),new THREE.MeshBasicMaterial({color:NAVY}),0,1.19,9.46);
  W(B(26,.2,.34),new THREE.MeshBasicMaterial({color:TRIM}),0,3.9,9.44);       // crown molding putih tebal
  W(B(26,.14,.28),new THREE.MeshBasicMaterial({color:NAVY}),0,.07,9.47);      // plint
  [-13,-8,-3.4,5.4,10,13].forEach(x=>W(B(.3,4,.32),new THREE.MeshBasicMaterial({color:0xC7D0DE}),x,2,9.45));

  // ---- DINDING KIRI (x=-12.5), menghadap +X ----
  W(B(.2,4,20),lit(upperB),-12.6,2,0);
  W(B(.24,1.15,20),lit(woodB),-12.5,.575,0);
  W(B(.3,.08,20),new THREE.MeshBasicMaterial({color:NAVY}),-12.46,1.19,0);
  W(B(.34,.2,20),new THREE.MeshBasicMaterial({color:TRIM}),-12.44,3.9,0);
  W(B(.28,.14,20),new THREE.MeshBasicMaterial({color:NAVY}),-12.47,.07,0);
  [-9.5,-3.2,3.2,9.5].forEach(z=>W(B(.32,4,.3),new THREE.MeshBasicMaterial({color:0xC7D0DE}),-12.45,2,z));

  // ---- DINDING DEPAN (z=-9.5) & KANAN (x=+12.5): solid, memudar otomatis bila kamera ada di sisinya ----
  const fadeMats=[];
  const FM=(map,color)=>{const m=new THREE.MeshBasicMaterial(map?{map,transparent:true}:{color,transparent:true});fadeMats.push(m);return m};
  const upperF=tex('#E6EAF1','rgba(130,145,170,.30)');upperF.repeat.set(6,1);
  const woodF=tex('#8A6244','rgba(40,25,10,.40)',512,256,32);woodF.repeat.set(6,1);
  const upperR=tex('#E6EAF1','rgba(130,145,170,.30)');upperR.repeat.set(5,1);
  const woodR=tex('#8A6244','rgba(40,25,10,.40)',512,256,32);woodR.repeat.set(5,1);
  const wallFront=[], wallRight=[];
  const F=(arr,geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);office.add(m);arr.push(m);return m};
  // depan (z=-9.5), menghadap +Z
  F(wallFront,B(26,4,.2),FM(upperF),0,2,-9.6);
  F(wallFront,B(26,1.15,.24),FM(woodF),0,.575,-9.5);
  F(wallFront,B(26,.08,.3),FM(null,NAVY),0,1.19,-9.46);
  F(wallFront,B(26,.2,.34),FM(null,TRIM),0,3.9,-9.44);
  F(wallFront,B(26,.14,.28),FM(null,NAVY),0,.07,-9.47);
  [-13,-6.5,0,6.5,13].forEach(x=>F(wallFront,B(.3,4,.32),FM(null,0xC7D0DE),x,2,-9.45));
  // jendela di dinding depan
  [-8,-2,4,10].forEach(x=>{
    const wm=new THREE.MeshBasicMaterial({map:skyTex,transparent:true});fadeMats.push(wm);
    const win=new THREE.Mesh(new THREE.PlaneGeometry(3.0,1.9),wm);win.position.set(x,2.5,-9.38);office.add(win);wallFront.push(win);
    const FR=0x2B3446;
    F(wallFront,B(3.2,.1,.1),FM(null,FR),x,3.5,-9.36);F(wallFront,B(3.2,.1,.1),FM(null,FR),x,1.5,-9.36);
    F(wallFront,B(.1,2.1,.1),FM(null,FR),x-1.55,2.5,-9.36);F(wallFront,B(.1,2.1,.1),FM(null,FR),x+1.55,2.5,-9.36);
    F(wallFront,B(3.3,.07,.2),FM(null,TRIM),x,1.45,-9.3);
  });
  // kanan (x=+12.5), menghadap -X
  F(wallRight,B(.2,4,20),FM(upperR),12.6,2,0);
  F(wallRight,B(.24,1.15,20),FM(woodR),12.5,.575,0);
  F(wallRight,B(.3,.08,20),FM(null,NAVY),12.46,1.19,0);
  F(wallRight,B(.34,.2,20),FM(null,TRIM),12.44,3.9,0);
  F(wallRight,B(.28,.14,20),FM(null,NAVY),12.47,.07,0);
  [-9.5,-3.2,3.2,9.5].forEach(z=>F(wallRight,B(.32,4,.3),FM(null,0xC7D0DE),12.45,2,z));
  [-5.5,0.5,6].forEach(z=>{
    const wm=new THREE.MeshBasicMaterial({map:skyTex,transparent:true});fadeMats.push(wm);
    const win=new THREE.Mesh(new THREE.PlaneGeometry(3.0,1.9),wm);win.position.set(12.38,2.5,z);win.rotation.y=-Math.PI/2;office.add(win);wallRight.push(win);
    const FR=0x2B3446;
    F(wallRight,B(.1,.1,3.2),FM(null,FR),12.36,3.5,z);F(wallRight,B(.1,.1,3.2),FM(null,FR),12.36,1.5,z);
    F(wallRight,B(.1,2.1,.1),FM(null,FR),12.36,2.5,z-1.55);F(wallRight,B(.1,2.1,.1),FM(null,FR),12.36,2.5,z+1.55);
  });
  // fade: tembus pandang bila kamera berada di luar sisi dinding itu; ikut menyembunyikan saat nyaris tak terlihat
  // Empat dinding: tiap dinding punya daftar objek (dinding + dekor menempel + tiang sudut) dan sisi "luar".
  const wallDefs={
    front:{objs:wallFront,out:(c)=>-9.5-c.z},      // kamera di z < -9.5 => luar
    right:{objs:wallRight,out:(c)=>c.x-12.5},
    back :{objs:wallBack,out:(c)=>c.z-9.5},
    left :{objs:[],out:(c)=>-12.5-c.x},
  };
  let collected=false;
  const collect=()=>{
    collected=true;
    const known=new Set([...wallFront,...wallRight]);
    office.children.forEach(m=>{
      if(known.has(m)||!m.position||m===fl||m===ceil)return;
      if(!(m.isMesh||m.isSprite||m.isLight===false&&m.isGroup))return;
      const {x,y,z}=m, thin=0.55;
      if(y>4.3||y<0.0)return;
      // papan proyek nyata tidak ikut fade — data harus selalu terlihat
      if(m===window.__projectBoard||m===window.__projectBoard?.mesh)return;
      if(m.userData&&m.userData.__keep)return; // bingkai papan proyek juga dikecualikan
      const nearBack=Math.abs(z-9.5)<thin&&Math.abs(x)<=13, nearLeft=Math.abs(x+12.5)<thin&&Math.abs(z)<=10;
      if(nearBack&&!nearLeft)wallDefs.back.objs.push(m);
      else if(nearLeft&&!nearBack)wallDefs.left.objs.push(m);
    });
    __wallObjs.forEach(m=>{ if(!wallDefs.back.objs.includes(m)&&!wallDefs.left.objs.includes(m)){
      if(m.position.z>9)wallDefs.back.objs.push(m); else if(m.position.x<-12)wallDefs.left.objs.push(m)}});
    // semua material dinding belakang/kiri jadi transparan-bisa-diatur (klon agar tak bocor ke objek lain)
    ['back','left'].forEach(k=>wallDefs[k].objs.forEach(m=>{
      if(m.material&&!Array.isArray(m.material)&&!m.userData.__fm){m.material=m.material.clone();m.material.transparent=true;m.userData.__fm=1}}));
    // tiang sudut mengikuti dinding yang lebih terlihat
    window.__corners=office.children.filter(m=>m.isMesh&&Math.abs(Math.abs(m.position.x)-12.5)<.01&&Math.abs(Math.abs(m.position.z)-9.5)<.01&&Math.abs(m.position.y-2)<.01);
  };
  // fadeOf & penerapan fade diekstrak ke parts/wall_fade.js (murni, diuji unit):
  // wallFadeTick menghitung fade per dinding, menerapkan opacity/visible,
  // dan visibilitas tiang sudut — semantik persis kode lama.
  window.__wallFade=(cam)=>{
    if(!collected)collect();
    window.__wallLast=wallFadeTick(wallDefs,window.__corners,cam);
    return window.__wallLast;
  };
  window.__wallState=()=>window.__wallLast;
  // ---- LOGO WFS PROJECT besar di dinding belakang ----
  const lc=document.createElement('canvas');lc.width=2048;lc.height=640;const l=lc.getContext('2d');
  drawWallLogo(l);
  const lt=new THREE.CanvasTexture(lc);lt.anisotropy=4;
  const logo=new THREE.Mesh(new THREE.PlaneGeometry(8.6,2.69),new THREE.MeshBasicMaterial({map:lt}));
  logo.position.set(1.0,2.55,9.24);logo.rotation.y=Math.PI;logo.renderOrder=5;office.add(logo);__wallObjs.push(logo);
  W(B(8.8,2.9,.1),new THREE.MeshBasicMaterial({color:0x0F1B2E}),1.0,2.55,9.36);
  // lampu sorot di atas logo
  [-2,1,4].forEach(x=>{
    W(B(.5,.12,.2),new THREE.MeshBasicMaterial({color:0x222222}),x,4.0,9.2);
    W(B(.3,.04,.1),new THREE.MeshBasicMaterial({color:0xFFE9A8}),x,3.93,9.1);
  });
  const spot=new THREE.PointLight(0xFFE2A0,.9,8,1.5);spot.position.set(1,3.4,8.2);office.add(spot);

  // ---- Jendela sky-view di dinding belakang (sisi kanan logo, area kosong) ----
  [6.6,10.8].forEach(x=>{
    const wm=new THREE.MeshBasicMaterial({map:skyTex,transparent:true});fadeMats.push(wm);
    const win=new THREE.Mesh(new THREE.PlaneGeometry(3.4,1.9),wm);
    win.position.set(x,2.6,9.26);win.rotation.y=Math.PI;office.add(win);wallBack.push(win);
    const FR=0x2B3446;
    W(B(3.6,.1,.1),new THREE.MeshBasicMaterial({color:FR}),x,3.6,9.24);WB(B(3.6,.1,.1),new THREE.MeshBasicMaterial({color:FR}),x,1.6,9.24);
    WB(B(.1,2.1,.1),new THREE.MeshBasicMaterial({color:FR}),x-1.75,2.6,9.24);WB(B(.1,2.1,.1),new THREE.MeshBasicMaterial({color:FR}),x+1.75,2.6,9.24);
    WB(B(3.7,.07,.2),new THREE.MeshBasicMaterial({color:TRIM}),x,1.55,9.24);
  });

  // ---- Papan sambutan di dinding kiri ----
  const nc=document.createElement('canvas');nc.width=1024;nc.height=320;const n=nc.getContext('2d');
  drawWelcomeSign(n);
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(3.6,1.125),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(nc)}));
  sign.position.set(-12.3,2.6,5.4);sign.renderOrder=5;sign.rotation.y=Math.PI/2;office.add(sign);__wallObjs.push(sign);

  // ---- Jendela di dinding kiri ----
  [-3.4,1.4].forEach(z=>{
    const win=new THREE.Mesh(new THREE.PlaneGeometry(3.0,1.9),new THREE.MeshBasicMaterial({map:skyTex}));
    win.position.set(-12.3,2.5,z);win.rotation.y=Math.PI/2;office.add(win);__wallObjs.push(win);
    const FR=0x2B3446;
    W(B(.1,.1,3.2),new THREE.MeshBasicMaterial({color:FR}),-12.28,3.5,z);W(B(.1,.1,3.2),new THREE.MeshBasicMaterial({color:FR}),-12.28,1.5,z);
    W(B(.1,2.1,.1),new THREE.MeshBasicMaterial({color:FR}),-12.28,2.5,z-1.55);W(B(.1,2.1,.1),new THREE.MeshBasicMaterial({color:FR}),-12.28,2.5,z+1.55);
    W(B(.1,2.0,.05),new THREE.MeshBasicMaterial({color:FR}),-12.28,2.5,z);
    W(B(.2,.07,3.3),new THREE.MeshBasicMaterial({color:TRIM}),-12.25,1.45,z);
  });

  // ---- Sheen kaca: overlay pantulan diagonal di semua jendela (tampak seperti kaca sungguhan) ----
  const sh=(x,y,z,ry,w,h)=>{
    const s=new THREE.Mesh(new THREE.PlaneGeometry(w,h),
      new THREE.MeshBasicMaterial({map:glassSheen,transparent:true,depthWrite:false}));
    s.position.set(x,y,z);s.rotation.y=ry;s.renderOrder=3;office.add(s);
  };
  [[-8,-9.37,0],[-2,-9.37,0],[4,-9.37,0],[10,-9.37,0]].forEach(([x,z,ry])=>sh(x,2.5,z,ry,3.0,1.9));      // depan
  [[-5.5],[0.5],[6]].forEach(([z])=>sh(12.37,2.5,z,-Math.PI/2,3.0,1.9));                                  // kanan
  [[6.6],[10.8]].forEach(([x])=>sh(x,2.6,9.27,Math.PI,3.4,1.9));                                          // belakang
  [[-3.4],[1.4]].forEach(([z])=>sh(-12.29,2.5,z,Math.PI/2,3.0,1.9));                                      // kiri
  return { wallDefs, get collected(){return collected} };
}
