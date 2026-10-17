import * as THREE from 'three';
import { createFurniture } from './parts/furniture.js';
import { buildRobot } from './parts/robot.js';
import { createLighting, createNeonMode, createShift, mixHex } from './parts/daycycle.js';
import { createZones } from './parts/flooring.js';
import { createMeeting } from './parts/meeting.js';
import { createMotion } from './parts/motion.js';
import { drawScreenFrame, createDriftingPages, addDeskTrinkets } from './parts/effects.js';
import { createMeetingRoom, createWallClock, createCeilingFixtures } from './parts/room.js';

export function createOfficeScene(container, callbacks = {}) {
  const { onTimeUpdate, onStatusUpdate, onMeetingChange } = callbacks;

// ═══════════════════════════════════════════════════
// THE AGENCY v3
// ═══════════════════════════════════════════════════
class RNG{constructor(s=42){this.s=s}n(){this.s=(this.s*16807)%2147483647;return(this.s-1)/2147483646}r(a,b){return a+this.n()*(b-a)}i(a,b){return Math.floor(this.r(a,b+1))}pick(a){return a[this.i(0,a.length-1)]}}
const rng=new RNG(2026);

const AGENTS=[
  {name:'BANTUIN AI', color:0x10E5A0,hex:'#10E5A0',role:'AI Customer Service', screen:'terminal',hair:0x1a1a2e,shirt:0x0B4F3A,pants:0x08281F},
  {name:'BUDI',       color:0x3B82F6,hex:'#3B82F6',role:'Backend Engineer',    screen:'charts',  hair:0x222222,shirt:0x1E3A8A,pants:0x111827},
  {name:'RIZKY',      color:0x22D3EE,hex:'#22D3EE',role:'Backend Engineer',    screen:'terminal',hair:0x1a1a1a,shirt:0x155E75,pants:0x164E63},
  {name:'DEWI',       color:0xF472B6,hex:'#F472B6',role:'Frontend Engineer',   screen:'palette', hair:0x4A148C,shirt:0x9D174D,pants:0x1a1a2e},
  {name:'ANDI',       color:0xFBBF24,hex:'#FBBF24',role:'Frontend Engineer',   screen:'deploy',  hair:0x3E2723,shirt:0x92400E,pants:0x263238},
  {name:'YOGA',       color:0x60A5FA,hex:'#60A5FA',role:'Mobile Engineer',     screen:'map',     hair:0x111111,shirt:0x1D4ED8,pants:0x1F2937},
  {name:'MAYA',       color:0xA78BFA,hex:'#A78BFA',role:'UI/UX Designer',      screen:'docs',    hair:0x4E342E,shirt:0x6D28D9,pants:0x1a1a2e},
  {name:'TONI',       color:0x34D399,hex:'#34D399',role:'DevOps Engineer',     screen:'bugs',    hair:0x263238,shirt:0x065F46,pants:0x212121},
];
// Agent tambahan WFS (dipetakan ke desk ekstra di kanan)
const AGENTS_EXTRA=[
  {name:'RINA',   color:0xFB7185,hex:'#FB7185',role:'QA Engineer',        screen:'bugs',    hair:0x5D1A1A,shirt:0x9F1239,pants:0x1F2937},
  {name:'LINA',   color:0xFB923C,hex:'#FB923C',role:'Growth Marketing',   screen:'charts',  hair:0x3E2723,shirt:0xC2410C,pants:0x292524},
  {name:'SARI',   color:0xF59E0B,hex:'#F59E0B',role:'Project Manager',    screen:'deploy',  hair:0x2D1B0E,shirt:0xB45309,pants:0x1C1917},
  {name:'TRAINER AI', color:0x8B5CF6,hex:'#8B5CF6',role:'AI Knowledge Engineer', screen:'terminal',hair:0x111827,shirt:0x4C1D95,pants:0x1E1B4B},
  {name:'INTEGRATOR BOT', color:0x06B6D4,hex:'#06B6D4',role:'Integration Engineer', screen:'terminal',hair:0x0F172A,shirt:0x155E75,pants:0x083344},
  {name:'SUPPORT HUMAN', color:0x84CC16,hex:'#84CC16',role:'Customer Success', screen:'docs',   hair:0x3B2412,shirt:0x3F6212,pants:0x1A2E05},
];

// Legend



// ─── SCENE ─────────────────────────────────────────
const scene=new THREE.Scene();
scene.name = 'Office3D';
 scene.background=new THREE.Color(0x000C1E);
 scene.fog=new THREE.FogExp2(0x000C1E,0.005);
 const camera=new THREE.PerspectiveCamera(30,container.clientWidth/container.clientHeight,0.1,500);
 let renderer=null;
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,failIfMajorPerformanceCaveat:false});
  }catch(e){
    // WebGL tidak tersedia (mis. headless / GPU block) — render UI 2D saja, scene 3D dilewati
    console.warn('WebGL unavailable, running in UI-only mode:',e.message);
  }
  if(renderer){
    renderer.setSize(container.clientWidth,container.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.toneMappingExposure=1.1;
    container.appendChild(renderer.domElement);
  }

// ─── ORBIT ─────────────────────────────────────────
let isDrag=false,prev={x:0,y:0};
let namesVisible=true;
const __asp=container.clientWidth/Math.max(1,container.clientHeight);
const __portrait=__asp<0.8;
if(__portrait){camera.fov=__asp<0.6?66:54;camera.updateProjectionMatrix();}
let sph={theta:__portrait?2.35:Math.PI*0.78,phi:__portrait?0.62:1.0,radius:__asp<0.6?46:__asp<0.8?44:__asp<1.2?56:__asp<1.5?47:40};
const tgt=new THREE.Vector3(0,1.8,0);
let autoRot=true,autoTmr;
let focusGoal=null;const HOME_TGT=new THREE.Vector3(0,1.8,0);let homeRadius=null;
function updCam(){const p=Math.max(.18,Math.min(Math.PI/2.3,sph.phi));sph.phi=p;camera.position.set(sph.radius*Math.sin(p)*Math.sin(sph.theta)+tgt.x,sph.radius*Math.cos(p)+tgt.y,sph.radius*Math.sin(p)*Math.cos(sph.theta)+tgt.z);camera.lookAt(tgt)}
const __vo=()=>{const w=container.clientWidth,h=container.clientHeight;if(w/h<0.6)camera.setViewOffset(w,h,-w*0.045,0,w,h);else camera.clearViewOffset()};__vo();
updCam();
let downXY=null;
// Touch pinch-zoom untuk mobile
let pinchDist=null;
renderer.domElement&&renderer.domElement.addEventListener('touchstart',e=>{
  if(e.touches.length===2){
    pinchDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
  }
},{passive:true});
renderer.domElement&&renderer.domElement.addEventListener('touchmove',e=>{
  if(e.touches.length===2&&pinchDist!==null){
    e.preventDefault();
    const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    sph.radius=Math.max(12,Math.min(130,sph.radius-(d-pinchDist)*.05));
    updCam();pinchDist=d;
  }
},{passive:false});
renderer.domElement&&renderer.domElement.addEventListener('touchend',()=>{pinchDist=null},{passive:true});
renderer.domElement&&renderer.domElement.addEventListener('pointerdown',e=>{isDrag=true;prev={x:e.clientX,y:e.clientY};autoRot=false;clearTimeout(autoTmr);initAudio()});
renderer.domElement&&renderer.domElement.addEventListener('pointerdown',e=>{downXY={x:e.clientX,y:e.clientY}});
renderer.domElement&&renderer.domElement.addEventListener('pointerup',e=>{
  if(!downXY)return;
  const moved=Math.hypot(e.clientX-downXY.x,e.clientY-downXY.y);
  downXY=null;
  if(moved>6)return; // drag, bukan click
  const ndc=new THREE.Vector2((e.clientX/innerWidth)*2-1,-(e.clientY/innerHeight)*2+1);
  const ray=new THREE.Raycaster();
  ray.setFromCamera(ndc,camera);
  const targets=[];
  agentData.forEach(ad=>{ if(ad.sittingChar.visible)targets.push(ad.sittingChar); if(ad.walker.visible)targets.push(ad.walker); });
  const hits=ray.intersectObjects(targets.map(t=>t),true);
  if(!hits.length){ if(focusGoal){focusGoal={t:HOME_TGT.clone(),r:homeRadius,reset:true}} return; }
  let obj=hits[0].object;let root=null;
  agentData.forEach(ad=>{ if(ad.sittingChar===obj||ad.walker===obj)root=ad; });
  if(!root){
    let p=hits[0].object;
    while(p){ const f=agentData.find(ad=>ad.sittingChar===p||ad.walker===p); if(f){root=f;break} p=p.parent; }
  }
  if(root&&window.__wfsSelectAgent){
    const idMap={}; window.__wfsAgentIdList&&window.__wfsAgentIdList.forEach(x=>idMap[x.name]=x.id);
    window.__wfsSelectAgent(idMap[root.agent.name]||root.agent.name);
    const wp=root.walker.visible?root.walker.position:{x:root.home.x,y:0,z:root.home.z};
    if(homeRadius===null)homeRadius=sph.radius;
    focusGoal={t:new THREE.Vector3(wp.x,1.5,wp.z),r:Math.min(sph.radius,24)};
    createBubble(wp.x,2.6,wp.z,'“Halo! Aku '+root.agent.name+' 👋”',root.agent.hex);
  }
});
addEventListener('pointerup',()=>{isDrag=false;autoTmr=setTimeout(()=>autoRot=true,6000)});
addEventListener('pointermove',e=>{if(!isDrag)return;sph.theta-=(e.clientX-prev.x)*.005;sph.phi+=(e.clientY-prev.y)*.005;prev={x:e.clientX,y:e.clientY};updCam()});
renderer.domElement&&renderer.domElement.addEventListener('wheel',e=>{sph.radius=Math.max(12,Math.min(130,sph.radius+e.deltaY*.04));updCam()},{passive:true});

// ─── LIGHTS ────────────────────────────────────────
const ambient=new THREE.AmbientLight(0xffffff,0.38);scene.add(ambient);
const sun=new THREE.DirectionalLight(0xFFF8F0,1.35);
sun.position.set(12,20,10);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.bias=-.0006;sun.shadow.normalBias=.02;
scene.add(sun);
scene.add(new THREE.DirectionalLight(0xCCDDFF,0.3).translateX(-10).translateY(12));
scene.add(new THREE.HemisphereLight(0xDDE8F0,0x607080,0.28));

// ─── HELPERS ───────────────────────────────────────
const office=new THREE.Group();scene.add(office);
const M=(c,o={})=>new THREE.MeshLambertMaterial({color:c,...o});
const MB=c=>new THREE.MeshBasicMaterial({color:c});
const Glass=()=>new THREE.MeshPhysicalMaterial({color:0xBBCCDD,transparent:true,opacity:0.08,roughness:0});
// contact blob shadow — bidang radial gradient semi-transparan di lantai, anchor bayangan objek
const __blobTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');
  const g=x.createRadialGradient(64,64,4,64,64,62);g.addColorStop(0,'rgba(10,14,18,0.55)');g.addColorStop(0.55,'rgba(10,14,18,0.30)');g.addColorStop(1,'rgba(10,14,18,0)');
  x.fillStyle=g;x.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
const __blobMat=new THREE.MeshBasicMaterial({map:__blobTex,transparent:true,depthWrite:false,opacity:1});
function addBlobShadow(obj,r=0.55){
  const b=new THREE.Mesh(new THREE.PlaneGeometry(r*2,r*2),__blobMat);
  b.rotation.x=-Math.PI/2;b.position.y=0.012;b.renderOrder=2;
  b.userData.blob=true;obj.add(b);return b;
}

// ═══════════════════════════════════════════════════
// OFFICE STRUCTURE
// ═══════════════════════════════════════════════════

// Floor

// AO kontak: strip gradien gelap di pangkal 4 dinding (palsu ambient occlusion, membumikan dinding ke lantai)
const aoMat=()=>new THREE.MeshBasicMaterial({map:(()=>{const c=document.createElement('canvas');c.width=16;c.height=64;
  const x=c.getContext('2d');const g=x.createLinearGradient(0,0,0,64);
  g.addColorStop(0,'rgba(0,0,0,0.52)');g.addColorStop(.45,'rgba(0,0,0,0.24)');g.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=g;x.fillRect(0,0,16,64);return new THREE.CanvasTexture(c);})(),transparent:true,depthWrite:false});
[[0,-9.5,25.4,0],[0,9.5,25.4,Math.PI],[-12.5,0,19.4,Math.PI/2],[12.5,0,19.4,-Math.PI/2]].forEach(([ax,az,len,rot],i)=>{
  const wide=i===3?1.25:0.95; // dinding kanan lebih lebar & pekat (di backlog tercatat tipis)
  const s=new THREE.Mesh(new THREE.PlaneGeometry(len,wide),aoMat());
  s.rotation.x=-Math.PI/2;s.rotation.z=rot;
  s.position.set(ax + (Math.abs(az)>Math.abs(ax)?(ax<0?0.42:-0.42):0),
                 0.006,
                 az + (Math.abs(az)>Math.abs(ax)?0:(az<0?0.42:-0.42)));
  s.renderOrder=1;office.add(s);
});
const flc=document.createElement('canvas');flc.width=512;flc.height=512;
const flx=flc.getContext('2d');
flx.fillStyle='#8A7C68';flx.fillRect(0,0,512,512);
for(let r=0;r<10;r++){
  const y=r*52;let x=(r%2)*-60;
  while(x<512){
    const w=120+((r*97+x)%90);
    const shade=112+((r*53+x*7)%30);
    flx.fillStyle=`rgb(${shade},${shade-18},${shade-45})`;
    flx.fillRect(x+2,y+2,w-3,48);
    flx.fillStyle='rgba(90,70,50,0.25)';
    flx.fillRect(x+2,y+2,w-3,2);
    x+=w;
  }
}
const flTex=new THREE.CanvasTexture(flc);
flTex.wrapS=flTex.wrapT=THREE.RepeatWrapping;flTex.repeat.set(4,3);
const fl=new THREE.Mesh(new THREE.BoxGeometry(26,.15,20),
  new THREE.MeshLambertMaterial({map:flTex}));
fl.position.y=-.075;fl.receiveShadow=true;office.add(fl);

// Carpet
const cp=new THREE.Mesh(new THREE.BoxGeometry(10,.02,8),M(0xD0D8E0));
cp.position.set(-3,.01,0);cp.receiveShadow=true;office.add(cp);

// Wainscot band (panel bawah dinding belakang & depan — dinding kanan/kiri punya panel sendiri di blok dinding)
[[0,-9.5,26],[0,9.5,26]].forEach(([wx,wz,ww])=>{
  const band=new THREE.Mesh(new THREE.BoxGeometry(ww,1.1,.1),M(0xEFE9DD));
  band.position.set(wx,.55,wz+(wz<0?.06:-.06));office.add(band);
  const trim=new THREE.Mesh(new THREE.BoxGeometry(ww,.06,.14),M(0xC9BFA8));
  trim.position.set(wx,1.12,wz+(wz<0?.06:-.06));office.add(trim);
});
// Wainscot band vertikal dinding kiri & kanan
[[-12.5,0,20],[12.5,0,20]].forEach(([wx,wz,wd])=>{
  const band=new THREE.Mesh(new THREE.BoxGeometry(.1,1.1,wd),M(0xEFE9DD));
  band.position.set(wx+(wx<0?.06:-.06),.55,wz);office.add(band);
  const trim=new THREE.Mesh(new THREE.BoxGeometry(.14,.06,wd),M(0xC9BFA8));
  trim.position.set(wx+(wx<0?.06:-.06),1.12,wz);office.add(trim);
});
// Jendela dengan pemandangan langit (dinding belakang & depan, atas wainscot)
const skyTex=(()=>{const c=document.createElement('canvas');c.width=256;c.height=128;
  const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,0,128);
  g.addColorStop(0,'#4EA8EE');g.addColorStop(.65,'#93D0F5');g.addColorStop(1,'#D6EDFB');
  x.fillStyle=g;x.fillRect(0,0,256,128);
  // pita cahaya matahari utk depth (hindari langit flat/pucat)
  const sun=x.createRadialGradient(210,22,4,210,22,80);
  sun.addColorStop(0,'rgba(255,250,220,0.95)');sun.addColorStop(1,'rgba(255,250,220,0)');
  x.fillStyle=sun;x.fillRect(0,0,256,128);
  x.fillStyle='rgba(255,255,255,0.85)';
  [[40,38,60,14],[130,60,80,12],[190,30,55,10],[80,90,70,12]].forEach(([cx,cy,cw,ch])=>{
    x.beginPath();x.ellipse(cx,cy,cw/2,ch/2,0,0,7);x.fill();});
  return new THREE.CanvasTexture(c);})();
// sheen kaca: pantulan diagonal + tint biru — overlay plane di tiap jendela
const glassSheen=(()=>{const c=document.createElement('canvas');c.width=256;c.height=128;
  const x=c.getContext('2d');
  const g=x.createLinearGradient(0,128,256,0);
  g.addColorStop(0,'rgba(255,255,255,0.00)');
  g.addColorStop(.42,'rgba(210,235,255,0.05)');
  g.addColorStop(.5,'rgba(255,255,255,0.22)');
  g.addColorStop(.58,'rgba(210,235,255,0.05)');
  g.addColorStop(1,'rgba(255,255,255,0.00)');
  x.fillStyle=g;x.fillRect(0,0,256,128);
  const g2=x.createLinearGradient(256,128,60,0);
  g2.addColorStop(0,'rgba(255,255,255,0.00)');
  g2.addColorStop(.46,'rgba(255,255,255,0.11)');
  g2.addColorStop(.54,'rgba(255,255,255,0.00)');
  x.fillStyle=g2;x.fillRect(0,0,256,128);
  x.fillStyle='rgba(140,200,255,0.10)';x.fillRect(0,0,256,128);
  return new THREE.CanvasTexture(c);})();
// (jendela sky-view dinding belakang & kiri dibangun di blok dinding __wallFade di bawah —
//  blok lama di sini dead code dengan array kosong dan sudah dihapus)

// Glass edge frames (subtle structural lines)
[[-12.5,-9.5],[-12.5,9.5],[12.5,-9.5],[12.5,9.5]].forEach(([x,z])=>{
  const f=new THREE.Mesh(new THREE.BoxGeometry(.08,4,.08),M(0xAABBCC));
  f.position.set(x,2,z);office.add(f);
});

// CEILING — DARK BLUE + tekstur panel prosedural (seam grid + vignette)
const __ceilObjsSafe=[];
const ceilCv=document.createElement('canvas');ceilCv.width=ceilCv.height=512;
{
  const c=ceilCv.getContext('2d');
  const g=c.createLinearGradient(0,0,0,512);
  g.addColorStop(0,'#0C1B33');g.addColorStop(1,'#0A1628');
  c.fillStyle=g;c.fillRect(0,0,512,512);
  // vignette lembut ke tepi (AO palsu di langit-langit)
  const v=c.createRadialGradient(256,256,80,256,256,340);
  v.addColorStop(0,'rgba(20,36,64,0.35)');v.addColorStop(1,'rgba(4,9,18,0.55)');
  c.fillStyle=v;c.fillRect(0,0,512,512);
  // seam grid panel 4x4 sel per tile
  c.strokeStyle='rgba(70,95,140,0.35)';c.lineWidth=2;
  for(let i=0;i<=4;i++){
    c.beginPath();c.moveTo(i*128,0);c.lineTo(i*128,512);c.stroke();
    c.beginPath();c.moveTo(0,i*128);c.lineTo(512,i*128);c.stroke();
  }
  // garis aksen tipis lebih terang di sisi seam (bevel halus)
  c.strokeStyle='rgba(120,150,200,0.12)';c.lineWidth=1;
  for(let i=0;i<=4;i++){
    c.beginPath();c.moveTo(i*128+2,0);c.lineTo(i*128+2,512);c.stroke();
    c.beginPath();c.moveTo(0,i*128+2);c.lineTo(512,i*128+2);c.stroke();
  }
}
const ceilTex=new THREE.CanvasTexture(ceilCv);
ceilTex.wrapS=ceilTex.wrapT=THREE.RepeatWrapping;ceilTex.repeat.set(4,3);
const ceil=new THREE.Mesh(new THREE.BoxGeometry(26,.1,20),new THREE.MeshLambertMaterial({color:0xffffff,map:ceilTex,transparent:true,opacity:0.85}));
ceil.position.y=4.05;office.add(ceil);
// balok rangka penopang (beams) — memecah kepolosan bidang langit
[[0,-6],[0,0],[0,6]].forEach(([,z])=>{
  const b=new THREE.Mesh(new THREE.BoxGeometry(24.9,.22,.4),M(0x14243D));
  b.position.set(0,3.9,z);office.add(b);__ceilObjsSafe.push(b);
});
[[ -9.2],[0],[9.2]].forEach(([x])=>{
  const b=new THREE.Mesh(new THREE.BoxGeometry(.4,.22,18.9),M(0x14243D));
  b.position.set(x,3.9,0);office.add(b);__ceilObjsSafe.push(b);
});

// Ceiling light panels (recessed) — brighter for dark bg contrast
const __ceilObjs=[];
for(let i=-2;i<=2;i++){for(let j=-1;j<=1;j++){
  const p=new THREE.Mesh(new THREE.BoxGeometry(3,.03,1),MB(0xF0F4FF));
  p.position.set(i*4.5,3.98,j*5);office.add(p);__ceilObjs.push(p);
  if(j===0){ // hanya 5 point light di jalur tengah — sisanya emissive saja
    const pl=new THREE.PointLight(0xFFFFFF,0.35,12,1.6);
    pl.position.set(i*4.5,3.8,j*5);office.add(pl);
  }
}}

// ═══ RUANG MEETING (modul parts/room.js) ═══
const __mr=createMeetingRoom({THREE,office,M},Glass());
const MRX=__mr.MRX,MRZ=__mr.MRZ,meetSeats=__mr.meetSeats;

// ═══════════════════════════════════════════════════
// DESK POSITIONS — agents face NEGATIVE Z (toward monitor)
// Chair is behind agent (positive Z from desk)
// Monitor is at desk front (negative Z from desk center)
// ═══════════════════════════════════════════════════
const desks=[
  {x:-8, z:-3},  // BANTUIN AI
  {x:-4, z:-3},  // BUDI
  {x:-8, z:1.5}, // RIZKY
  {x:-4, z:1.5}, // DEWI
  {x:0,  z:-3},  // ANDI
  {x:0,  z:1.5}, // YOGA
  {x:-8, z:6},   // MAYA
  {x:-4, z:6},   // TONI
  {x:4,  z:-3},  // RINA
  {x:4,  z:1.5}, // LINA
  {x:4,  z:6},   // SARI
  {x:8,  z:-3},  // TRAINER AI
  {x:8,  z:1.5}, // INTEGRATOR BOT
  {x:8,  z:6},   // SUPPORT HUMAN
];

// ═══════════════════════════════════════════════════
// CHARACTER BUILDER
// ═══════════════════════════════════════════════════

// -- Profil tampilan per karakter: kulit, tinggi, aksesori --
const LOOKS={
  'BANTUIN AI':{skin:0xCFD8DC,h:1.0,acc:['visor','antenna']},
  'BUDI':{skin:0xD9A273,h:1.05,acc:['glasses','beard']},
  'RIZKY':{skin:0xE8B88A,h:1.02,acc:['headphones']},
  'DEWI':{skin:0xF1C9A0,h:.97,acc:['hijab']},
  'ANDI':{skin:0xC68B5E,h:1.04,acc:['cap']},
  'YOGA':{skin:0xE0AC7E,h:1.0,acc:['glasses']},
  'MAYA':{skin:0xF3D2B0,h:.96,acc:['bun','glasses']},
  'TONI':{skin:0xB97F55,h:1.07,acc:['beanie','beard']},
  'RINA':{skin:0xEBC39A,h:.97,acc:['hijab','glasses']},
  'LINA':{skin:0xF0C8A2,h:.98,acc:['ponytail']},
  'SARI':{skin:0xD9A273,h:.99,acc:['blazer','glasses']},
  'WAHYU FS':{skin:0xE8B88A,h:1.04,acc:['tie','peci']},
};
function looksOf(agent){return LOOKS[String(agent.name||'').toUpperCase()]||{skin:0xE8B88A,h:1,acc:[]}}
// headY: pusat kepala; fz: arah depan (+1 berdiri/+Z, -1 duduk/-Z); torsoY: pusat torso
function addAccessories(g,agent,headY,fz,torsoY){
  const L=looksOf(agent), has=a=>L.acc.includes(a);
  const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);g.add(m);return m};
  const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  if(has('glasses')){
    [-1,1].forEach(sd=>add(B(.075,.06,.012),new THREE.MeshBasicMaterial({color:0x111111}),sd*.06,headY+.02,fz*.118));
    add(B(.04,.012,.012),new THREE.MeshBasicMaterial({color:0x111111}),0,headY+.025,fz*.118);
  }
  if(has('hijab')){
    const c=0xF5F0E6, hc=agent.color;
    add(B(.29,.30,.27),M(c),0,headY+.0,-fz*.015); // kerudung membungkus kepala
    add(B(.31,.08,.28),M(hc),0,headY+.12,-fz*.015);
    // wajah tetap terlihat: lapis kulit di depan
    add(B(.2,.17,.02),M(L.skin),0,headY-.005,fz*.128);
    [-1,1].forEach(sd=>{ add(B(.05,.016,.012),new THREE.MeshBasicMaterial({color:0x27303F}),sd*.06,headY+.04,fz*.14); });
    add(B(.34,.2,.22),M(c),0,headY-.2,-fz*.02);   // jatuh ke bahu
  }
  if(has('cap')){
    add(B(.27,.07,.25),M(agent.color),0,headY+.13,0);
    add(B(.2,.02,.12),M(agent.color),0,headY+.1,fz*.17);
  }
  if(has('beanie')){ add(B(.26,.11,.25),M(0x37474F),0,headY+.13,0); add(B(.05,.04,.05),M(agent.color),0,headY+.2,0); }
  if(has('headphones')){
    add(B(.27,.03,.05),M(0x212121),0,headY+.13,0);
    [-1,1].forEach(sd=>add(B(.05,.1,.09),M(agent.color),sd*.14,headY,0));
  }
  if(has('beard')){ add(B(.18,.07,.04),M(0x222222),0,headY-.1,fz*.115); }
  if(has('bun')){ add(new THREE.SphereGeometry(.07,8,6),M(agent.hair),0,headY+.2,-fz*.05); }
  if(has('ponytail')){ add(B(.06,.22,.06),M(agent.hair),0,headY-.02,-fz*.15); add(B(.07,.05,.07),M(agent.color),0,headY+.1,-fz*.14); }
  if(has('visor')){ add(B(.22,.06,.02),new THREE.MeshBasicMaterial({color:agent.color}),0,headY+.03,fz*.118); }
  if(has('antenna')){ add(B(.015,.12,.015),M(0x90A4AE),0,headY+.2,0); add(new THREE.SphereGeometry(.025,6,6),new THREE.MeshBasicMaterial({color:agent.color}),0,headY+.27,0); }
  if(has('blazer')){ add(B(.34,.38,.2),M(0x263238),0,torsoY,0); [-1,1].forEach(sd=>add(B(.04,.3,.02),M(0xFFFFFF),sd*.05,torsoY+.02,fz*.105)); }
  if(has('tie')){ add(B(.04,.22,.015),M(0x7F1D1D),0,torsoY+.02,fz*.115); }
  if(has('peci')){ add(B(.25,.1,.23),M(0x111111),0,headY+.14,0); }
}

function buildChar(agent, standing=false){
  if(agent.name==='BANTUIN AI')return buildRobot(THREE,agent,standing,M,MB);
  const g=new THREE.Group();
  const skin=looksOf(agent).skin;
  const isHairLong = String(agent.name||'').match(/DEWI|MAYA|RINA|LINA|SARI/i);

  if(standing){
    // STANDING CHARACTER — proporsi lebih manusiawi
    // Kaki (lebih panjang)
    [-1,1].forEach(sd=>{
      const leg=new THREE.Mesh(new THREE.BoxGeometry(.11,.52,.11),M(agent.pants));
      leg.position.set(sd*.075,.26,0);leg.userData.isLeg=true;leg.userData.phase=sd>0?0:Math.PI;leg.castShadow=true;g.add(leg);
      const sh=new THREE.Mesh(new THREE.BoxGeometry(.12,.06,.19),M(0x2B2B33));
      sh.position.set(sd*.075,.03,.02);g.add(sh);
    });
    // Torso — trapesium feel: dada lebih lebar dari pinggang
    const hips=new THREE.Mesh(new THREE.BoxGeometry(.26,.1,.15),M(agent.pants));
    hips.position.set(0,.56,0);g.add(hips);
    const torso=new THREE.Mesh(new THREE.BoxGeometry(.32,.34,.18),M(agent.shirt));
    torso.position.set(0,.79,0);torso.castShadow=true;g.add(torso);
    // Collar + kancing
    const col=new THREE.Mesh(new THREE.BoxGeometry(.2,.05,.12),M(0xFFFFFF));
    col.position.set(0,.965,0);g.add(col);
    const btn=new THREE.Mesh(new THREE.BoxGeometry(.025,.09,.01),MB(new THREE.Color(agent.shirt).multiplyScalar(.6)));
    btn.position.set(0,.8,.095);g.add(btn);
    // Lengan: upper + forearm menggantung natural
    [-1,1].forEach(sd=>{
      const ua=new THREE.Mesh(new THREE.BoxGeometry(.09,.18,.09),M(agent.shirt));
      ua.position.set(sd*.215,.8,0);g.add(ua);
      const fa=new THREE.Mesh(new THREE.BoxGeometry(.075,.17,.075),M(skin));
      fa.position.set(sd*.215,.62,0);g.add(fa);
      const hand=new THREE.Mesh(new THREE.BoxGeometry(.08,.07,.08),M(skin));
      hand.position.set(sd*.215,.51,0);g.add(hand);
    });
    // Leher
    const neck=new THREE.Mesh(new THREE.BoxGeometry(.09,.07,.09),M(skin));
    neck.position.set(0,.99,0);g.add(neck);
    // Kepala — sedikit oval (tumpuk 2 box)
    const head=new THREE.Mesh(new THREE.BoxGeometry(.24,.22,.22),M(skin));
    head.position.set(0,1.14,0);head.castShadow=true;g.add(head);
    const jaw=new THREE.Mesh(new THREE.BoxGeometry(.2,.06,.19),M(skin));
    jaw.position.set(0,1.01,0);g.add(jaw);
    // Hidung
    const nose=new THREE.Mesh(new THREE.BoxGeometry(.035,.05,.035),M(new THREE.Color(skin).multiplyScalar(.88).getHex()));
    nose.position.set(0,1.13,.125);g.add(nose);
    // Telinga
    [-1,1].forEach(sd=>{
      const ear=new THREE.Mesh(new THREE.BoxGeometry(.03,.07,.06),M(skin));
      ear.position.set(sd*.13,1.13,0);g.add(ear);
    });
    // Mata + alis
    [-1,1].forEach(sd=>{
      const eye=new THREE.Mesh(new THREE.BoxGeometry(.045,.05,.015),MB(0xFFFFFF));
      eye.position.set(sd*.06,1.16,.112);g.add(eye);
      const pup=new THREE.Mesh(new THREE.BoxGeometry(.022,.028,.012),MB(0x27303F));
      pup.position.set(sd*.06,1.155,.118);g.add(pup);
      const brow=new THREE.Mesh(new THREE.BoxGeometry(.05,.018,.015),M(agent.hair));
      brow.position.set(sd*.06,1.215,.112);g.add(brow);
    });
    // Mulut senyum tipis
    const mouth=new THREE.Mesh(new THREE.BoxGeometry(.06,.014,.012),MB(0x9C5A4A));
    mouth.position.set(0,1.06,.118);g.add(mouth);
    // Rambut — gaya beda per gender-ish
    const hairTop=new THREE.Mesh(new THREE.BoxGeometry(.26,.09,.24),M(agent.hair));
    hairTop.position.set(0,1.265,0);g.add(hairTop);
    const hairBk=new THREE.Mesh(new THREE.BoxGeometry(.24,.2,.05),M(agent.hair));
    hairBk.position.set(0,1.16,-.125);g.add(hairBk);
    const fringe=new THREE.Mesh(new THREE.BoxGeometry(.24,.06,.03),M(agent.hair));
    fringe.position.set(0,1.235,.105);g.add(fringe);
    if(isHairLong){
      [-1,1].forEach(sd=>{
        const strand=new THREE.Mesh(new THREE.BoxGeometry(.06,.3,.06),M(agent.hair));
        strand.position.set(sd*.115,1.05,-.09);g.add(strand);
      });
    }
    // Badge perusahaan di dada (material unik agar bisa diubah warna via badgeSync)
    const badge=new THREE.Mesh(new THREE.BoxGeometry(.06,.06,.015),MB(agent.color));
    badge.position.set(.11,.86,.095);g.add(badge);
    g.userData.badge = badge;
    // Lanyard/ID card
    const lany=new THREE.Mesh(new THREE.BoxGeometry(.03,.16,.01),MB(0x35507A));
    lany.position.set(.04,.84,.096);g.add(lany);
  } else {
    // SITTING CHARACTER — faces -Z (toward monitor)
    // Paha ke arah meja
    [-1,1].forEach(sd=>{
      const thigh=new THREE.Mesh(new THREE.BoxGeometry(.12,.11,.26),M(agent.pants));
      thigh.position.set(sd*.085,.44,-.08);thigh.castShadow=true;g.add(thigh);
      const shin=new THREE.Mesh(new THREE.BoxGeometry(.11,.3,.11),M(agent.pants));
      shin.position.set(sd*.085,.24,-.2);g.add(shin);
      const shoe=new THREE.Mesh(new THREE.BoxGeometry(.12,.06,.17),M(0x2B2B33));
      shoe.position.set(sd*.085,.07,-.24);g.add(shoe);
    });
    const hips=new THREE.Mesh(new THREE.BoxGeometry(.28,.12,.16),M(agent.pants));
    hips.position.set(0,.5,.02);g.add(hips);
    // Torso tegak
    const torso=new THREE.Mesh(new THREE.BoxGeometry(.32,.36,.18),M(agent.shirt));
    torso.position.set(0,.74,.02);torso.castShadow=true;g.add(torso);
    const col=new THREE.Mesh(new THREE.BoxGeometry(.2,.05,.12),M(0xFFFFFF));
    col.position.set(0,.93,.02);g.add(col);
    const btn=new THREE.Mesh(new THREE.BoxGeometry(.025,.1,.01),MB(new THREE.Color(agent.shirt).multiplyScalar(.6)));
    btn.position.set(0,.76,.115);g.add(btn);
    // Lengan menjangkau keyboard (upper + forearm)
    [-1,1].forEach(sd=>{
      const ua=new THREE.Mesh(new THREE.BoxGeometry(.09,.2,.09),M(agent.shirt));
      ua.position.set(sd*.215,.68,-.03);ua.rotation.x=.35;g.add(ua);
      const fa=new THREE.Mesh(new THREE.BoxGeometry(.075,.075,.2),M(skin));
      fa.position.set(sd*.215,.56,-.2);g.add(fa);
      const hand=new THREE.Mesh(new THREE.BoxGeometry(.08,.05,.09),M(skin));
      hand.position.set(sd*.16,.55,-.31);g.add(hand);
    });
    // Leher + kepala
    const neck=new THREE.Mesh(new THREE.BoxGeometry(.09,.07,.09),M(skin));
    neck.position.set(0,.955,.02);g.add(neck);
    const head=new THREE.Mesh(new THREE.BoxGeometry(.24,.22,.22),M(skin));
    head.position.set(0,1.1,.02);head.castShadow=true;g.add(head);
    const jaw=new THREE.Mesh(new THREE.BoxGeometry(.2,.06,.19),M(skin));
    jaw.position.set(0,.97,.02);g.add(jaw);
    const nose=new THREE.Mesh(new THREE.BoxGeometry(.035,.05,.035),M(new THREE.Color(skin).multiplyScalar(.88).getHex()));
    nose.position.set(0,1.09,-.105);g.add(nose);
    [-1,1].forEach(sd=>{
      const ear=new THREE.Mesh(new THREE.BoxGeometry(.03,.07,.06),M(skin));
      ear.position.set(sd*.13,1.09,.02);g.add(ear);
    });
    // Mata menghadap monitor (-Z)
    [-1,1].forEach(sd=>{
      const eye=new THREE.Mesh(new THREE.BoxGeometry(.045,.05,.015),MB(0xFFFFFF));
      eye.position.set(sd*.06,1.12,-.112);g.add(eye);
      const pup=new THREE.Mesh(new THREE.BoxGeometry(.022,.028,.012),MB(0x27303F));
      pup.position.set(sd*.06,1.115,-.118);g.add(pup);
      const brow=new THREE.Mesh(new THREE.BoxGeometry(.05,.018,.015),M(agent.hair));
      brow.position.set(sd*.06,1.175,-.112);g.add(brow);
    });
    const mouth=new THREE.Mesh(new THREE.BoxGeometry(.06,.014,.012),MB(0x9C5A4A));
    mouth.position.set(0,1.02,-.118);g.add(mouth);
    // Rambut (belakang kepala = +Z)
    const hairTop=new THREE.Mesh(new THREE.BoxGeometry(.26,.09,.24),M(agent.hair));
    hairTop.position.set(0,1.225,.02);g.add(hairTop);
    const hairBk=new THREE.Mesh(new THREE.BoxGeometry(.24,.2,.05),M(agent.hair));
    hairBk.position.set(0,1.12,.135);g.add(hairBk);
    const fringe=new THREE.Mesh(new THREE.BoxGeometry(.24,.06,.03),M(agent.hair));
    fringe.position.set(0,1.19,-.095);g.add(fringe);
    if(isHairLong){
      [-1,1].forEach(sd=>{
        const strand=new THREE.Mesh(new THREE.BoxGeometry(.06,.3,.06),M(agent.hair));
        strand.position.set(sd*.115,.98,.1);g.add(strand);
      });
    }
    const badge=new THREE.Mesh(new THREE.BoxGeometry(.06,.06,.015),MB(agent.color));
    badge.position.set(.11,.8,.115);g.add(badge);
    g.userData.badge = badge;
    const lany=new THREE.Mesh(new THREE.BoxGeometry(.03,.16,.01),MB(0x35507A));
    lany.position.set(.04,.78,.116);g.add(lany);
  }
  if(standing) addAccessories(g,agent,1.14,1,.8); else addAccessories(g,agent,1.1,-1,.74);
  // Rim outline tipis agar figur tidak menyatu dgn lantai (edge glow halus)
  const rim=new THREE.PointLight(agent.color,.12,1.6,2);
  rim.position.set(0,.7,.5);g.add(rim);
  return g;
}


// ═══════════════════════════════════════════════════
// DESK WORKSTATIONS & AGENTS (reconstructed)
// ═══════════════════════════════════════════════════
const agentData=[];
const screenData=[];

const LABEL_Y=2.45; // tepat di atas kepala (tinggi duduk ≈1.95)
function makeLabel(agent){
  // Dua kanvas: ringkas (nama saja) dan lengkap (nama + role). Ringkas dipakai saat jauh / layar kecil.
  const mk=(full)=>{
    const W=full?360:210,H=full?84:50,lc=document.createElement('canvas');lc.width=W;lc.height=H;
    const c=lc.getContext('2d');
    c.fillStyle='rgba(10,14,24,0.84)';
    c.beginPath(); if(c.roundRect)c.roundRect(2,2,W-4,H-4,full?18:14); else c.rect(2,2,W-4,H-4); c.fill();
    c.fillStyle=agent.hex; c.fillRect(2,full?14:10,6,H-(full?28:20));
    c.textAlign='center'; c.textBaseline='middle';
    const nm=String(agent.name).toLowerCase().replace(/(^|\s)\w/g,m=>m.toUpperCase()).slice(0,14);
    c.font=(full?'800 36px':'800 28px')+' "Segoe UI",Arial,sans-serif'; c.fillStyle='#fff';
    c.fillText(nm,W/2+4,full?32:H/2+1);
    if(full){c.font='600 22px "Segoe UI",Arial,sans-serif'; c.fillStyle='#b8c4d4'; c.fillText(String(agent.role),W/2+4,62)}
    const tex=new THREE.CanvasTexture(lc); tex.minFilter=THREE.LinearFilter; return {tex,as:W/H};
  };
  const full=mk(true), short=mk(false);
  const label=new THREE.Sprite(new THREE.SpriteMaterial({map:short.tex,transparent:true,depthTest:false,sizeAttenuation:false}));
  label.userData={full,short,mode:'short'};
  label.renderOrder=20;
  return label;
}
// Ukuran label tetap di layar (sizeAttenuation=false): tinggi ≈ fraksi tinggi viewport
function sizeLabels(){
  const w=container.clientWidth||800, h=container.clientHeight||600;
  const near=camera.position.distanceTo(tgt);
  const wantFull=(w>=700&&near<30)||near<17;
  const t2=2*Math.tan(camera.fov*Math.PI/360);
  const hPx=(w<600?14:19)*(wantFull?1.0:1.0);
  const hFrac=hPx*Math.min(1.35,h/900*1.2)/h;          // layar pendek: label sedikit lebih besar relatif
  const frac=hFrac*t2;
  const apply=L=>{
    const u=L.userData; const mode=wantFull?'full':'short';
    if(u.mode!==mode){u.mode=mode;L.material.map=u[mode].tex;L.material.needsUpdate=true}
    const as=u[mode].as;
    L.scale.set(frac*as,frac,1);
  };
  agentData.forEach(a=>apply(a.label)); if(nxLabel)apply(nxLabel);
  window.__labelFrac=+frac.toFixed(4);
}

function buildDesk(agent,dp){
  const g=new THREE.Group();
  // Meja
  const top=new THREE.Mesh(new THREE.BoxGeometry(1.5,.07,.8),M(0xC9A27A));
  top.position.set(0,.74,0);top.castShadow=true;top.receiveShadow=true;g.add(top);
  const edge=new THREE.Mesh(new THREE.BoxGeometry(1.52,.02,.82),new THREE.MeshBasicMaterial({color:agent.color}));
  edge.position.set(0,.705,0);g.add(edge);
  [[-.68,-.33],[.68,-.33],[-.68,.33],[.68,.33]].forEach(([lx,lz])=>{
    const leg=new THREE.Mesh(new THREE.BoxGeometry(.05,.72,.05),M(0x3A4350));
    leg.position.set(lx,.36,lz);g.add(leg);
  });
  // Monitor
  const mBase=new THREE.Mesh(new THREE.BoxGeometry(.22,.02,.14),M(0xAABBCC));
  mBase.position.set(0,.78,-.22);g.add(mBase);
  const mStand=new THREE.Mesh(new THREE.BoxGeometry(.04,.2,.04),M(0xAABBCC));
  mStand.position.set(0,.88,-.24);g.add(mStand);
  const mBody=new THREE.Mesh(new THREE.BoxGeometry(.85,.5,.035),M(0x1E1E24));
  mBody.position.set(0,1.2,-.24);mBody.castShadow=true;g.add(mBody);
  // Layar (canvas screen)
  const sc=document.createElement('canvas');sc.width=128;sc.height=76;
  const sctx=sc.getContext('2d');
  const stx=new THREE.CanvasTexture(sc);stx.minFilter=THREE.LinearFilter;
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(.78,.44),new THREE.MeshBasicMaterial({map:stx}));
  screen.position.set(0,1.2,-.22);g.add(screen);
  screenData.push({ctx:sctx,canvas:sc,tex:stx,type:agent.screen||'terminal',hex:agent.hex});
  // Screen light — warna agent
  const sLight=new THREE.PointLight(agent.color,.3,2.2,2);
  sLight.position.set(0,1.15,-.05);g.add(sLight);
  // Keyboard & mouse
  const kb=new THREE.Mesh(new THREE.BoxGeometry(.4,.02,.14),M(0x2A2A30));
  kb.position.set(0,.79,-.05);g.add(kb);
  const mouse=new THREE.Mesh(new THREE.BoxGeometry(.05,.02,.08),M(0x2A2A30));
  mouse.position.set(.28,.79,-.05);g.add(mouse);
  // Kursi
  const seat=new THREE.Mesh(new THREE.BoxGeometry(.4,.05,.4),M(0x37474F));
  seat.position.set(0,.42,.55);g.add(seat);
  const back=new THREE.Mesh(new THREE.BoxGeometry(.4,.45,.05),M(0x37474F));
  back.position.set(0,.68,.76);g.add(back);
  const pole=new THREE.Mesh(new THREE.BoxGeometry(.05,.38,.05),M(0x607080));
  pole.position.set(0,.2,.55);g.add(pole);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.22,.26,.04,10),M(0x556068));
  base.position.set(0,.02,.55);g.add(base);
  // Glow di bawah meja (dGlow — dipakai updateShift/cyberpunk)
  const dGlow=new THREE.PointLight(agent.color,.15,3,2);
  dGlow.position.set(0,.3,-.1);g.add(dGlow);
  // Nameplate pribadi: nama + role di sisi depan meja (menghadap keluar dari monitor)
  (()=>{
    const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');
    x.fillStyle='rgba(8,12,22,0.88)';x.beginPath();if(x.roundRect)x.roundRect(2,2,252,60,12);else x.rect(2,2,252,60);x.fill();
    x.fillStyle=agent.hex;x.fillRect(2,10,7,44);
    x.textAlign='center';x.textBaseline='middle';
    const nm=String(agent.name).toLowerCase().replace(/(^|\s)\w/g,m=>m.toUpperCase()).slice(0,16);
    x.font='800 22px "Segoe UI",Arial,sans-serif';x.fillStyle='#fff';x.fillText(nm,132,24);
    x.font='500 14px "Segoe UI",Arial,sans-serif';x.fillStyle='#a8b4c6';x.fillText(String(agent.role).slice(0,24),132,45);
    const tex=new THREE.CanvasTexture(c);tex.minFilter=THREE.LinearFilter;
    const plate=new THREE.Mesh(new THREE.PlaneGeometry(.62,.155),new THREE.MeshBasicMaterial({map:tex,transparent:true}));
    plate.position.set(0,.68,.42);g.add(plate);
    const stand=new THREE.Mesh(new THREE.BoxGeometry(.62,.02,.05),M(0x2E3642));
    stand.position.set(0,.66,.44);g.add(stand);
  })();
  // Laci kabinet di bawah meja (sisi kiri) dengan handel
  const cab=new THREE.Mesh(new THREE.BoxGeometry(.42,.5,.6),M(0x46525E));
  cab.position.set(-.5,.25,.05);cab.castShadow=true;g.add(cab);
  [.1,.32].forEach(ly=>{
    const drw=new THREE.Mesh(new THREE.BoxGeometry(.4,.18,.55),M(0x526270));
    drw.position.set(-.5,ly,.03);g.add(drw);
    const hd=new THREE.Mesh(new THREE.BoxGeometry(.14,.02,.02),M(0x9AA7B4));
    hd.position.set(-.5,ly,.32);g.add(hd);
  });
  // Tanaman kecil di meja (sisi kanan belakang)
  const pot=new THREE.Mesh(new THREE.CylinderGeometry(.05,.04,.08,8),M(0xB08050));
  pot.position.set(.58,.815,-.28);g.add(pot);
  [[0,.9,0,.07],[.03,.95,.02,.05],[-.03,.94,-.02,.05]].forEach(([px,py,pz,r])=>{
    const leaf=new THREE.Mesh(new THREE.SphereGeometry(r,6,5),M(0x43A047));
    leaf.position.set(.58+px,py,-.28+pz);g.add(leaf);
  });
  g.position.set(dp.x,0,dp.z);
  office.add(g);
  return {dGlow,screenLight:sLight};
}

// semua desk: 8 utama + 3 extra (posisi kanan) — desks array hanya 11? pakai AGENTS 8 + AGENTS_EXTRA 3
const allDesks=[...desks];
const allAgents=[...AGENTS,...AGENTS_EXTRA];
// desks hanya 11 posisi — AGENTS_EXTRA pakai 3 posisi terakhir
allAgents.forEach((agent,i)=>{
  const dp=allDesks[i];
  if(!dp)return;
  const {dGlow,screenLight}=buildDesk(agent,dp);
  // Karakter duduk
  const sittingChar=buildChar(agent,false);
  sittingChar.scale.set(1.7,1.7*looksOf(agent).h,1.7);
  sittingChar.position.set(dp.x,0,dp.z+.55);
  addBlobShadow(sittingChar,0.62);
  sittingChar.traverse(o=>{if(o.isMesh&&o.material&&!o.material.isMeshBasicMaterial){o.castShadow=true;}});
  office.add(sittingChar);
  // Walker
  const walker=buildChar(agent,true);
  walker.scale.set(1.7,1.7*looksOf(agent).h,1.7);
  walker.visible=false;
  addBlobShadow(walker,0.62);
  walker.traverse(o=>{if(o.isMesh&&o.material&&!o.material.isMeshBasicMaterial){o.castShadow=true;}});
  office.add(walker);
  // Label
  const label=makeLabel(agent);
  label.position.set(dp.x,LABEL_Y,dp.z+.55);
  office.add(label);
  agentData.push({
    agent,state:'sitting',timer:rng.r(8,25),
    home:{x:dp.x,z:dp.z+.55},
    sittingChar,walker,label,dGlow,screenLight,
    walkTarget:null,walkPause:0
  });
});

  window.__agentData=agentData; window.__screens=screenData; window.__setTime=(m)=>updateTime(m); window.__dbg=()=>({t:timeOfDay,ph:__shift.phase,fr:frame});window.__toggleNeon=()=>{toggleCyberpunk();return cyberpunkMode}; window.__meet=()=>({active:__meet.active,vis:__meet.figures.filter(f=>f.visible).length}); window.__lunch=()=>({on:__shift.lunch,atCafe:agentData.filter(a=>a.lunch).length}); window.__cam={sph,tgt,upd:()=>updCam()};window.__camCam=camera; // debug/e2e
  // Badge status real-time: poll gateway tiap 20s, warnai badge dada sesuai status task
  const __intervals=[];
  const __timeouts=[];
  (function(){
  const idMapFn=()=>{const m={};(window.__wfsAgentIdList||[]).forEach(x=>m[x.name]=x.id);return m};
  async function pollBadges(){
  try{
    const r=await fetch('/wfs-api/agents/status');
    const d=await r.json();
    const agents=d.agents||{};
    const cols={done:'#10E5A0',running:'#f59e0b',failed:'#f66',review:'#59a5ff',pending:'#8b93a3'};
    const im=idMapFn();
    agentData.forEach(ad=>{
      const gid=im[ad.agent?.name];
      const st=gid&&agents[gid]?.last;
      const badge=ad.sittingChar?.userData?.badge;
      if(st&&badge&&cols[st])badge.material.color.set(cols[st]);
    });
  }catch{ /* abaikan */ }
  }
  __timeouts.push(setTimeout(pollBadges,4000));
  __intervals.push(setInterval(pollBadges,20000));
  // Task running → agent berdiri & jalan ke coffee area (visual "sedang kerja/ngebut")
  __intervals.push(setInterval(()=>{
    fetch('/wfs-api/agents/status').then(r=>r.json()).then(d=>{
      const im=idMapFn();
      Object.entries(d.agents||{}).forEach(([gid,v])=>{
        if(v.running>0){
          const ad=agentData.find(a=>im[a.agent?.name]===gid);
          if(ad&&ad.state==='sitting'){
            ad.timer=0.5; // paksa bangun segera
          }
        }
      });
    }).catch(()=>{});
  },21000));
  // Alert task failed: bubble peringatan di meja agent (deteksi transisi)
  const prevFailed={};
  __intervals.push(setInterval(()=>{
    fetch('/wfs-api/agents/status').then(r=>r.json()).then(d=>{
      const im=idMapFn();
      Object.entries(d.agents||{}).forEach(([gid,v])=>{
        if(v.failed>0 && prevFailed[gid]!==v.failed){
          prevFailed[gid]=v.failed;
          const ad=agentData.find(a=>im[a.agent?.name]===gid);
          if(ad){
            const wp=ad.walker.visible?ad.walker.position:{x:ad.home.x,z:ad.home.z};
            createBubble(wp.x,2.6,wp.z,'⚠️ Ada task failed! Cek log…','#f66');
          }
        } else if(v.failed===0){ prevFailed[gid]=0; }
      });
    }).catch(()=>{});
  },25000));
  })();


// -- Kolaborasi antar role: dialog antar rekan kerja --
const COLLAB_PAIRS=[
  ['FRONTEND','BACKEND',['API /tasks sudah siap, tinggal dipanggil ya','Siap, kutarik datanya sekarang','Responsnya cukup cepat?','p95 sekitar 120 ms']],
  ['UI/UX','FRONTEND',['Spacing tombolnya kurang 4px','Oke, kurapikan sesuai desain','Kontras warnanya sudah lolos AA','Mantap, lanjut ke review']],
  ['QA','BACKEND',['Ada bug 500 di endpoint chat','Reproduce langkahnya dong','Kirim body kosong lalu submit','Dapat, kuperbaiki sekarang']],
  ['QA','FRONTEND',['Tombol Kirim bisa diklik dua kali','Kutambah disable saat loading','Terima kasih, kutest ulang','Lolos, aman!']],
  ['DEVOPS','BACKEND',['Build staging jalan, cek log ya','Migrasi database sudah jalan?','Sudah, aman semua','Deploy produksi jam 5']],
  ['PROJECT MANAGER','ENGINEER',['Progress sprint hari ini gimana?','Hampir selesai, tinggal review','Demo besok jam 10 ya','Siap, kami kejar']],
  ['PROJECT MANAGER','UI/UX',['Desain halaman harga sudah ada?','Draft kukirim siang ini','Bagus, kirim ke tim FE','Oke!']],
  ['GROWTH','PROJECT MANAGER',['Leads minggu ini naik 18%','Bagus, lanjutkan kampanye','Kita perlu fitur referral','Masuk backlog sprint depan']],
  ['AI CUSTOMER','BACKEND',['Banyak tanya soal harga paket','Kubuatkan endpoint FAQ','Jawaban otomatis makin akurat','Siap, kutambah data latihnya']],
  ['MOBILE','BACKEND',['Endpoint push notif sudah ada?','Sudah, dokumennya di wiki','Aplikasi lolos uji Android','Mantap, kirim build-nya']],
];
function pickCollab(ad){
  const r=String(ad.agent.role||'').toUpperCase();
  const options=[];
  agentData.forEach(o=>{
    if(o===ad||o.state!=='sitting')return;
    const orole=String(o.agent.role||'').toUpperCase();
    COLLAB_PAIRS.forEach(([a,b,lines])=>{
      const m1=r.includes(a)&&orole.includes(b), m2=r.includes(b)&&orole.includes(a);
      if(m1||m2)options.push({partner:o,lines,first:m1});
    });
  });
  return options.length?options[Math.floor(Math.random()*options.length)]:null;
}


// ═══════════════════════════════════════════════════
// MEETING LOGIC
// ═══════════════════════════════════════════════════
const __meet=createMeeting({THREE,office,rng,agents:AGENTS,agentData,buildChar,seats:meetSeats,roomZ:MRZ,onChange:onMeetingChange});
const updateMeeting=m=>__meet.update(m);


// ═══ PERABOT (modul terpisah: parts/furniture.js) ═══
const __furn=createFurniture({THREE,office,M,MB,rng});
const addPlant=__furn.addPlant;

// ═══════════════════════════════════════════════════
// RECEPTION DESK WITH WFS LOGO (front-right, near meeting room)
// ═══════════════════════════════════════════════════
const reception=new THREE.Group();
const RCX=8,RCZ=6.5;
// Main desk body (curved front)
const rcDesk=new THREE.Mesh(new THREE.BoxGeometry(2.5,.9,.6),M(0x1A2A3A));
rcDesk.position.set(RCX,.45,RCZ);rcDesk.castShadow=true;reception.add(rcDesk);
// Top surface
const rcTop=new THREE.Mesh(new THREE.BoxGeometry(2.6,.04,.7),M(0xDDE4EC));
rcTop.position.set(RCX,.92,RCZ);rcTop.castShadow=true;reception.add(rcTop);
// Side panel
const rcSide=new THREE.Mesh(new THREE.BoxGeometry(.6,.9,.04),M(0x1A2A3A));
rcSide.position.set(RCX+1.25,.45,RCZ-.3);rcSide.castShadow=true;reception.add(rcSide);

// Logo WFS Project di depan meja resepsionis
const wfsLogoTex=(()=>{
  const c=document.createElement('canvas');c.width=1024;c.height=320;const x=c.getContext('2d');
  x.fillStyle='#0F1B2E';x.fillRect(0,0,1024,320);
  x.strokeStyle='#D4AF37';x.lineWidth=8;x.strokeRect(6,6,1012,308);
  const g=x.createLinearGradient(40,40,240,280);g.addColorStop(0,'#FBBF24');g.addColorStop(1,'#F97316');
  const hx=(cx,cy,r)=>{x.beginPath();for(let i=0;i<6;i++){const a=Math.PI/6+i*Math.PI/3;x.lineTo(cx+r*Math.cos(a),cy+r*Math.sin(a));}x.closePath();};
  hx(150,160,115);x.fillStyle=g;x.fill();hx(150,160,98);x.fillStyle='#0F1B2E';x.fill();
  x.fillStyle=g;x.font='900 130px Arial,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('W',150,168);
  x.textAlign='left';x.textBaseline='alphabetic';
  x.fillStyle='#fff';x.font='900 150px Arial,sans-serif';x.fillText('WFS',300,175);
  x.fillStyle='#FBBF24';x.font='800 78px Arial,sans-serif';x.fillText('PROJECT',306,265);
  const t=new THREE.CanvasTexture(c);t.minFilter=THREE.LinearFilter;return t;
})();
const rcLogoMesh=new THREE.Mesh(
  new THREE.PlaneGeometry(1.8,.5625),
  new THREE.MeshBasicMaterial({map:wfsLogoTex,transparent:true})
);
rcLogoMesh.position.set(RCX,.5,RCZ+.31);reception.add(rcLogoMesh);
const rcLogoFront=rcLogoMesh.clone();rcLogoFront.position.set(RCX,.5,RCZ-.31);rcLogoFront.rotation.y=Math.PI;reception.add(rcLogoFront);

// Teal glow strip under desk front
const rcGlow=new THREE.Mesh(new THREE.BoxGeometry(2.2,.02,.02),MB(0x0DEEF3));
rcGlow.position.set(RCX,.05,RCZ+.3);reception.add(rcGlow);
const rcLight=new THREE.PointLight(0x0DEEF3,0.4,3.5,2);
rcLight.position.set(RCX,.1,RCZ+.5);reception.add(rcLight);

// Reception monitor (behind desk, facing NEXUS)
const rcMonBase=new THREE.Mesh(new THREE.BoxGeometry(.2,.02,.1),M(0xAABBCC));
rcMonBase.position.set(RCX-.4,.95,RCZ+.05);reception.add(rcMonBase);
const rcMonStand=new THREE.Mesh(new THREE.BoxGeometry(.03,.18,.03),M(0xAABBCC));
rcMonStand.position.set(RCX-.4,1.05,RCZ+.05);reception.add(rcMonStand);
const rcMonBody=new THREE.Mesh(new THREE.BoxGeometry(.6,.4,.03),M(0x2A2A2A));
rcMonBody.position.set(RCX-.4,1.35,RCZ+.08);reception.add(rcMonBody);
// Screen glow
const rcScreenGlow=new THREE.Mesh(new THREE.BoxGeometry(.55,.35,.01),MB(0x0A1628));
rcScreenGlow.position.set(RCX-.4,1.35,RCZ+.06);reception.add(rcScreenGlow);

// Keyboard + mouse
const rcKb=new THREE.Mesh(new THREE.BoxGeometry(.3,.02,.1),M(0x333333));
rcKb.position.set(RCX-.4,.95,RCZ+.15);reception.add(rcKb);
const rcMouse=new THREE.Mesh(new THREE.BoxGeometry(.05,.02,.07),M(0x333333));
rcMouse.position.set(RCX-.1,.95,RCZ+.15);reception.add(rcMouse);

// Reception chair (positioned in NEXUS fix above)
const rcChairSeat=new THREE.Mesh(new THREE.BoxGeometry(.4,.04,.4),M(0x37474F));
reception.add(rcChairSeat);
const rcChairBack=new THREE.Mesh(new THREE.BoxGeometry(.4,.42,.04),M(0x37474F));
reception.add(rcChairBack);

// RECEPTION AGENT — "NEXUS" (white/silver, the coordinator)
const nexusAgent={name:'WAHYU FS',color:0xF59E0B,hex:'#F59E0B',role:'Founder / CEO',hair:0x1a1a1a,shirt:0xB45309,pants:0x292524};
const nexusChar=buildChar(nexusAgent,false);
nexusChar.scale.setScalar(1.7);
nexusChar.position.set(RCX-.4,0,RCZ-.4); // behind desk
nexusChar.rotation.y=Math.PI; // face +Z toward visitors
reception.add(nexusChar);

// Reception chair (behind desk)
rcChairSeat.position.set(RCX-.4,.44,RCZ-.4);
rcChairBack.position.set(RCX-.4,.67,RCZ-.59);

// Label Founder (plat sama seperti agent lain)
const nxLabel=makeLabel(nexusAgent);
nxLabel.scale.set(3.2,.8,1);nxLabel.position.set(RCX-.4,3.3,RCZ-.4);
reception.add(nxLabel);

office.add(reception);

// ═══════════════════════════════════════════════════
// WFS EXTRAS — kafe, server room, rak buku, water cooler, zona lantai
// ═══════════════════════════════════════════════════
// --- ZONA LANTAI (patch warna + label) ---
createZones({THREE,office});

// --- CAFÉ / COFFEE BAR (depan kiri) ---
const cafe=new THREE.Group();
const CFX=-9.5, CFZ=7.5;
// Counter L-shape
const c1=new THREE.Mesh(new THREE.BoxGeometry(3.2,.95,.6),M(0x6D4C41));
c1.position.set(CFX,.475,CFZ);c1.castShadow=true;cafe.add(c1);
const c2=new THREE.Mesh(new THREE.BoxGeometry(.6,.95,1.6),M(0x6D4C41));
c2.position.set(CFX+1.6,.475,CFZ-1);c2.castShadow=true;cafe.add(c2);
// Countertop
const ct1=new THREE.Mesh(new THREE.BoxGeometry(3.4,.05,.75),M(0xFFECB3));
ct1.position.set(CFX,.975,CFZ);cafe.add(ct1);
const ct2=new THREE.Mesh(new THREE.BoxGeometry(.75,.05,1.75),M(0xFFECB3));
ct2.position.set(CFX+1.6,.975,CFZ-1);cafe.add(ct2);
// Espresso machine
const em=new THREE.Mesh(new THREE.BoxGeometry(.5,.35,.35),M(0x263238));
em.position.set(CFX-.8,1.17,CFZ-.05);cafe.add(em);
const emG=new THREE.Mesh(new THREE.BoxGeometry(.1,.08,.02),MB(0x10E5A0));
emG.position.set(CFX-.8,1.1,CFZ+.13);cafe.add(emG);
// Kettle + cups
const kt=new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,.18,10),M(0x90A4AE));
kt.position.set(CFX-.1,1.09,CFZ);cafe.add(kt);
for(let i=0;i<3;i++){
  const cup=new THREE.Mesh(new THREE.CylinderGeometry(.04,.035,.06,8),M(i===0?0xEF5350:0xFAFAFA));
  cup.position.set(CFX+.5+i*.22,1.03,CFZ+.15);cafe.add(cup);
}
// Menu board above counter
const mbc=document.createElement('canvas');mbc.width=256;mbc.height=140;
const mx=mbc.getContext('2d');
mx.fillStyle='#1A1A2E';mx.fillRect(0,0,256,140);
mx.strokeStyle='#F59E0B';mx.lineWidth=6;mx.strokeRect(3,3,250,134);
mx.font='bold 26px sans-serif';mx.fillStyle='#F59E0B';mx.fillText('☕ WFS CAFÉ',34,40);
mx.font='15px monospace';mx.fillStyle='#EEE';
mx.fillText('Kopi susu      15k',26,75);
mx.fillText('Americano     18k',26,100);
mx.fillText('Matcha latte  22k',26,125);
const mbt=new THREE.CanvasTexture(mbc);
const mb=new THREE.Mesh(new THREE.PlaneGeometry(1.7,.95),new THREE.MeshBasicMaterial({map:mbt}));
mb.position.set(CFX,2.3,CFZ+.35);cafe.add(mb);
const mbB=new THREE.Mesh(new THREE.BoxGeometry(1.8,1.05,.04),M(0x2A2A2A));
mbB.position.set(CFX,2.3,CFZ+.32);cafe.add(mbB);
// Bar stools (oranye, 4 buah di depan counter)
[[-1.1],[-.35],[.4],[1.15]].forEach(([ox])=>{
  const st=new THREE.Group();
  const seat=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.06,12),M(0xFB8C00));
  seat.position.y=.62;st.add(seat);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.6,8),M(0x555555));
  pole.position.y=.3;st.add(pole);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.03,12),M(0x555555));
  base.position.y=.015;st.add(base);
  st.position.set(CFX+ox,0,CFZ+1);st.castShadow=true;
  cafe.add(st);
});
// Coolbox / snack fridge
const fr=new THREE.Mesh(new THREE.BoxGeometry(.55,1.1,.5),M(0xECEFF1));
fr.position.set(CFX+2.5,.55,CFZ-.2);fr.castShadow=true;cafe.add(fr);
const frG=new THREE.Mesh(new THREE.BoxGeometry(.4,.5,.02),MB(0x4FC3F7));
frG.position.set(CFX+2.5,.72,CFZ+.06);cafe.add(frG);
office.add(cafe);

// --- WELCOME & LOUNGE (kanan depan): set sofa lengkap, bukan lantai kosong ---
// Sofa besar sudah ada di (10.5, 6) menghadap -X. Dilengkapi: karpet lounge,
// coffee table + majalah, 2 kursi santai, lampu berdiri, meja majalah/TV info.
const lounge=new THREE.Group();
// Karpet lounge (bulat-ish: dua kotak bertumpuk warna hangat)
const lgRug=new THREE.Mesh(new THREE.BoxGeometry(3.2,.015,3.0),M(0x8D5524,{transparent:true,opacity:.75}));
lgRug.position.set(9.7,.02,7.4);lgRug.receiveShadow=true;lounge.add(lgRug);
const lgRugIn=new THREE.Mesh(new THREE.BoxGeometry(2.4,.017,2.2),M(0xC98A3D,{transparent:true,opacity:.75}));
lgRugIn.position.set(9.7,.025,7.4);lounge.add(lgRugIn);
// Coffee table (kaca + kayu) di depan sofa
const ctB=new THREE.Mesh(new THREE.BoxGeometry(1.0,.06,.6),M(0x6D4C41));
ctB.position.set(9.55,.36,6.4);lounge.add(ctB);
const ctTop=new THREE.Mesh(new THREE.BoxGeometry(1.1,.03,.7),M(0xB0BEC5,{transparent:true,opacity:.55}));
ctTop.position.set(9.55,.42,6.4);lounge.add(ctTop);
[[-.42,-.22],[.42,-.22],[-.42,.22],[.42,.22]].forEach(([ox,oz])=>{
  const leg=new THREE.Mesh(new THREE.BoxGeometry(.05,.34,.05),M(0x4E342E));
  leg.position.set(9.55+ox,.17,6.4+oz);lounge.add(leg);
});
// Majalah + cangkir di coffee table
const mag=new THREE.Mesh(new THREE.BoxGeometry(.24,.012,.3),M(0xF4511E));
mag.position.set(9.4,.45,6.35);mag.rotation.y=.4;lounge.add(mag);
const mug=new THREE.Mesh(new THREE.CylinderGeometry(.04,.035,.08,8),M(0xFAFAFA));
mug.position.set(9.75,.475,6.5);lounge.add(mug);
// 2 kursi santai menghadap sofa/meja
const armChair=(cx,cz,ry)=>{
  const g=new THREE.Group();
  const seat=new THREE.Mesh(new THREE.BoxGeometry(.6,.3,.6),M(0x00695C));seat.position.y=.3;g.add(seat);
  const cush=new THREE.Mesh(new THREE.BoxGeometry(.52,.1,.52),M(0x26A69A));cush.position.y=.5;g.add(cush);
  const back=new THREE.Mesh(new THREE.BoxGeometry(.6,.55,.12),M(0x00695C));back.position.set(0,.72,-.26);g.add(back);
  [[-.26,-.26],[.26,-.26],[-.26,.26],[.26,.26]].forEach(([ox,oz])=>{
    const leg=new THREE.Mesh(new THREE.BoxGeometry(.05,.15,.05),M(0x4E342E));
    leg.position.set(ox,.075,oz);g.add(leg);
  });
  g.position.set(cx,0,cz);g.rotation.y=ry;
  g.traverse(o=>{if(o.isMesh&&!o.material.isMeshBasicMaterial)o.castShadow=true;});
  lounge.add(g);return g;
};
armChair(8.7,7.7,Math.PI*.5);     // menghadap +X (ke arah sofa)
armChair(9.6,8.6,Math.PI);        // menghadap -Z (ke coffee table)
// Lampu berdiri (pole + shade hangat) di sudut lounge
const flPole=new THREE.Mesh(new THREE.CylinderGeometry(.025,.03,1.5,8),M(0x37474F));
flPole.position.set(11.2,.75,8.6);lounge.add(flPole);
const flShade=new THREE.Mesh(new THREE.CylinderGeometry(.18,.24,.28,10,1,true),
  M(0xFFE0B2,{side:THREE.DoubleSide,transparent:true,opacity:.9}));
flShade.position.set(11.2,1.6,8.6);lounge.add(flShade);
const flBulb=new THREE.PointLight(0xFFC97A,.5,4,2);
flBulb.position.set(11.2,1.5,8.6);lounge.add(flBulb);
// Meja majalah rendah + TV info layar (di dinding kanan area lounge)
const magRack=new THREE.Mesh(new THREE.BoxGeometry(.5,.45,.35),M(0x5D4037));
magRack.position.set(11.9,.225,7.0);lounge.add(magRack);
[0xF4511E,0x1E88E5,0x43A047].forEach((c,i)=>{
  const b=new THREE.Mesh(new THREE.BoxGeometry(.06,.22,.28),M(c));
  b.position.set(11.72,.36,7.0-(i-1)*.0);b.rotation.z=0;lounge.add(b);
});
const tvFrame=new THREE.Mesh(new THREE.BoxGeometry(.06,.75,1.3),M(0x101418));
tvFrame.position.set(12.35,2.0,6.4);lounge.add(tvFrame);
const tvC=document.createElement('canvas');tvC.width=256;tvC.height=144;
const tvx=tvC.getContext('2d');
tvx.fillStyle='#0A1628';tvx.fillRect(0,0,256,144);
tvx.fillStyle='#F59E0B';tvx.font='bold 20px sans-serif';tvx.fillText('WFS HQ',14,30);
tvx.fillStyle='#10E5A0';tvx.font='14px monospace';
tvx.fillText('deploy: OK  tests: 9/9',14,66);
tvx.fillText('agents: 14 online',14,88);
tvx.fillText('uptime: 99.98%',14,110);
const tvTex=new THREE.CanvasTexture(tvC);tvTex.minFilter=THREE.LinearFilter;
const tvScr=new THREE.Mesh(new THREE.PlaneGeometry(1.2,.68),new THREE.MeshBasicMaterial({map:tvTex}));
tvScr.position.set(12.31,2.0,6.4);tvScr.rotation.y=-Math.PI/2;lounge.add(tvScr);
office.add(lounge);

// --- SERVER ROOM (belakang tengah): 3 rak server dengan LED berkedip ---
const serverRack=(x,z)=>{
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(.9,2.1,.7),M(0x1C1C28));
  body.position.y=1.05;body.castShadow=true;g.add(body);
  for(let u=0;u<8;u++){
    const unit=new THREE.Mesh(new THREE.BoxGeometry(.8,.18,.6),M(0x232332));
    unit.position.set(0,.25+u*.23,0);g.add(unit);
    // LED strip: 3 lampu kecil random warna
    [0x00E676,0xFFC107,0x2979FF].forEach((lc,li)=>{
      const led=new THREE.Mesh(new THREE.BoxGeometry(.05,.04,.02),MB(lc));
      led.position.set(-.22+li*.18,.28+u*.23,.32);g.add(led);
    });
  }
  g.position.set(x,0,z);
  g.traverse(o=>{if(o.isMesh&&!o.material.isMeshBasicMaterial)o.castShadow=true;});
  office.add(g);
  return g;
};
serverRack(1.7,-7.6);serverRack(2.8,-7.6);serverRack(3.9,-7.6);
// Kabel bundel di lantai server room
const cableRun=new THREE.Mesh(new THREE.BoxGeometry(3,.04,.06),M(0x333344));
cableRun.position.set(2.8,.03,-7.6);office.add(cableRun);

// --- WATER COOLER (kiri) ---
const wcGrp=new THREE.Group();
const wcBody=new THREE.Mesh(new THREE.BoxGeometry(.4,1.1,.4),M(0xE0E0E0));
wcBody.position.y=.55;wcGrp.castShadow=true;wcGrp.add(wcBody);
const jug=new THREE.Mesh(new THREE.CylinderGeometry(.16,.18,.35,10),
  new THREE.MeshLambertMaterial({color:0x4FC3F7,transparent:true,opacity:.7}));
jug.position.y=1.28;wcGrp.add(jug);
const wcTap=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.1),M(0x607D8B));
wcTap.position.set(0,.85,.22);wcGrp.add(wcTap);
wcGrp.position.set(-11.6,0,0);office.add(wcGrp);

// --- RAK BUKU (dinding kiri belakang) ---
const shelf=new THREE.Group();
const SBX=-11.9, SBZ=-6;
const frameB=new THREE.Mesh(new THREE.BoxGeometry(.5,2.2,2.4),M(0x5D4037));
frameB.position.set(SBX,1.1,SBZ);shelf.add(frameB);
const bookCols=[0xEF5350,0xFFCA28,0x42A5F5,0x66BB6A,0xAB47BC,0xFF7043,0x26C6DA,0xEC407A];
for(let lvl=0;lvl<4;lvl++){
  const board=new THREE.Mesh(new THREE.BoxGeometry(.48,.03,2.3),M(0x8D6E63));
  board.position.set(SBX,.35+lvl*.55,SBZ);shelf.add(board);
  let bz=SBZ-1.05;
  while(bz<SBZ+1.0){
    const bw=.09+rng.r(0,.07);
    const bk=new THREE.Mesh(new THREE.BoxGeometry(.34,rng.r(.28,.4),bw),M(rng.pick(bookCols)));
    bk.position.set(SBX+.02,.35+lvl*.55+.17,bz+bw/2);shelf.add(bk);
    bz+=bw+.015;
  }
}
office.add(shelf);


// --- DEKORASI TAMBAHAN: kanban board, poster, tanaman besar, partisi kaca per tim ---
(function(){
  // Papan kanban di dinding belakang (kolom To Do / Doing / Done dengan kartu warna)
  const kc=document.createElement('canvas');kc.width=1024;kc.height=512;
  const k=kc.getContext('2d');
  k.fillStyle='#10192b';k.fillRect(0,0,1024,512);
  k.strokeStyle='#2c3e5c';k.lineWidth=4;k.strokeRect(6,6,1012,500);
  k.font='bold 40px sans-serif';k.textAlign='center';
  const cols=[['TO DO','#9aa7b8'],['DOING','#F59E0B'],['DONE','#10E5A0']];
  const cards=['#F472B6','#60A5FA','#A78BFA','#22D3EE','#FB923C','#34D399'];
  cols.forEach(([t,c],i)=>{
    const x=24+i*332;
    k.fillStyle='#17233a';k.fillRect(x,20,320,470);
    k.fillStyle=c;k.fillText(t,x+160,70);
    for(let r=0;r<4;r++){
      if(i===0&&r>2)continue; if(i===1&&r>1)continue;
      k.fillStyle=cards[(i*3+r)%cards.length];k.fillRect(x+16,100+r*92,288,74);
      k.fillStyle='rgba(0,0,0,.35)';k.fillRect(x+30,120+r*92,180,10);k.fillRect(x+30,142+r*92,120,10);
    }
  });
  const kt=new THREE.CanvasTexture(kc);
  const kb=new THREE.Mesh(new THREE.PlaneGeometry(4.6,2.3),new THREE.MeshBasicMaterial({map:kt}));
  kb.position.set(-8.6,2.4,9.2);kb.rotation.y=Math.PI;office.add(kb);
  const kf=new THREE.Mesh(new THREE.BoxGeometry(4.75,2.45,.05),M(0x23324d));
  kf.position.set(-8.6,2.4,9.25);office.add(kf);
  // Poster motivasi
  [['SHIP IT','#F59E0B',3.0],['CODE\nCOFFEE','#F472B6',5.2]].forEach(([txt,col,x])=>{
    const pc=document.createElement('canvas');pc.width=256;pc.height=340;
    const p=pc.getContext('2d');
    p.fillStyle='#0f1a2e';p.fillRect(0,0,256,340);p.strokeStyle=col;p.lineWidth=8;p.strokeRect(10,10,236,320);
    p.fillStyle=col;p.font='bold 48px sans-serif';p.textAlign='center';
    txt.split('\n').forEach((l,i)=>p.fillText(l,128,150+i*56));
    const pm=new THREE.Mesh(new THREE.PlaneGeometry(1.1,1.45),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(pc)}));
    pm.position.set(x+5.0,2.4,9.2);pm.rotation.y=Math.PI;office.add(pm);
  });
  // Tanaman besar di sudut
  [[11.4,-8.6],[-11.4,8.6],[11.4,8.6]].forEach(([x,z])=>{
    const pot=new THREE.Mesh(new THREE.CylinderGeometry(.35,.28,.55,10),M(0x8B5E3C));
    pot.position.set(x,.28,z);office.add(pot);
    for(let i=0;i<5;i++){
      const lf=new THREE.Mesh(new THREE.SphereGeometry(.38-i*.03,8,6),M(i%2?0x2E7D32:0x43A047));
      lf.position.set(x+Math.sin(i*1.9)*.15,.85+i*.32,z+Math.cos(i*1.9)*.15);office.add(lf);
    }
  });
  // Partisi kaca rendah antar kelompok tim (tampilan zona)
  [[-6,-0.8],[-2,-0.8],[2,-0.8]].forEach(([x,z])=>{
    const gl=new THREE.Mesh(new THREE.BoxGeometry(.04,.9,2.2),new THREE.MeshLambertMaterial({color:0x9ad8ff,transparent:true,opacity:.18}));
    gl.position.set(x,.5,z+0.3);gl.rotation.y=0;gl.renderOrder=2;office.add(gl);
  });
  // Lampu lantai hangat di area lounge
  const wl=new THREE.PointLight(0xFFC97A,.9,9,1.6);wl.position.set(-9.5,2.4,-1);office.add(wl);
})();

// --- RUG dekoratif area tengah ---
const rug=new THREE.Mesh(new THREE.BoxGeometry(3.6,.015,2.4),
  new THREE.MeshLambertMaterial({color:0x1565C0,transparent:true,opacity:.85}));
rug.position.set(0,.02,4.5);rug.receiveShadow=true;office.add(rug);
const rugInner=new THREE.Mesh(new THREE.BoxGeometry(2.6,.017,1.6),
  new THREE.MeshLambertMaterial({color:0xEF6C00,transparent:true,opacity:.85}));
rugInner.position.set(0,.022,4.5);office.add(rugInner);

// --- TANAMAN BESI tambahan di sudut ---
addPlant(11.6,-8.5,true);
addPlant(-11.6,8.8,true);

// --- JUDUL di dinding belakang (big wall text WFS PROJECT) ---
const wtc=document.createElement('canvas');wtc.width=1024;wtc.height=200;
const wtx=wtc.getContext('2d');
wtx.clearRect(0,0,1024,200);
wtx.font='900 130px "Segoe UI",Arial,sans-serif';wtx.textAlign='center';wtx.textBaseline='middle';
wtx.fillStyle='#FFFFFF';
wtx.fillText('WFS',300,100);
wtx.fillStyle='#F59E0B';
wtx.fillText('PROJECT',730,100);
const wtt=new THREE.CanvasTexture(wtc);
const wallTitle=new THREE.Mesh(new THREE.PlaneGeometry(7,1.37),new THREE.MeshBasicMaterial({map:wtt,transparent:true})); // eslint-disable-line no-unused-vars -- kandidat pajangan dinding



// ═══ DINDING KANTOR SOLID + LOGO WFS PROJECT ═══
// Kamera default ada di sisi z negatif & x positif => dinding LATAR = z=+9.5 (belakang) dan x=-12.5 (kiri).
// Dinding dekat kamera (z=-9.5, x=+12.5) tetap kaca transparan agar interior terlihat.
const __wallObjs=[];
(function(){
  const W=(geo,mat,x,y,z,ry)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);if(ry)m.rotation.y=ry;office.add(m);__wallObjs.push(m);return m};
  const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  const tex=(base,line,wpx=512,hpx=256,step=64)=>{
    const c=document.createElement('canvas');c.width=wpx;c.height=hpx;const x=c.getContext('2d');
    x.fillStyle=base;x.fillRect(0,0,wpx,hpx);
    x.strokeStyle=line;x.lineWidth=3;
    for(let i=0;i<=wpx;i+=step){x.beginPath();x.moveTo(i,0);x.lineTo(i,hpx);x.stroke();}
    const g=x.createLinearGradient(0,0,0,hpx);g.addColorStop(0,'rgba(255,255,255,.12)');g.addColorStop(1,'rgba(0,0,0,.08)');
    x.fillStyle=g;x.fillRect(0,0,wpx,hpx);
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
      const {x,y,z}=m.position, thin=0.55;
      if(y>4.3||y<0.0)return;
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
  const fadeOf=(d)=>Math.max(0,Math.min(1,1-(d+1.5)/6));   // 1 = solid, 0 = hilang
  window.__wallFade=(cam)=>{
    if(!collected)collect();
    const val={};
    for(const k in wallDefs){
      const a=fadeOf(wallDefs[k].out(cam)); val[k]=+a.toFixed(2);
      wallDefs[k].objs.forEach(m=>{
        const on=a>0.04; m.visible=on;
        if(on&&m.material&&!Array.isArray(m.material)){m.material.transparent=true;m.material.opacity=a;}
      });
    }
    (window.__corners||[]).forEach(m=>{
      const kx=m.position.x<0?'left':'right', kz=m.position.z<0?'front':'back';
      m.visible=Math.max(val[kx],val[kz])>0.5;                // tiang hanya bila dinding di sebelahnya terlihat
    });
    window.__wallLast={...val,cam:[+cam.x.toFixed(1),+cam.y.toFixed(1),+cam.z.toFixed(1)]};
    return window.__wallLast;
  };
  window.__wallState=()=>window.__wallLast;

  // ---- LOGO WFS PROJECT besar di dinding belakang ----
  const lc=document.createElement('canvas');lc.width=2048;lc.height=640;const l=lc.getContext('2d');
  l.fillStyle='#0F1B2E';l.fillRect(0,0,2048,640);
  l.strokeStyle='#D4AF37';l.lineWidth=14;l.strokeRect(12,12,2024,616);
  const hex=(cx,cy,r)=>{l.beginPath();for(let i=0;i<6;i++){const a=Math.PI/6+i*Math.PI/3;l.lineTo(cx+r*Math.cos(a),cy+r*Math.sin(a));}l.closePath();};
  const grad=l.createLinearGradient(100,60,460,580);grad.addColorStop(0,'#FBBF24');grad.addColorStop(1,'#F97316');
  hex(300,320,230);l.fillStyle=grad;l.fill();
  hex(300,320,196);l.fillStyle='#0F1B2E';l.fill();
  l.fillStyle=grad;l.font='900 250px "Segoe UI",Arial,sans-serif';l.textAlign='center';l.textBaseline='middle';
  l.fillText('W',300,335);
  l.textAlign='left';l.textBaseline='alphabetic';
  l.fillStyle='#FFFFFF';l.font='900 310px "Segoe UI",Arial,sans-serif';l.fillText('WFS',610,290);
  l.fillStyle='#FBBF24';l.font='800 170px "Segoe UI",Arial,sans-serif';l.fillText('PROJECT',616,470);
  l.fillStyle='rgba(255,255,255,.75)';l.font='600 62px "Segoe UI",Arial,sans-serif';l.fillText('SOFTWARE HOUSE  \u00b7  AI TEAM',620,570);
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
  n.fillStyle='#0F1B2E';n.fillRect(0,0,1024,320);
  n.strokeStyle='#D4AF37';n.lineWidth=10;n.strokeRect(10,10,1004,300);
  n.fillStyle='#FBBF24';n.font='900 130px "Segoe UI",Arial,sans-serif';n.textAlign='center';n.fillText('WFS PROJECT',512,150);
  n.fillStyle='#FFFFFF';n.font='600 60px "Segoe UI",Arial,sans-serif';n.fillText('Selamat Datang \u00b7 Welcome',512,250);
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
})();

// ═══ JAM DINDING (modul parts/room.js) ═══
const __clk=createWallClock({THREE,office,M},-4.6,2.9,9.27,Math.PI);
const drawClock=__clk.draw;


// ═══ LAMPU GANTUNG (modul parts/room.js) ═══
createCeilingFixtures({THREE,office,M,MB},desks);

// ═══════════════════════════════════════════════════
// AC VENTS / DUCTS ON CEILING
// ═══════════════════════════════════════════════════
// Long duct running across
const duct=new THREE.Mesh(new THREE.BoxGeometry(22,.15,.3),M(0xCCCCCC));
duct.position.set(0,3.9,0);office.add(duct);__ceilObjs.push(duct);
// Cross ducts
[-4,4].forEach(z=>{
  const cd=new THREE.Mesh(new THREE.BoxGeometry(.3,.12,8),M(0xBBBBBB));
  cd.position.set(0,3.88,z);office.add(cd);__ceilObjs.push(cd);
});
// Vent grilles
for(let i=-3;i<=3;i++){
  if(i===0)continue;
  const vent=new THREE.Mesh(new THREE.BoxGeometry(.4,.03,.25),M(0xDDDDDD));
  vent.position.set(i*3,3.82,0);office.add(vent);__ceilObjs.push(vent);
  // Grille lines
  for(let g=0;g<3;g++){
    const gl=new THREE.Mesh(new THREE.BoxGeometry(.35,.005,.02),M(0xAAAAAA));
    gl.position.set(i*3,3.815,-.08+g*.08);office.add(gl);__ceilObjs.push(gl);
  }
}

// ═══ EFEK (modul parts/effects.js) ═══
addDeskTrinkets({THREE,office,M,rng},desks);
const __pages=createDriftingPages({THREE,office,rng});
let frame=0;
const drawScreen=s=>drawScreenFrame(s,frame);

// ═══════════════════════════════════════════════════
// TIME SYSTEM
// ═══════════════════════════════════════════════════
// slider handled by React
// clock handled by React
// status handled by React
let timeOfDay=660;
const lC=mixHex; // eslint-disable-line no-unused-vars -- kompatibilitas nama lama
const __light=createLighting({THREE,scene,renderer,sun,ambient,agentData,onTimeUpdate,onStatusUpdate,onTick:m=>updateMeeting(m)});
function updateTime(min){timeOfDay=min;__light.apply(min)}
updateTime(660);

// ═══════════════════════════════════════════════════
// DEPLOY TICKER — flip-flop agent deployment status
// ═══════════════════════════════════════════════════


// ═══════════════════════════════════════════════════
// CYBERPUNK LIGHTS OFF MODE
// ═══════════════════════════════════════════════════
let cyberpunkMode=false;
// btn handled by React

// Store ceiling tube light refs
const tubeLights=[];
const tubeMeshes=[];

// Create glowing tube lights on ceiling (visible in cyberpunk mode)
for(let i=-2;i<=2;i++){
  const tube=new THREE.Mesh(new THREE.BoxGeometry(10,.04,.08),new THREE.MeshBasicMaterial({color:0x334466,transparent:true,opacity:0.3}));
  tube.position.set(i*4.5,3.92,0);office.add(tube);__ceilObjs.push(tube);
  tubeMeshes.push(tube);
  // Line light along tube
  const tl=new THREE.PointLight(0x334466,0,12,1.5);
  tl.position.set(i*4.5,3.85,0);office.add(tl);
  tubeLights.push(tl);
}

// Screen-face lights — referensi per-agent dari buildDesk
const screenLights=[];
agentData.forEach(ad=>{
  if(ad.screenLight)screenLights.push(ad.screenLight);
});

const __neon=createNeonMode({ambient,sun,renderer,floor:fl,carpet:cp,ceiling:ceil,tubes:tubeMeshes,tubeLights,agentData,screenLights,
  reception:rcLight,
  pendants:{
    bulbs:office.children.filter(c=>c.isMesh&&c.material&&c.material.isMeshBasicMaterial&&c.position.y>3.1&&c.position.y<3.15),
    lights:office.children.filter(c=>c.isPointLight&&c.position.y>3.0&&c.position.y<3.15)},
  panelLights:office.children.filter(c=>c.isPointLight&&c.position.y>3.5&&c.position.y<3.95),
  restoreTime:()=>updateTime(timeOfDay)});
function toggleCyberpunk(){cyberpunkMode=__neon.toggle()}

// ═══════════════════════════════════════════════════
// PARTICLES
// ═══════════════════════════════════════════════════
const pN=40,pG=new THREE.BufferGeometry(),pP=new Float32Array(pN*3);
for(let i=0;i<pN;i++){pP[i*3]=rng.r(-11,11);pP[i*3+1]=rng.r(.5,3.5);pP[i*3+2]=rng.r(-8,8)}
pG.setAttribute('position',new THREE.BufferAttribute(pP,3));
office.add(new THREE.Points(pG,new THREE.PointsMaterial({color:0xFFFFFF,size:.02,transparent:true,opacity:.25})));

// ═══════════════════════════════════════════════════
// MEJA UTAMA — ruang kerja agent pertama (lead)
// ═══════════════════════════════════════════════════
const leadDesk=desks[0];
// Second monitor
const rm2Stand=new THREE.Mesh(new THREE.BoxGeometry(.03,.22,.03),M(0xAABBCC));
rm2Stand.position.set(leadDesk.x+.5,.88,leadDesk.z-.2);office.add(rm2Stand);
const rm2Body=new THREE.Mesh(new THREE.BoxGeometry(.65,.42,.03),M(0x2A2A2A));
rm2Body.position.set(leadDesk.x+.5,1.28,leadDesk.z-.24);office.add(rm2Body);
const rm2Screen=new THREE.Mesh(new THREE.BoxGeometry(.58,.36,.01),MB(0x051015));
rm2Screen.position.set(leadDesk.x+.5,1.28,leadDesk.z-.22);office.add(rm2Screen);

// Helmet trophy on desk
const helmetBase=new THREE.Mesh(new THREE.BoxGeometry(.15,.03,.15),M(0x1A2A3A));
helmetBase.position.set(leadDesk.x+.55,.79,leadDesk.z+.2);office.add(helmetBase);
// Tiny helmet shape (V-visor)
const helmetBody=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.1),M(0xDDDDDD));
helmetBody.position.set(leadDesk.x+.55,.87,leadDesk.z+.2);office.add(helmetBody);
const helmetVisor=new THREE.Mesh(new THREE.BoxGeometry(.1,.04,.02),MB(0x0DEEF3));
helmetVisor.position.set(leadDesk.x+.55,.88,leadDesk.z+.15);office.add(helmetVisor);
// Tiny helmet glow
const helmetGlow=new THREE.PointLight(0x0DEEF3,0.15,1,2);
helmetGlow.position.set(leadDesk.x+.55,.9,leadDesk.z+.15);office.add(helmetGlow);

// Cincin lantai di sekitar meja utama
const ringGeo=new THREE.RingGeometry(1.2,1.25,32);
const ringMat=new THREE.MeshBasicMaterial({color:0x0DEEF3,transparent:true,opacity:0.15,side:THREE.DoubleSide});
const floorRing=new THREE.Mesh(ringGeo,ringMat);
floorRing.rotation.x=-Math.PI/2;
floorRing.position.set(leadDesk.x,.02,leadDesk.z+.2);
office.add(floorRing);
// Inner ring
const ringInner=new THREE.Mesh(new THREE.RingGeometry(1.05,1.08,32),new THREE.MeshBasicMaterial({color:0x0DEEF3,transparent:true,opacity:0.08,side:THREE.DoubleSide}));
ringInner.rotation.x=-Math.PI/2;ringInner.position.set(leadDesk.x,.02,leadDesk.z+.2);
office.add(ringInner);

// Pulse ring (animated in render loop)
const pulseRing=new THREE.Mesh(new THREE.RingGeometry(1.3,1.33,32),new THREE.MeshBasicMaterial({color:0x0DEEF3,transparent:true,opacity:0,side:THREE.DoubleSide}));
pulseRing.rotation.x=-Math.PI/2;pulseRing.position.set(leadDesk.x,.02,leadDesk.z+.2);
office.add(pulseRing);

// ═══════════════════════════════════════════════════
// WATER COOLER CONVERSATIONS — Speech Bubbles
// ═══════════════════════════════════════════════════
const chatBubbles=[];
const chatPhrases=[
  'pushing to prod...','merge conflict!!','coffee?','ship it!',
  'lgtm +1','who broke CI?','standup in 5','nice refactor',
  'read the ADR','need a review','lunch?','one more bug...',
  'deploying...','v10.8 is live','taste > speed','type safe pls',
];

function createBubble(x,y,z,text,color){
  const W=360,H=76,bc=document.createElement('canvas');bc.width=W;bc.height=H;
  const bx=bc.getContext('2d');
  bx.fillStyle='rgba(7,16,32,0.94)';                       // lebih pekat dari 0.85 agar terbaca
  const rr=(cx,cy,cw,ch,cr)=>{bx.beginPath();bx.moveTo(cx+cr,cy);bx.lineTo(cx+cw-cr,cy);bx.quadraticCurveTo(cx+cw,cy,cx+cw,cy+cr);bx.lineTo(cx+cw,cy+ch-cr);bx.quadraticCurveTo(cx+cw,cy+ch,cx+cw-cr,cy+ch);bx.lineTo(cx+cr,cy+ch);bx.quadraticCurveTo(cx,cy+ch,cx,cy+ch-cr);bx.lineTo(cx,cy+cr);bx.quadraticCurveTo(cx,cy,cx+cr,cy);bx.closePath()};
  rr(3,3,W-6,H-14,10);bx.fill();
  bx.strokeStyle=color;bx.lineWidth=2.5;rr(3,3,W-6,H-14,10);bx.stroke();
  bx.beginPath();bx.moveTo(W/2-9,H-11);bx.lineTo(W/2,H-3);bx.lineTo(W/2+9,H-11);bx.closePath();bx.fillStyle='rgba(7,16,32,0.94)';bx.fill();
  bx.font='700 24px "Segoe UI",Arial,sans-serif';bx.fillStyle='#fff';bx.textAlign='center';
  let t=String(text); if(t.length>32)t=t.slice(0,31)+'…';
  bx.fillText(t,W/2,32);
  const btex=new THREE.CanvasTexture(bc);btex.minFilter=THREE.LinearFilter;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:btex,transparent:true,depthTest:false,sizeAttenuation:false}));
  sprite.userData.aspect=W/H; sprite.renderOrder=30;
  const hFrac=0.034;                                       // ≈ 3.4% tinggi layar
  sprite.scale.set(hFrac*sprite.userData.aspect,hFrac,1);
  sprite.position.set(x,y+1.35,z);
  office.add(sprite);
  chatBubbles.push({sprite,life:3.5,startY:y+1.35});
  window.__bubbleCount=chatBubbles.length; window.__lastBubble=text;
}


// Auto talk: agent cerita sendiri tiap beberapa detik (per role)
const roleTalk={
  'BANTUIN AI':['“Siang kak! Mau cek order?”','“Chat 47 hari ini 🔥”'],
  'BUDI':['“API-nya udah jalan”','“Push dulu…”'],
  'RIZKY':['“Webhook Midtrans ✓”','“Query ku-optimize”'],
  'DEWI':['“Responsive rapi 📱”','“Dark mode siap”'],
  'ANDI':['“Lighthouse 97! 🎉”','“Hover-nya lucu”'],
  'YOGA':['“Build APK selesai”','“Push notif live”'],
  'MAYA':['“Design v3 ✅”','“Spacing dikoreksi”'],
  'TONI':['“CPU 12%, aman”','“Docker up ✅”'],
  'RINA':['“214 test passing ✅”','“1 bug ketemu”'],
  'LINA':['“CPC turun 18% 📉”','“Leads naik!”'],
  'SARI':['“Sprint on track ✅”','“Demo ya besok”'],
  'CEO':['“Deal baru 🤝”','“Kopi dulu ☕”'],
};
let talkTimer=4; // eslint-disable-line no-unused-vars -- reset loop obrolan
let lastTalkRT=performance.now();
function autoTalk(){
  const now=performance.now();
  if(now-lastTalkRT<4000+Math.random()*6000)return;
  lastTalkRT=now;
  const ad=agentData[Math.floor(Math.random()*agentData.length)];
  if(!ad)return;
  const wp=ad.walker.visible?ad.walker.position:{x:ad.home.x,z:ad.home.z};
  // Prioritas: kalau ada task running untuk agent ini, tampilkan status kerja nyata
  const rt=window.__wfsRunningTasks;
  if(rt&&rt.byAgent){
    const rid=window.__wfsAgentIdMap&&window.__wfsAgentIdMap[ad.agent.name];
    const run=rid&&rt.byAgent[rid];
    if(run){
      createBubble(wp.x,2.6,wp.z,'🔧 Task #'+run.id+': '+run.title.slice(0,26)+'…',ad.agent.hex);
      return;
    }
  }
  const lines=roleTalk[ad.agent.name]||['“Fokus dulu…”'];
  createBubble(wp.x,2.6,wp.z,lines[Math.floor(Math.random()*lines.length)],ad.agent.hex);
}
// Sinkron task running dari gateway tiap 15 detik
(function(){
  async function pollRunning(){
    try{
      const r=await fetch('/wfs-api/agents/status');
      const d=await r.json();
      const agents=d.agents||{};
      const im={};(window.__wfsAgentIdList||[]).forEach(x=>im[x.name]=x.id);
      window.__wfsAgentIdMap=im;
      const byAgent={};
      Object.entries(agents).forEach(([gid,v])=>{
        if(v.running>0)byAgent[gid]={id:'?',title:'mengerjakan',n:v.running};
      });
      // ambil detail task running utk judul
      try{
        const r2=await fetch('/wfs-api/tasks');
        const t2=await r2.json();
        const tasks=Array.isArray(t2)?t2:(t2.tasks||[]);
        tasks.forEach(t=>{
          const gid=t.agent_id;
          if(t.status==='running'&&byAgent[gid])byAgent[gid]={id:t.id,title:t.title,n:byAgent[gid].n};
        });
      }catch{ /* respons non-JSON */ }
      window.__wfsRunningTasks={byAgent};
    }catch{ /* gateway offline */ }
  }
  setTimeout(pollRunning,3000);
  setInterval(pollRunning,15000);
})();
function checkConversations(){
  for(let i=0;i<agentData.length;i++){
    const a=agentData[i];
    if(!a.walker.visible)continue;
    for(let j=i+1;j<agentData.length;j++){
      const b=agentData[j];
      if(!b.walker.visible)continue;
      const dx=a.walker.position.x-b.walker.position.x;
      const dz=a.walker.position.z-b.walker.position.z;
      const dist=Math.sqrt(dx*dx+dz*dz);
      if(dist<1.5&&!a._chatCooldown&&!b._chatCooldown){
        // Conversation!
        const mx=(a.walker.position.x+b.walker.position.x)/2;
        const mz=(a.walker.position.z+b.walker.position.z)/2;
        const phrase=chatPhrases[Math.floor(Math.random()*chatPhrases.length)];
        createBubble(mx,1.4,mz,phrase,a.agent.hex);
        a._chatCooldown=8;b._chatCooldown=8;
      }
    }
    if(a._chatCooldown)a._chatCooldown-=0.016;
    if(a._chatCooldown<0)a._chatCooldown=0;
  }
}

function updateBubbles(delta){
  for(let i=chatBubbles.length-1;i>=0;i--){
    const b=chatBubbles[i];
    b.life-=delta;
    b.sprite.position.y=b.startY+(3-b.life)*.12; // float up
    b.sprite.material.opacity=Math.max(0,b.life/3);
    if(b.life<=0){
      office.remove(b.sprite);
      b.sprite.material.dispose();
      chatBubbles.splice(i,1);
    }
  }
}

// ═══════════════════════════════════════════════════
// SHIFT CHANGE — Agents arrive/leave
// ═══════════════════════════════════════════════════
const __shift=createShift({THREE,agentData,rng});
const updateShift=m=>__shift.update(m);

// ═══════════════════════════════════════════════════
// SOUND SYSTEM — Web Audio API
// ═══════════════════════════════════════════════════
let audioCtx=null;
let soundsStarted=false;

function initAudio(){
  if(soundsStarted)return;
  soundsStarted=true;
  audioCtx=new(window.AudioContext||window.webkitAudioContext)();
}

function playKeyClick(){
  if(!audioCtx)return;
  const osc=audioCtx.createOscillator();
  osc.type='square';osc.frequency.value=800+Math.random()*400;
  const g=audioCtx.createGain();g.gain.value=0.01;
  g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.05);
  osc.connect(g);g.connect(audioCtx.destination);
  osc.start();osc.stop(audioCtx.currentTime+0.05);
}

function playStep(){
  if(!audioCtx)return;
  const buf=audioCtx.createBuffer(1,audioCtx.sampleRate*0.04,audioCtx.sampleRate);
  const data=buf.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*5);
  const src=audioCtx.createBufferSource();src.buffer=buf;
  const g=audioCtx.createGain();g.gain.value=0.02;
  src.connect(g);g.connect(audioCtx.destination);
  src.start();
}

function playMeetingChime(){
  if(!audioCtx)return;
  [523.25,659.25,783.99].forEach((freq,i)=>{
    setTimeout(()=>{
      const osc=audioCtx.createOscillator();osc.type='sine';osc.frequency.value=freq;
      const g=audioCtx.createGain();g.gain.value=0.04;
      g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.5);
      osc.connect(g);g.connect(audioCtx.destination);
      osc.start();osc.stop(audioCtx.currentTime+0.5);
    },i*150);
  });
}

// Start audio on first interaction


// Track keyboard sounds — kini benar-benar dipakai: tick keyboard & langkah saat agent jalan
let keyTimer=0, stepTimer=0;
// Tujuan jalan-jalan agent: pantry, dispenser, printer, lounge, ruang meeting, resepsionis
const walkDestinations=[
  {x:-9.4,z:3.6},   // pantry
  {x:-9.5,z:0.9},   // dispenser air
  {x:2.2,z:-7.0},   // printer
  {x:9.4,z:4.8},    // lounge
  {x:6.0,z:-0.6},   // pintu ruang meeting
  {x:6.8,z:4.9},    // depan resepsionis
  {x:-0.5,z:4.2},   // jalur tengah
  {x:-3.2,z:-6.2},  // dekat tanaman belakang
];
const updateWalkers=createMotion({rng,agentData,walkDestinations,pickCollab,createBubble});
let lastMeetingState=false;
const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  if(!renderer)return; // UI-only mode (tanpa WebGL)
  const delta=Math.min(clock.getDelta(),.05);
  const elapsed=clock.getElapsedTime();
  frame++;
  window.__animFrames=frame;
  if(focusGoal){tgt.lerp(focusGoal.t,.06);sph.radius+=(focusGoal.r-sph.radius)*.06;updCam();if(focusGoal.reset&&tgt.distanceTo(HOME_TGT)<.05){focusGoal=null}}
  if(autoRot){sph.theta+=.0012;updCam()}
  screenData.forEach(drawScreen);
  updateWalkers(delta);

  // Water cooler convos
  checkConversations();updateBubbles(delta);autoTalk(delta);
  // Shift
  updateShift(timeOfDay);

  // cincin denyut agent utama
  const pulseT=(elapsed*.5)%1;
  pulseRing.scale.set(1+pulseT*.3,1,1+pulseT*.3);
  pulseRing.material.opacity=.15*(1-pulseT);
  ringMat.opacity=.12+Math.sin(elapsed*1.5)*.04;
  helmetVisor.material.opacity=.8+Math.sin(elapsed*3)*.2;

  // Dust drift
  for(let i=0;i<pN;i++){pP[i*3]+=Math.sin(elapsed+i)*.0006;pP[i*3+1]+=Math.cos(elapsed*.4+i*.5)*.0003;if(pP[i*3+1]>3.6)pP[i*3+1]=.5}
  pG.attributes.position.needsUpdate=true;
  // Labels
  agentData.forEach((a,i)=>{if(a.state==='sitting')a.label.position.y=LABEL_Y+Math.sin(elapsed*1.1+i*1.3)*.02});
  // Atap & lampu panel disembunyikan saat kamera di atas (agar isi kantor terlihat), dimunculkan dari sudut rendah
  if(window.__wallFade)window.__wallFade(camera.position);
  { const hide = sph.phi < 1.15; ceil.visible=!hide; __ceilObjs.forEach(o=>{o.visible=!hide}); __ceilObjsSafe.forEach(o=>{o.visible=!hide}); }
  // Anti-tumpuk label: dorong ke atas bila label lain terlalu dekat di layar (iterasi ringan)
  sizeLabels();
  if(namesVisible){
    const vis=agentData.filter(a=>a.label.visible);
    const __k=container.clientHeight/(2*Math.tan(camera.fov*Math.PI/360));
    // jarak kamera per-agent (ukuran layar sprite berbanding terbalik dgn jarak)
    // baseY/baseX dicatat SEBELUM offset diterapkan, sehingga offset tidak terakumulasi antar frame
    // (dulu label meeting/walker naik terus karena position.y di-adjust tanpa reset).
    const pts=vis.map(a=>{const u=a.label.userData, v=a.label.position.clone().project(camera); const da={dist:Math.max(2,camera.position.distanceTo(a.label.position))};
      // baseY/baseX = posisi state (sitting/meeting/walker) minus offset anti-tumpuk frame sebelumnya,
      // sehingga offset TIDAK terakumulasi antar frame.
      // ukuran piksel sprite = scale dunia × (px per unit @ dist 1) / jarak kamera (sprite menyusut dgn jarak)
      // agent label: sizeAttenuation=false -> ukuran piksel KONSTAN, TIDAK dibagi jarak kamera
      return {a,zone:false,sw:a.label.scale.x*__k,sh:a.label.scale.y*__k,baseY:a.label.position.y-(u.antiY||0),baseX:a.label.position.x-(u.antiX||0),x:v.x*container.clientWidth/2,y:v.y*container.clientHeight/2,offY:0,offX:0}});
    // label ZONA statis ikut dihitung (sebagai penghalang): agent yang menumpuk zona digeser, zona tidak bergerak
    pts.sort((p,q)=>p.y-q.y);
    if(window.__zoneLabels){const __kz=container.clientHeight/(2*Math.tan(camera.fov*Math.PI/360));
      window.__zoneLabels.forEach(zt=>{if(!zt.visible)return;
        const v=zt.position.clone().project(camera);if(v.z>1)return;
        const dz=Math.max(2,camera.position.distanceTo(zt.position));
        // jitter deterministik per zona (hash label) supaya kluster label zona+agent tidak membentuk tumpukan simetris
      // base dari posisi ASLI (bukan position.y yang sudah digeser frame lalu) -> tidak terakumulasi
      const zb=(window.__zoneBase&&window.__zoneBase.get(zt))||{y:zt.position.y,x:zt.position.x};
      let hsh=0;for(const ch of zt.userData.label||'')hsh=(hsh*31+ch.charCodeAt(0))|0;
      const jy=(hsh%7)-3, jx=((hsh>>3)%9)-4;
      pts.push({a:null,zone:true,zt,zw:zt.scale.x*__kz/dz*1.06,zh:zt.scale.y*__kz/dz*1.25,baseY:zb.y+jy*0.06,baseX:zb.x+jx*0.08,x:v.x*container.clientWidth/2,y:v.y*container.clientHeight/2,offY:0,offX:0});});}
    // bubble dialog ikut sebagai penghalang statis: label zona digeser menjauh dari bubble (bubble tidak bergerak)
    chatBubbles.forEach(bb=>{const v=bb.sprite.position.clone().project(camera);if(v.z>1)return;
      const db=Math.max(2,camera.position.distanceTo(bb.sprite.position)), pk=container.clientHeight/(2*Math.tan(camera.fov*Math.PI/360));
      // bubble: sizeAttenuation=false -> piksel konstan (scale sudah fraksi tinggi layar × __k)
      pts.push({a:null,zone:true,zt:null,bub:bb.sprite,zw:bb.sprite.scale.x*pk,zh:bb.sprite.scale.y*pk,baseY:bb.sprite.position.y,baseX:bb.sprite.position.x,x:v.x*container.clientWidth/2,y:v.y*container.clientHeight/2,offY:0,offX:0});});
    const __L=agentData[0].label;
    for(let iter=0;iter<3;iter++){ // multi-pass: satu pass hanya menggeser sedikit, 3 pass menjamin kluster padat benar2 terpisah
    for(let i=0;i<pts.length;i++){for(let j=0;j<i;j++){
      // PAD = breathing room: box diperluas 10px per sisi supaya label tak "menempel" (<5px gap)
      const PAD=18, lwi=(pts[i].sw||pts[i].zw||0)+PAD, lhi=(pts[i].sh||pts[i].zh||0)+PAD,
            lwj=(pts[j].sw||pts[j].zw||0)+PAD, lhj=(pts[j].sh||pts[j].zh||0)+PAD;
      const dx=Math.abs(pts[i].x-pts[j].x), dy=Math.abs((pts[i].y+pts[i].offY)-(pts[j].y+pts[j].offY));
      if(dx<(lwi+lwj)/2 && dy<(lhi+lhj)/2){
        // geser vertikal dulu; bila vertikal mentok, geser horizontal ke arah bebas
        const h2=((lhi+lhj)/2)-dy, w2=((lwi+lwj)/2)-dx;
        if(!pts[i].zone){pts[i].offY+=h2*1.6;const dir=(pts[i].x>=pts[j].x)?1:-1;pts[i].offX+=dir*w2*0.9;}
        else if(!pts[j].zone){pts[j].offY-=h2*1.6;const dir=(pts[j].x>=pts[i].x)?1:-1;pts[j].offX+=dir*w2*0.9;}
      }
    }}
    } // end 2-pass anti-overlap
    // konversi offset piksel ke satuan dunia (~ jarak/tinggi layar), cap supaya label tidak melayang jauh
    const dist=camera.position.distanceTo(tgt), worldPerPx=2*dist*Math.tan(camera.fov*Math.PI/360)/container.clientHeight;
    pts.forEach(p=>{
      const dy=Math.min(10,p.offY*worldPerPx*1.2), dx=Math.max(-2.5,Math.min(2.5,p.offX*worldPerPx));
      if(p.zone){if(p.zt){p.zt.position.y=p.baseY+dy; p.zt.position.x=p.baseX+dx;} else if(p.bub){p.bub.position.y=p.baseY+dy*0.4; p.bub.position.x=p.baseX+dx*0.5;} return;} // zona/bubble
      p.a.label.position.y=p.baseY+dy; p.a.label.position.x=p.baseX+dx;
      p.a.label.userData.antiY=dy; p.a.label.userData.antiX=dx; // utk base frame berikutnya
    });
  } else {
    // bila nama disembunyikan lalu dimunculkan lagi, posisi direset oleh state (sitting/meeting/walker) — tak ada sisa offset
  }
  nxLabel.position.y=LABEL_Y-.5+Math.sin(elapsed*1.1+9)*.03;
  // Papers
  __pages.update(delta,elapsed);
  drawClock(timeOfDay);

  // Sounds — tick keyboard agent yang duduk + langkah kaki agent yang jalan
  keyTimer-=delta;
  if(keyTimer<=0){
    keyTimer=.09+Math.random()*.18;
    if(soundsStarted&&agentData.some(a=>a.state==='sitting'&&a.sittingChar&&a.sittingChar.visible))playKeyClick();
  }
  stepTimer-=delta;
  if(stepTimer<=0){
    stepTimer=.32;
    if(soundsStarted&&agentData.some(a=>a.walker&&a.walker.visible))playStep();
  }

  // Sounds — meeting chime only
  if(__meet.active&&!lastMeetingState&&soundsStarted)playMeetingChime();
  lastMeetingState=__meet.active;

  renderer.render(scene,camera);
}
animate();
const onResize=()=>{camera.aspect=container.clientWidth/container.clientHeight;camera.updateProjectionMatrix();__vo();renderer.setSize(container.clientWidth,container.clientHeight)};window.addEventListener('resize',onResize);

  // Return controls for React UI
  // ── Kontrol aksi tim (dipakai menu React) ──
  function teamAction(action){
    if(action==='meeting'){
      updateTime(615); // stand-up window
    } else if(action==='break'){
      agentData.forEach(ad=>{
        if(ad.state!=='sitting')return;
        ad.state='walking_out';ad.sittingChar.visible=false;ad.walker.visible=true;
        ad.walker.position.set(ad.home.x,0,ad.home.z);
        ad.walkTarget={x:-9.5+rng.r(-1,1),z:7.5+rng.r(-.5,.5)}; // area kafe
        ad._route=null; // recalc otomatis: tanpa rute, stepRoute jatuh ke walkTarget
        ad.walkPause=12;
      });
    } else if(action==='work'){
      updateTime(660);
      agentData.forEach(ad=>{
        if(ad.state==='meeting'||ad.state==='walking_out'||ad.state==='walking_back'){
          ad.walker.visible=false;ad.sittingChar.visible=true;
          ad.state='sitting';ad.timer=rng.r(8,20);
          ad.label.position.set(ad.home.x,LABEL_Y,ad.home.z);
        }
      });
      if(__meet.active){__meet.update(-1)}
    } else if(action==='tour'){
      agentData.forEach(ad=>{ if(ad.state==='sitting'){ad.timer=0.1;} });
    }
  }
  return {
    teamAction,
    toggleNames: () => { namesVisible=!namesVisible; agentData.forEach(ad=>{ad.label.visible=namesVisible}) },
    resetFocus: () => { if(focusGoal){focusGoal={t:HOME_TGT.clone(),r:homeRadius||sph.radius,reset:true}} },
    setAutoRotate: (v) => { autoRot=v; },
    setTime: (minutes) => updateTime(minutes),
    toggleCyberpunk: () => toggleCyberpunk(),
    isCyberpunk: () => cyberpunkMode,
    zoomIn: () => { sph.radius=Math.max(12,sph.radius-4); updCam(); },
    zoomOut: () => { sph.radius=Math.min(130,sph.radius+4); updCam(); },
    destroy: () => {
      __intervals.forEach(clearInterval);
      __timeouts.forEach(clearTimeout);
      window.removeEventListener('resize', onResize);
      if(renderer){renderer.dispose();container.removeChild(renderer.domElement);}
    }
  };
}
