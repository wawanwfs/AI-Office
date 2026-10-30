import { wallFadeTick } from './wall_fade.js';
import { drawWallTex, WALL_NIGHT, TRIM_DAY, TRIM_NIGHT, PIER_DAY, PIER_NIGHT } from './wall_canvas.js';
import { drawWallLogo } from './logo_canvas.js';
import { drawWelcomeSign } from './sign_canvas.js';
import { uiTexture, uiMaterial } from './ui_colorspace.js';

// Builder murni dinding kampus WFS (diekstrak dari OfficeScene.js — pola sama dgn structure/cafe/reception):
// 4 dinding solid 34x27m (WALL_X=17, WALL_Z=13.5) + tiang, jendela sky-view + frame, sheen kaca,
// logo WFS, papan sambutan, lampu sorot logo, dan mekanisme fade dinding depan/kanan (wallDefs + collect + __wallFade).
// Konteks di-inject; koordinat dinding mengikuti deck kampus 34m (terraces cascading) agar interior tertutup penuh.
export function createWalls({ THREE, office, skyTex, glassSheen, fl, ceil, skyWinMats }){
  const __wallObjs=[];
  const W=(geo,mat,x,y,z,ry)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);if(ry)m.rotation.y=ry;office.add(m);__wallObjs.push(m);return m};
  const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  // ── Siklus 165: tekstur dinding siang↔malam ──
  // Dulu tiap tekstur dinding digambar SEKALI dgn palet siang (#E6EAF1/#8A6244)
  // via MeshBasicMaterial — jam malam dinding tetap terang penuh (kelas bug
  // jendela siklus 164). Painter drawWallTex parametrik → kanvas kini dicatat
  // (wallTexPaints) dan bisa di-REPAINT dgn palet malam WALL_NIGHT tanpa
  // membuat objek baru: semua material (termasuk klon wall-fade) berbagi map
  // dgn referensi sama, cukup tex.needsUpdate (re-upload GPU).
  const wallTexPaints=[]; // {cv,tex,base,line,wpx,hpx,step} — referensi utk repaint
  const tex=(base,line,wpx=512,hpx=256,step=64)=>{
    const c=document.createElement('canvas');c.width=wpx;c.height=hpx;
    drawWallTex(c.getContext('2d'),base,line,wpx,hpx,step);
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;
    wallTexPaints.push({cv:c,tex:t,base,line,wpx,hpx,step});
    return t;
  };
  // paintWallNight(night): repaint SEMUA kanvas dinding dgn palet terpilih.
  // Guard status ada di pemanggil (daycycle) — fungsi ini murni repaint + flag.
  const paintWallNight=(night)=>{
    wallTexPaints.forEach(({cv,tex:t,base,line,wpx,hpx,step})=>{
      // wainscot kayu (step 32) pakai palet kayu malam; panel atas pakai palet panel.
      const pal=night?(step===32?WALL_NIGHT.wood:WALL_NIGHT.upper):null;
      drawWallTex(cv.getContext('2d'),pal?pal.base:base,pal?pal.line:line,wpx,hpx,step);
      t.needsUpdate=true;
    });
    return wallTexPaints.length;
  };
  const lit=(map)=>new THREE.MeshBasicMaterial({map}); // tidak bergantung pencahayaan -> selalu terang & terbaca
  const upperA=tex('#E6EAF1','rgba(120,138,165,.48)');upperA.repeat.set(16,1);
  const woodA=tex('#8A6244','rgba(40,25,10,.40)',512,256,32);woodA.repeat.set(12,1);
  const upperB=tex('#E6EAF1','rgba(120,138,165,.48)');upperB.repeat.set(9,1);
  const woodB=tex('#8A6244','rgba(40,25,10,.40)',512,256,32);woodB.repeat.set(9,1);
  const NAVY=0x24304A, GOLD=0xD4AF37, TRIM=0xF4F6FA;
  // ── Siklus 166: TRIM (crown molding/sill) & PILAR (0x8E9BB0) ikut siang↔malam ──
  // Dulu warna solid MeshBasicMaterial ini statis: jam malam panel dinding sudah
  // gelap (palet WALL_NIGHT, siklus 165) tapi lis putih #F4F6FA & pilar abu terang
  // #8E9BB0 (lum sRGB ~152) tetap menyala — kelas bug sama dgn jendela (164) &
  // panel dinding (165). Warna solid tanpa map → pola repaint kanvas tak berlaku.
  // PENTING: mekanisme wall-fade (collect) meng-CLONE material mesh dinding depan/
  // kanan/belakang/kiri pada tick pertama — klon menyalin NILAI warna, bukan
  // referensi, jadi set per-material akan melewatkan klon. Karena itu yang dicatat
  // adalah MESH-nya (userData.__trim = {day,night}): referensi mesh selamat dari
  // swap material, dan material AKTIF (asli maupun klon) di-resolve saat paint.
  const trimPaints=[]; // {mat,day,night} — inventaris material asli (introspeksi uji)
  const note=(mat,day,night)=>{ if(mat) trimPaints.push({mat,day,night}); return mat; };
  const trimMat=()=>note(new THREE.MeshBasicMaterial({color:TRIM_DAY}),TRIM_DAY,TRIM_NIGHT);
  const pierMat=()=>note(new THREE.MeshBasicMaterial({color:PIER_DAY}),PIER_DAY,PIER_NIGHT);
  // Tag SEMUA mesh pemakai material trim/pilar (sekali di akhir createWalls —
  // sebelum tick fade pertama; userData milik mesh, selamat dari swap material).
  const tagTrimMeshes=()=>{
    if(!office || typeof office.traverse!=='function') return 0;
    const inv=new Map(trimPaints.map(({mat,day,night:nc})=>[mat,{day,night:nc}]));
    let n=0;
    office.traverse(o=>{
      if(o.isMesh && o.material && inv.has(o.material)){ o.userData.__trim=inv.get(o.material); n++; }
    });
    return n;
  };
  // Set warna via mesh ter-tag → material AKTIF (asli maupun klon wall-fade) ikut.
  const paintTrimNight=(night)=>{
    if(!office || typeof office.traverse!=='function') return 0;
    let n=0;
    office.traverse(o=>{
      if(o.isMesh && o.userData && o.userData.__trim && o.material && o.material.color){
        const t=o.userData.__trim;
        o.material.color.set(night?t.night:t.day); n++;
      }
    });
    return n;
  };
  const WX=17, WZ=13.5;            // setengah dimensi kampus 34 x 27 m
  const wallBack=[];
  const WB=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);office.add(m);wallBack.push(m);return m};

  // ---- DINDING BELAKANG (z=+13.5), menghadap -Z ----
  W(B(34,4,.2),lit(upperA),0,2,13.6);
  W(B(34,1.15,.24),lit(woodA),0,.575,13.5);
  W(B(34,.08,.3),new THREE.MeshBasicMaterial({color:NAVY}),0,1.19,13.46);
  W(B(34,.2,.34),trimMat(),0,3.9,13.44);       // crown molding putih tebal
  W(B(34,.14,.28),new THREE.MeshBasicMaterial({color:NAVY}),0,.07,13.47);      // plint
  [-16,-12,-8,-4,0,4,8,12,16].forEach(x=>W(B(.3,4,.32),pierMat(),x,2,13.45));

  // ---- DINDING KIRI (x=-17), menghadap +X ----
  W(B(.2,4,27),lit(upperB),-17.1,2,0);
  W(B(.24,1.15,27),lit(woodB),-17,.575,0);
  W(B(.3,.08,27),new THREE.MeshBasicMaterial({color:NAVY}),-16.96,1.19,0);
  W(B(.34,.2,27),trimMat(),-16.94,3.9,0);
  W(B(.28,.14,27),new THREE.MeshBasicMaterial({color:NAVY}),-16.97,.07,0);
  [-12,-7.5,-3,1.5,6,10.5].forEach(z=>W(B(.32,4,.3),pierMat(),-16.95,2,z));

  // ---- DINDING DEPAN (z=-13.5) & KANAN (x=+17): solid, memudar otomatis bila kamera ada di sisinya ----
  const fadeMats=[];
  // FM(map,color): bila `color` sudah MATERIAL jadi (siklus 166: trimMat/pierMat —
  // material tercatat utk repaint malam), pakai LANGSUNG (jangan bungkus material
  // baru dgn color=material); tetap didaftarkan ke fadeMats + transparent agar
  // ikut fade dinding depan/kanan.
  const FM=(map,color)=>{const m=(color&&typeof color==='object')?color:new THREE.MeshBasicMaterial(map?{map,transparent:true}:{color,transparent:true});m.transparent=true;fadeMats.push(m);return m};
  const upperF=tex('#E6EAF1','rgba(120,138,165,.48)');upperF.repeat.set(16,1);
  const woodF=tex('#8A6244','rgba(40,25,10,.40)',512,256,32);woodF.repeat.set(12,1);
  const upperR=tex('#E6EAF1','rgba(120,138,165,.48)');upperR.repeat.set(9,1);
  const woodR=tex('#8A6244','rgba(40,25,10,.40)',512,256,32);woodR.repeat.set(9,1);
  const wallFront=[], wallRight=[];
  const F=(arr,geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);office.add(m);arr.push(m);return m};
  // depan (z=-13.5), menghadap +Z
  F(wallFront,B(34,4,.2),FM(upperF),0,2,-13.6);
  F(wallFront,B(34,1.15,.24),FM(woodF),0,.575,-13.5);
  F(wallFront,B(34,.08,.3),FM(null,NAVY),0,1.19,-13.46);
  F(wallFront,B(34,.2,.34),FM(null,trimMat()),0,3.9,-13.44);
  F(wallFront,B(34,.14,.28),FM(null,NAVY),0,.07,-13.47);
  [-16,-12,-8,-4,0,4,8,12,16].forEach(x=>F(wallFront,B(.3,4,.32),FM(null,pierMat()),x,2,-13.45));
  // jendela di dinding depan
  [-12,-6,-0.5,5,10.5].forEach(x=>{
    const wm=new THREE.MeshBasicMaterial({map:skyTex,transparent:true});fadeMats.push(wm);
    if(skyWinMats)skyWinMats.push(wm); // daftar utk mode neon (tint malam)
    const win=new THREE.Mesh(new THREE.PlaneGeometry(3.0,1.9),wm);win.position.set(x,2.5,-13.38);office.add(win);wallFront.push(win);
    const FR=0x2B3446;
    F(wallFront,B(3.2,.1,.1),FM(null,FR),x,3.5,-13.36);F(wallFront,B(3.2,.1,.1),FM(null,FR),x,1.5,-13.36);
    F(wallFront,B(.1,2.1,.1),FM(null,FR),x-1.55,2.5,-13.36);F(wallFront,B(.1,2.1,.1),FM(null,FR),x+1.55,2.5,-13.36);
    F(wallFront,B(3.3,.07,.2),FM(null,trimMat()),x,1.45,-13.3);
  });
  // kanan (x=+17), menghadap -X
  F(wallRight,B(.2,4,27),FM(upperR),17.1,2,0);
  F(wallRight,B(.24,1.15,27),FM(woodR),17,.575,0);
  F(wallRight,B(.3,.08,27),FM(null,NAVY),16.96,1.19,0);
  F(wallRight,B(.34,.2,27),FM(null,trimMat()),16.94,3.9,0);
  F(wallRight,B(.28,.14,27),FM(null,NAVY),16.97,.07,0);
  [-12,-7.5,-3,1.5,6,10.5].forEach(z=>F(wallRight,B(.32,4,.3),FM(null,pierMat()),16.95,2,z));
  [-10,-4.5,1,6.5].forEach(z=>{
    const wm=new THREE.MeshBasicMaterial({map:skyTex,transparent:true});fadeMats.push(wm);
    if(skyWinMats)skyWinMats.push(wm);
    const win=new THREE.Mesh(new THREE.PlaneGeometry(3.0,1.9),wm);win.position.set(16.88,2.5,z);win.rotation.y=-Math.PI/2;office.add(win);wallRight.push(win);
    const FR=0x2B3446;
    F(wallRight,B(.1,.1,3.2),FM(null,FR),16.86,3.5,z);F(wallRight,B(.1,.1,3.2),FM(null,FR),16.86,1.5,z);
    F(wallRight,B(.1,2.1,.1),FM(null,FR),16.86,2.5,z-1.55);F(wallRight,B(.1,2.1,.1),FM(null,FR),16.86,2.5,z+1.55);
  });
  // ---- Tiang sudut struktural 4 kombinasi (±17, ±13.5) — menyatu dgn glass edge frame structure.js ----
  [[-17,-13.5],[-17,13.5],[17,-13.5],[17,13.5]].forEach(([cx,cz])=>{
    W(B(.34,4,.34),pierMat(),cx,2,cz);
  });


  // ---- Kotak bunga di bawah jendela depan & kanan (kesan hidup & berwarna) ----
  // Siklus 167: warna bunga masuk inventaris trim (pasangan day/night per warna)
  // → ikut paintTrimNight — dulu krem #F6F2EA & kuning #F2C14E tetap menyala saat
  // malam (36 mesh MB statis di bawah jendela, terbaca di audit scene live).
  const FLW=[0xE86A92,0xF2C14E,0x7FC8A9,0xF6F2EA];
  const FLW_NIGHT=[0x5A2740,0x6B4E1E,0x1F4F3E,0x3A4256];
  [-12,-6,-0.5,5,10.5].forEach(x=>{
    W(B(3.0,.22,.5),new THREE.MeshBasicMaterial({color:0x3A4A5E}),x,1.32,-13.28);
    [-0.9,-0.3,0.3,0.9].forEach((dx,i)=>W(B(.16,.16,.16),note(new THREE.MeshBasicMaterial({color:FLW[i]}),FLW[i],FLW_NIGHT[i]),x+dx,1.5,-13.28));
  });
  [-10,-4.5,1,6.5].forEach(z=>{
    W(B(.5,.22,3.0),new THREE.MeshBasicMaterial({color:0x3A4A5E}),16.7,1.32,z);
    [-0.9,-0.3,0.3,0.9].forEach((dz,i)=>W(B(.16,.16,.16),note(new THREE.MeshBasicMaterial({color:FLW[i]}),FLW[i],FLW_NIGHT[i]),16.7,1.5,z+dz));
  });
  // fade: tembus pandang bila kamera berada di luar sisi dinding itu; ikut menyembunyikan saat nyaris tak terlihat
  // Empat dinding: tiap dinding punya daftar objek (dinding + dekor menempel + tiang sudut) dan sisi "luar".
  const wallDefs={
    front:{objs:wallFront,out:(c)=>-13.5-c.z},      // kamera di z < -13.5 => luar
    right:{objs:wallRight,out:(c)=>c.x-17},
    back :{objs:wallBack,out:(c)=>c.z-13.5},
    left :{objs:[],out:(c)=>-17-c.x},
  };
  let collected=false;
  const collect=()=>{
    collected=true;
    const known=new Set([...wallFront,...wallRight]);
    office.children.forEach(m=>{
      if(known.has(m)||!m.position||m===fl||m===ceil)return;
      if(!(m.isMesh||m.isSprite||m.isLight===false&&m.isGroup))return;
      const {x,y,z}=m.position, thin=0.55;
      if(y>4.3||y<0.0)return;
      // papan proyek nyata tidak ikut fade — data harus selalu terlihat
      if(m===window.__projectBoard||m===window.__projectBoard?.mesh)return;
      if(m.userData&&m.userData.__keep)return; // bingkai papan proyek juga dikecualikan
      const nearBack=Math.abs(z-13.5)<thin&&Math.abs(x)<=17, nearLeft=Math.abs(x+17)<thin&&Math.abs(z)<=13.5;
      if(nearBack&&!nearLeft)wallDefs.back.objs.push(m);
      else if(nearLeft&&!nearBack)wallDefs.left.objs.push(m);
    });
    __wallObjs.forEach(m=>{ if(!wallDefs.back.objs.includes(m)&&!wallDefs.left.objs.includes(m)){
      if(m.position.z>13)wallDefs.back.objs.push(m); else if(m.position.x<-16.5)wallDefs.left.objs.push(m)}});
    // semua material dinding belakang/kiri jadi transparan-bisa-diatur (klon agar tak bocor ke objek lain)
    ['back','left'].forEach(k=>wallDefs[k].objs.forEach(m=>{
      if(m.material&&!Array.isArray(m.material)&&!m.userData.__fm){
        const old=m.material;
        m.material=old.clone();m.material.transparent=true;m.userData.__fm=1;
        // Siklus 170: registry neon skyWinMats memegang material ASLI — remap ke
        // klon agar tint jendela mode neon tetap kena. Dulu 4 jendela belakang/kiri
        // meleset: registry pegang material basi, tint di-set ke objek mati dan
        // jendela tetap putih terang di tengah ruangan neon gelap.
        if(skyWinMats){const ix=skyWinMats.indexOf(old);if(ix>=0)skyWinMats[ix]=m.material;}
      }}));
    // tiang sudut mengikuti dinding yang lebih terlihat
    window.__corners=office.children.filter(m=>m.isMesh&&Math.abs(Math.abs(m.position.x)-17)<.1&&Math.abs(Math.abs(m.position.z)-13.5)<.1&&Math.abs(m.position.y-2)<.01);
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
  const lt=new THREE.CanvasTexture(lc);lt.anisotropy=4;uiTexture(lt);
  const logo=new THREE.Mesh(new THREE.PlaneGeometry(8.6,2.69), uiMaterial(new THREE.MeshBasicMaterial({map:lt})));
  logo.position.set(1.0,2.55,13.24);logo.rotation.y=Math.PI;logo.renderOrder=5;office.add(logo);__wallObjs.push(logo);
  W(B(8.8,2.9,.1),new THREE.MeshBasicMaterial({color:0x14243D}),1.0,2.55,13.36);
  // lampu sorot di atas logo
  [-2,1,4].forEach(x=>{
    W(B(.5,.12,.2),new THREE.MeshBasicMaterial({color:0x222222}),x,4.0,13.2);
    W(B(.3,.04,.1),new THREE.MeshBasicMaterial({color:0xFFE9A8}),x,3.93,13.1);
  });
  const spot=new THREE.PointLight(0xFFE2A0,.9,8,1.5);spot.position.set(1,3.4,12.2);office.add(spot);

  // ---- Jendela sky-view di dinding belakang (sisi kanan logo, area kosong) ----
  [6.6,10.8].forEach(x=>{
    const wm=new THREE.MeshBasicMaterial({map:skyTex,transparent:true});fadeMats.push(wm);
    if(skyWinMats)skyWinMats.push(wm);
    const win=new THREE.Mesh(new THREE.PlaneGeometry(3.4,1.9),wm);
    win.position.set(x,2.6,13.26);win.rotation.y=Math.PI;office.add(win);wallBack.push(win);
    const FR=0x2B3446;
    W(B(3.6,.1,.1),new THREE.MeshBasicMaterial({color:FR}),x,3.6,13.24);WB(B(3.6,.1,.1),new THREE.MeshBasicMaterial({color:FR}),x,1.6,13.24);
    WB(B(.1,2.1,.1),new THREE.MeshBasicMaterial({color:FR}),x-1.75,2.6,13.24);WB(B(.1,2.1,.1),new THREE.MeshBasicMaterial({color:FR}),x+1.75,2.6,13.24);
    WB(B(3.7,.07,.2),trimMat(),x,1.55,13.24);
  });

  // ---- Papan sambutan di dinding kiri ----
  const nc=document.createElement('canvas');nc.width=1024;nc.height=320;const n=nc.getContext('2d');
  drawWelcomeSign(n);
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(3.6,1.125), uiMaterial(new THREE.MeshBasicMaterial({map:uiTexture(new THREE.CanvasTexture(nc))})));
  sign.position.set(-16.8,2.6,5.4);sign.renderOrder=5;sign.rotation.y=Math.PI/2;office.add(sign);__wallObjs.push(sign);

  // ---- Jendela di dinding kiri ----
  [-3.4,1.4].forEach(z=>{
    const win=new THREE.Mesh(new THREE.PlaneGeometry(3.0,1.9),new THREE.MeshBasicMaterial({map:skyTex}));
    if(skyWinMats)skyWinMats.push(win.material);
    win.position.set(-16.8,2.5,z);win.rotation.y=Math.PI/2;office.add(win);__wallObjs.push(win);
    const FR=0x2B3446;
    W(B(.1,.1,3.2),new THREE.MeshBasicMaterial({color:FR}),-16.78,3.5,z);W(B(.1,.1,3.2),new THREE.MeshBasicMaterial({color:FR}),-16.78,1.5,z);
    W(B(.1,2.1,.1),new THREE.MeshBasicMaterial({color:FR}),-16.78,2.5,z-1.55);W(B(.1,2.1,.1),new THREE.MeshBasicMaterial({color:FR}),-16.78,2.5,z+1.55);
    W(B(.1,2.0,.05),new THREE.MeshBasicMaterial({color:FR}),-16.78,2.5,z);
    W(B(.2,.07,3.3),trimMat(),-16.75,1.45,z);
  });

  // ---- Sheen kaca: overlay pantulan diagonal di semua jendela (tampak seperti kaca sungguhan) ----
  const sh=(x,y,z,ry,w,h)=>{
    const s=new THREE.Mesh(new THREE.PlaneGeometry(w,h),
      new THREE.MeshBasicMaterial({map:glassSheen,transparent:true,depthWrite:false}));
    s.position.set(x,y,z);s.rotation.y=ry;s.renderOrder=3;office.add(s);
  };
  [[-12,-13.37,0],[-6,-13.37,0],[-0.5,-13.37,0],[5,-13.37,0],[10.5,-13.37,0]].forEach(([x,z,ry])=>sh(x,2.5,z,ry,3.0,1.9));   // depan
  [[-10],[-4.5],[1],[6.5]].forEach(([z])=>sh(16.87,2.5,z,-Math.PI/2,3.0,1.9));                                               // kanan
  [[6.6],[10.8]].forEach(([x])=>sh(x,2.6,13.27,Math.PI,3.4,1.9));                                                              // belakang
  [[-3.4],[1.4]].forEach(([z])=>sh(-16.79,2.5,z,Math.PI/2,3.0,1.9));                                                           // kiri
  tagTrimMeshes();
  return { wallDefs, get collected(){return collected}, paintWallNight, paintTrimNight, get wallTexCount(){return wallTexPaints.length}, get wallTexPaints(){return wallTexPaints}, get trimCount(){return trimPaints.length}, get trimPaints(){return trimPaints}, get flowerDay(){return FLW}, get flowerNight(){return FLW_NIGHT} };
}
