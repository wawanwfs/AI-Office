// Lantai zona & label area — ditulis ulang dari data tabel.
export function createZones(ctx){
  const { THREE, office } = ctx;
  const zoneData=[
    {x:-6, z:-1.2, w:11, d:7.5, color:0x1E3A5F, label:'DEV DESK'},
    {x:8,  z:-3,  w:5.4, d:5.4, color:0x4A3A1A, label:'MEETING', op:.9},
    {x:6,  z:6,   w:8,   d:4.5, color:0x143326, label:'WELCOME & LOUNGE'},
    {x:0,  z:6.5, w:5,   d:4,   color:0x2E1533, label:'CAFÉ'},
    {x:2.5,z:-8,  w:4,   d:2.6, color:0x1F1F2E, label:'SERVER ROOM'},
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
    const zl=new THREE.Mesh(new THREE.PlaneGeometry(3.4,.64),new THREE.MeshBasicMaterial({map:zt,transparent:true}));
    zl.rotation.x=-Math.PI/2;zl.rotation.z=Math.PI;
    const zly=(z.label==='MEETING')?z.z+3.4:(z.label==='SERVER ROOM')?z.z+1.8:z.z;
    zl.renderOrder=5;zl.material.depthTest=false;zl.material.transparent=true;
    zl.position.set(z.x,1.15,zly);office.add(zl);
    (window.__zoneLabels=window.__zoneLabels||[]).push(zl); // dipakai anti-tumpuk label
    zl.userData.label=z.label;
    (window.__zoneBase=window.__zoneBase||new Map()).set(zl,{y:zl.position.y,x:zl.position.x});
  });
}
