// Lantai zona & label area — ditulis ulang dari data tabel.
export function createZones(ctx){
  const { THREE, office } = ctx;
  const zoneData=[
    {x:-6, z:-1.2, w:11, d:7.5, color:0x1E3A5F, label:'DEV DESK'},
    {x:8,  z:-3,  w:5.4, d:5.4, color:0x4A3A1A, label:'MEETING', op:.9},
    {x:10.3,z:6.85,w:4.2,d:4.7, color:0x143326, label:'WELCOME & LOUNGE'},
    // CAFÉ patch menempel kafe fisik (counter L di -9.5,7.5) — dulu di tengah lantai
    // menimpa tepi meja SARI/SUPPORT HUMAN; WELCOME & LOUNGE digeser ke sofa lounge asli.
    {x:-9.3,z:8.0, w:4.4,d:2.4, color:0x2E1533, label:'CAFÉ'},
    {x:2.5,z:-8,  w:4,   d:2.6, color:0x1F1F2E, label:'SERVER ROOM', dy:-0.9},
  ];
  zoneData.forEach(z=>{
    const patch=new THREE.Mesh(new THREE.BoxGeometry(z.w,.02,z.d),
      new THREE.MeshLambertMaterial({color:z.color,transparent:true,opacity:z.op||.55}));
    patch.position.set(z.x,.015,z.z);patch.receiveShadow=true;office.add(patch);
    const zc=document.createElement('canvas');zc.width=512;zc.height=96;
    const zx=zc.getContext('2d');
    zx.fillStyle='rgba(5,10,22,0.75)';
    zx.beginPath();zx.roundRect(4,4,504,88,20);zx.fill();
    zx.strokeStyle='#F59E0B';zx.lineWidth=3;zx.stroke();
    let zfs=44;zx.font='800 '+zfs+'px "Segoe UI",Arial,sans-serif';
    while(zx.measureText(z.label).width>460&&zfs>20){zfs-=2;zx.font='800 '+zfs+'px "Segoe UI",Arial,sans-serif';}
    zx.textAlign='center';zx.textBaseline='middle';
    zx.fillStyle='#FFFFFF';zx.fillText(z.label,256,50);
    const zt=new THREE.CanvasTexture(zc);zt.minFilter=THREE.LinearFilter;
    const zl=new THREE.Sprite(new THREE.SpriteMaterial({map:zt,transparent:true,depthTest:false}));
    zl.center.set(.5,1);
    // label zona ditempatkan di tepi DEPAN zona (bukan tengah) supaya tidak menumpuk
    // name tag agent yang duduk/berdiri di dalam area zona
    const zly=z.z-z.d/2+0.7+(z.dy||0);
    zl.renderOrder=5;
    const zsc=(z.label.length>9)?1.25:1; // label panjang lebih besar
    zl.scale.set(3.4*zsc,.64*zsc,1);
    zl.visible=ctx.namesVisible!==false; // ikut preferensi nama (persist wfs_names)
    zl.position.set(z.x,1.15,zly);office.add(zl);
    (window.__zoneLabels=window.__zoneLabels||[]).push(zl); // dipakai anti-tumpuk label
    zl.userData.label=z.label;
    (window.__zoneBase=window.__zoneBase||new Map()).set(zl,{y:zl.position.y,x:zl.position.x});
  });
}
