// parts/structure.js — OFFICE STRUCTURE: AO kontak, lantai parket, karpet,
// wainscot band, tekstur sky & glass sheen, glass edge frames.
// Builder murni (diuji unit): semua THREE & painter di-inject; urutan, posisi,
// warna & parameter mesh identik kode lama (tampilan tak berubah).
export function createStructure({ THREE, office, M, drawAoStrip, drawWoodFloor, drawSky, drawGlassSheen }) {
  // AO kontak: strip gradien gelap di pangkal 4 dinding (palsu ambient occlusion, membumikan dinding ke lantai)
  const aoMat=()=>new THREE.MeshBasicMaterial({map:(()=>{const c=document.createElement('canvas');c.width=16;c.height=64;
    const x=c.getContext('2d');drawAoStrip(x);return new THREE.CanvasTexture(c);})(),transparent:true,depthWrite:false});
  [[0,-13.5,33.4,0],[0,13.5,33.4,Math.PI],[-17,0,26.4,Math.PI/2],[17,0,26.4,-Math.PI/2]].forEach(([ax,az,len,rot],i)=>{
    const wide=i===3?1.25:0.95; // dinding kanan lebih lebar & pekat (di backlog tercatat tipis)
    const s=new THREE.Mesh(new THREE.PlaneGeometry(len,wide),aoMat());
    s.rotation.x=-Math.PI/2;s.rotation.z=rot;
    s.position.set(ax + (Math.abs(az)>Math.abs(ax)?(ax<0?0.42:-0.42):0),
                   0.006,
                   az + (Math.abs(az)>Math.abs(ax)?0:(az<0?0.42:-0.42)));
    s.renderOrder=1;office.add(s);
  });
  // lantai parket kayu prosedural — painter murni di parts/floor_canvas.js (diuji unit)
  const flc=document.createElement('canvas');flc.width=512;flc.height=512;
  drawWoodFloor(flc.getContext('2d'));
  const flTex=new THREE.CanvasTexture(flc);
  flTex.wrapS=flTex.wrapT=THREE.RepeatWrapping;flTex.repeat.set(7,5.5);flTex.anisotropy=4;
  const fl=new THREE.Mesh(new THREE.BoxGeometry(34,.15,27),
    new THREE.MeshLambertMaterial({map:flTex}));
  fl.position.y=-.075;fl.receiveShadow=true;office.add(fl);

  // Carpet
  const cp=new THREE.Mesh(new THREE.BoxGeometry(10,.02,8),M(0xD0D8E0));
  cp.position.set(-3,.01,0);cp.receiveShadow=true;office.add(cp);

  // Wainscot band (panel bawah dinding belakang & depan — dinding kanan/kiri punya panel sendiri di blok dinding)
  [[0,-13.5,34],[0,13.5,34]].forEach(([wx,wz,ww])=>{
    const band=new THREE.Mesh(new THREE.BoxGeometry(ww,1.1,.1),M(0xEFE9DD));
    band.position.set(wx,.55,wz+(wz<0?.06:-.06));band.castShadow=true;office.add(band);
    const trim=new THREE.Mesh(new THREE.BoxGeometry(ww,.06,.14),M(0xC9BFA8));
    trim.position.set(wx,1.12,wz+(wz<0?.06:-.06));trim.castShadow=true;office.add(trim);
  });
  // Wainscot band vertikal dinding kiri & kanan
  [[-17,0,27],[17,0,27]].forEach(([wx,wz,wd])=>{
    const band=new THREE.Mesh(new THREE.BoxGeometry(.1,1.1,wd),M(0xEFE9DD));
    band.position.set(wx+(wx<0?.06:-.06),.55,wz);band.castShadow=true;office.add(band);
    const trim=new THREE.Mesh(new THREE.BoxGeometry(.14,.06,wd),M(0xC9BFA8));
    trim.position.set(wx+(wx<0?.06:-.06),1.12,wz);trim.castShadow=true;office.add(trim);
  });
  // Jendela dengan pemandangan langit (dinding belakang & depan, atas wainscot)
  // Siklus 164: kanvas skyTex dipertahankan sebagai referensi (skyCv) —
  // createLighting me-repaint-nya siang↔malam via skyCv.__needsUpdate().
  const skyCv=document.createElement('canvas');skyCv.width=256;skyCv.height=128;
  const skyTex=new THREE.CanvasTexture(skyCv);
  drawSky(skyCv.getContext('2d'));
  skyCv.__needsUpdate=()=>{skyTex.needsUpdate=true;}; // repaint → re-upload GPU
  // sheen kaca: pantulan diagonal + tint biru — overlay plane di tiap jendela
  const glassSheen=(()=>{const c=document.createElement('canvas');c.width=256;c.height=128;
    const x=c.getContext('2d');
    drawGlassSheen(x);
    return new THREE.CanvasTexture(c);})();

  // Glass edge frames (subtle structural lines)
  [[-17,-13.5],[-17,13.5],[17,-13.5],[17,13.5]].forEach(([x,z])=>{
    const f=new THREE.Mesh(new THREE.BoxGeometry(.08,4,.08),M(0xAABBCC));
    f.position.set(x,2,z);office.add(f);
  });

  return { fl, cp, skyTex, glassSheen, skyCv };
}
