// Siklus 22 — 2026-10-24 — kualitas berkelanjutan; 0 edit perilaku
import * as THREE from 'three';window.THREE=THREE;
import { createFurniture } from './parts/furniture.js';
import { buildRobot } from './parts/robot.js';
import { createLighting, createNeonMode, createShift } from './parts/daycycle.js';
import { createZones } from './parts/flooring.js';
import { createMeeting } from './parts/meeting.js';
import { createMotion } from './parts/motion.js';
import { drawScreenFrame, createDriftingPages, addDeskTrinkets, shouldRedrawScreenAt, shouldRefreshShadow, shouldRelayoutLabels, shouldRedrawClock, shouldUpdateLeds, ledOpacity, shouldUpdateDust, dustY, DUST_UPDATE_EVERY, shouldUpdateAmbient, ambientFx, pulseFx, shouldUpdateBubbles, charMotion, applyCharMotion } from './parts/effects.js';
import { uiTexture, uiMaterial } from './parts/ui_colorspace.js';
import { overlapPass, sweepClampRounds, worldPerPx, labelWorldOffset, accumulateZoneAnti, zoneViewportGuard, buildAgentPts, buildZonePts, buildBubblePts, resetZoneBaseOffsets, PX_PER_TAN, VIEW_TOP_MARGIN, VIEW_BOT_MARGIN, ZONE_TOP_EXTRA, PAD_X_ZONE } from './parts/label_overlap.js';
import { perfStep } from './parts/perf_quality.js';
import { updateFollowGoal, focusStep, autoRotateStep, ensureHomeRadius, saveCam, resetFocusGoal } from './parts/kamera_focus.js';
import { createMeetingRoom, createWallClock, createCeilingFixtures } from './parts/room.js';
import { drawNameplate, PLATE } from './parts/nameplate_spec.js';
import { SEL_RING, HOVER_RING, selAnchorOf, selectedAgent, ringFloorY } from './parts/ring_spec.js';
import { paintRing } from './parts/ring_canvas.js';
import { drawSky, drawGlassSheen } from './parts/sky_canvas.js';
import { drawWoodFloor, drawAoStrip } from './parts/floor_canvas.js';
import { drawCeiling } from './parts/ceiling_canvas.js';
import { drawResepsiLogo, drawWallTitle } from './parts/logo_canvas.js';
import { createWalls } from './parts/walls.js';
import { drawBlobShadow } from './parts/blob_canvas.js';
import { LABEL_Y, LABEL_FULL, LABEL_SHORT, labelScale, drawLabelText } from './parts/label_spec.js';
import { WALK_DESTINATIONS, CAMPUS_WALK_DESTINATIONS } from './parts/walk_destinations.js';
import { OBSTACLES } from './parts/obstacles.js';
import {
  MUTED_KEY, VOLUME_KEY, DEFAULT_VOLUME, tickSoundTimer, loadAudioVolume, saveAudioVolume, clampVolume,
  DEFAULT_AMBIENCE_ENABLED, DEFAULT_AMBIENCE_VOLUME, loadAmbienceEnabled, saveAmbienceEnabled,
  loadAmbienceVolume, saveAmbienceVolume, clampAmbienceVolume,
} from './parts/sound_spec.js';
import { advanceSimClock, setSimManual, SIM_SEC_PER_MIN as __SIM_SPM, MANUAL_RESUME_MS as __SIM_RESUME } from './parts/sim_clock.js';
import { simMinutesToClockSeconds } from './parts/clock_units.js';
import { createSoundEngine } from './parts/sound_engine.js';
import { installAudioWake } from './parts/audio_wake.js';
import { createProjectBoard } from './parts/projectboard.js';
import { createBookshelf } from './parts/bookshelf.js';
import { createReception } from './parts/reception.js';
import { createCafe } from './parts/cafe.js';
import { createDecor } from './parts/decor.js';
import { computeAspect, isPortraitViewport, getResponsiveFov, getResponsiveRadius, getViewOffsetConfig, getCanvasPointerNdc, getMaxBubbles } from './parts/viewport_spec.js';
import { createServerRoom } from './parts/serverroom.js';
import { createLounge } from './parts/lounge.js';
import { createStructure } from './parts/structure.js';
import { createTerraces } from './parts/terraces.js';
import { chatPhrases, COLLAB_PAIRS, pickCollab, clampBubbleText, LINE_SEC, autoTalkDelay, autoTalkText } from './parts/dialog.js';
import { agentIdMap, buildRunningByAgent } from './parts/running_tasks.js';
import { BADGE_COLORS, statusPollActions } from './parts/status_poll.js';
import { updateBubbles as updateBubblesPure } from './parts/bubbles.js';
import { BUBBLE_W, BUBBLE_H, drawBubble, bubbleScale } from './parts/bubble_canvas.js';
import { drawTvDashboard } from './parts/tv_canvas.js';
import { looksOf } from './parts/character_looks.js';
import { AGENTS, AGENTS_EXTRA, allAgents as allAgentsFn } from './parts/agents_spec.js';
import { EXTENDED_SPECIALISTS } from './parts/extended_desks.js';
import { DESKS } from './parts/desk_layout.js';
import { teamPodFocusTarget, findTeamByKey } from './parts/team_spec.js';
import { meetingFocusTarget, getWhiteboardTooltipText, isWhiteboardHit } from './parts/whiteboard_spec.js';
import { isLongHair, STANDING, SITTING, accessoryAnchor } from './parts/character_spec.js';
import { collectPickTargets, findAgentRoot, isNexusHit, isBoardHit } from './parts/raycast_targets.js';
import { nearbyPairs as nearbyPairsPure, tickCooldown as tickCooldownPure, CHAT_RADIUS, CHAT_COOLDOWN_SEC } from './parts/chat_check.js';

export function createOfficeScene(container, callbacks = {}) {
  // scene baru dibuat → flag destroy scene LAMA dicabut; tanpa ini remount/hot-reload
  // membuat scene baru dengan audio mati permanen (__ensureAudio selalu return early).
  window.__officeSceneDestroyed = false;
  const { onTimeUpdate, onStatusUpdate, onMeetingChange, onSelectAgent } = callbacks;

// ═══════════════════════════════════════════════════
// THE AGENCY v3
// ═══════════════════════════════════════════════════
class RNG{constructor(s=42){this.s=s}n(){this.s=(this.s*16807)%2147483647;return(this.s-1)/2147483646}r(a,b){return a+this.n()*(b-a)}i(a,b){return Math.floor(this.r(a,b+1))}pick(a){return a[this.i(0,a.length-1)]}}
const rng=new RNG(2026);

// Legend



// ─── SCENE ─────────────────────────────────────────
const scene=new THREE.Scene();window.__scene=scene;
scene.name = 'Office3D';
 scene.background=new THREE.Color(0x010A28);
 scene.fog=new THREE.FogExp2(0x010A28,0.0048);
 const __initAsp = computeAspect(container.clientWidth, container.clientHeight);
 const camera = new THREE.PerspectiveCamera(getResponsiveFov(__initAsp), __initAsp, 0.1, 500);
 let renderer=null;
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,failIfMajorPerformanceCaveat:false});
    if(!renderer.getContext()){renderer=null;throw new Error('WebGL context unavailable')}
  }catch(e){
    // WebGL tidak tersedia — hentikan seluruh init scene; App menangkap & menampilkan pesan UI-only.
    console.warn('WebGL unavailable:',e.message);
    throw e;
  }
  if(renderer){
    renderer.setSize(Math.max(1, container.clientWidth || 1), Math.max(1, container.clientHeight || 1));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2.0));
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.1;
    container.appendChild(renderer.domElement);
  }

// ─── ORBIT ─────────────────────────────────────────
let isDrag=false,prev={x:0,y:0};
let namesVisible=(function(){try{return localStorage.getItem('wfs_names')!=='0'}catch{return true}})();
const __asp = computeAspect(container.clientWidth, container.clientHeight);
const __portrait = isPortraitViewport(__asp);
camera.fov = getResponsiveFov(__asp);
camera.aspect = __asp;
camera.updateProjectionMatrix();
let sph = { theta: __portrait ? 2.35 : Math.PI * 0.78, phi: __portrait ? 0.78 : 0.92, radius: __asp < 0.6 ? 48 : __asp < 0.8 ? 48 : __asp < 1.2 ? 44 : 42.5 };
const tgt=new THREE.Vector3(0,1.0,0.6);
// Preferensi auto-rotate: hormati prefers-reduced-motion bila user belum set eksplisit (localStorage wfs_autorot 0/1)
const __prm=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):null;
let __userRot=null;try{const __v=localStorage.getItem('wfs_autorot');if(__v==='0')__userRot=false;else if(__v==='1')__userRot=true}catch{/* abaikan */}
const autoRotDefault=()=>__userRot!==null?__userRot:(__prm?!__prm.matches:true);
let autoRot=autoRotDefault(),autoTmr;
__prm&&__prm.addEventListener&&__prm.addEventListener('change',e=>{if(__userRot===null)autoRot=!e.matches});
let focusGoal=null;const HOME_TGT=new THREE.Vector3(0,1.4,0.3);let homeRadius=null;let nxChar=null,nxAgent=null;
function updCam(){const p=Math.max(.18,Math.min(Math.PI/2.3,sph.phi));sph.phi=p;camera.position.set(sph.radius*Math.sin(p)*Math.sin(sph.theta)+tgt.x,sph.radius*Math.cos(p)+tgt.y,sph.radius*Math.sin(p)*Math.cos(sph.theta)+tgt.z);camera.lookAt(tgt)}
const __vo=()=>{const w=Math.max(1,container.clientWidth||1),h=Math.max(1,container.clientHeight||1);const vo=getViewOffsetConfig(w,h);if(vo.enabled)camera.setViewOffset(vo.fullWidth,vo.fullHeight,vo.offsetX,vo.offsetY,vo.width,vo.height);else camera.clearViewOffset()};__vo();
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
    if(focusGoal&&!focusGoal.reset)focusGoal=null;
    updCam();pinchDist=d;
  }
},{passive:false});
renderer.domElement&&renderer.domElement.addEventListener('touchend',()=>{pinchDist=null},{passive:true});
// ═══════════════════════════════════════════════════
// SOUND SYSTEM — Web Audio API (runtime di parts/sound_engine.js, teruji unit)
// ═══════════════════════════════════════════════════
let audioMuted=(function(){try{return localStorage.getItem(MUTED_KEY)==='1'}catch{return false}})();
function saveMuted(){try{localStorage.setItem(MUTED_KEY,audioMuted?'1':'0')}catch{/* abaikan */}}
let audioVolume=(function(){try{return loadAudioVolume(typeof localStorage!=='undefined'?localStorage:null)}catch{return DEFAULT_VOLUME}})();
let ambienceEnabled=(function(){try{return loadAmbienceEnabled(typeof localStorage!=='undefined'?localStorage:null)}catch{return DEFAULT_AMBIENCE_ENABLED}})();
let ambienceVolume=(function(){try{return loadAmbienceVolume(typeof localStorage!=='undefined'?localStorage:null)}catch{return DEFAULT_AMBIENCE_VOLUME}})();
const __sound=createSoundEngine({
  ctxFactory:()=>new(window.AudioContext||window.webkitAudioContext)(),
  initialVolume:audioVolume,
  initialAmbienceEnabled:ambienceEnabled,
  initialAmbienceVolume:ambienceVolume,
});
__sound.setMuted(audioMuted);
__sound.dbg(s=>{window.__audio=s;});
window.__officeSound=__sound;
const __ensureAudio=()=>{if(window.__officeSceneDestroyed)return;__sound.ensure();};
const __ensureAudioEarly=()=>{if(window.__officeSceneDestroyed)return;__sound.ensure();try{const c=__sound.rawCtx();if(c&&c.state==='suspended'&&c.resume)c.resume();}catch{/* abaikan */}};
// Listener wake {once:true} HARUS bisa dilepas di destroy(): tanpa itu, scene lama
// (HMR/remount) meninggalkan listener yang saat interaksi pertama pengguna
// membangunkan engine audio LAMA yang sudah dispose → AudioContext bocor
// (installAudioWake: parts/audio_wake.js, diuji unit).
const __disposeAudioWake=installAudioWake(__ensureAudioEarly);
renderer.domElement&&renderer.domElement.addEventListener('pointerdown',e=>{isDrag=true;prev={x:e.clientX,y:e.clientY};autoRot=false;clearTimeout(autoTmr);__ensureAudioEarly();if(renderer.domElement.style.cursor!=='pointer')renderer.domElement.style.cursor='grabbing'});
renderer.domElement&&renderer.domElement.addEventListener('pointerdown',e=>{downXY={x:e.clientX,y:e.clientY}});
renderer.domElement&&renderer.domElement.addEventListener('pointerup',e=>{
  if(!downXY)return;
  const moved=Math.hypot(e.clientX-downXY.x,e.clientY-downXY.y);
  downXY=null;
  if(moved>6)return; // drag, bukan click
  const pt=getCanvasPointerNdc(e,renderer&&renderer.domElement);
  const ndc=new THREE.Vector2(pt.x,pt.y);
  const ray=new THREE.Raycaster();
  ray.setFromCamera(ndc,camera);
  const boardMesh=window.__projectBoard&&window.__projectBoard.mesh;
  const wbMesh=window.__whiteboard&&window.__whiteboard.mesh;
  const wbFrame=window.__whiteboard&&window.__whiteboard.frame;
  const hits=ray.intersectObjects(collectPickTargets({
    agentData, board:window.__projectBoard, whiteboard:window.__whiteboard, nexus:nxChar
  }),true);
  if(!hits.length){ if(focusGoal)focusGoal=resetFocusGoal(HOME_TGT,homeRadius,sph.radius); selectedIdx=-1;applySelected(); if(onSelectAgent)onSelectAgent(null); return; }
  if(isBoardHit(hits[0].object,window.__projectBoard)) {
    __sound.playSelect();
    const hr=ensureHomeRadius(homeRadius,sph.radius); homeRadius=hr.homeRadius;
    saveCam(sph);
    const bpos=boardMesh?boardMesh.position:new THREE.Vector3(-8.35,3.8,13.3);
    focusGoal={t:new THREE.Vector3(bpos.x,bpos.y,13.2),r:8.5};
    createBubble(bpos.x,bpos.y+2.15,7.8,'“WFS PROJECT Software House — membuka detail proyek…”','#10E5A0');
    try { window.dispatchEvent(new CustomEvent('wfs-open-project-panel')); } catch { /* panel listener opsional, abaikan error */ }
    selectedIdx=-1;applySelected(); if(onSelectAgent)onSelectAgent(null);
    return;
  }
  if(isWhiteboardHit(hits[0].object, wbMesh, wbFrame)) {
    __sound.playSelect();
    focusMeetingRoom();
    const tip=getWhiteboardTooltipText(typeof window !== 'undefined' ? window.__tvData?.tasks : undefined, typeof __meet !== 'undefined' && __meet.active);
    createBubble(MRX, 2.2 + 0.75, MRZ - 2.52, '“' + tip + '”', '#F59E0B');
    try { window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: { view: 'kanban', source: 'whiteboard' } })); } catch { /* ignore */ }
    selectedIdx=-1;applySelected(); if(onSelectAgent)onSelectAgent(null);
    return;
  }
  if(isNexusHit(hits[0].object,nxChar)) {
    __sound.playSelect();
    const hr=ensureHomeRadius(homeRadius,sph.radius); homeRadius=hr.homeRadius;
    saveCam(sph);
    const np=new THREE.Vector3(7.6,1.20+0.8,6.1);
    focusGoal={t:np,r:16};
    createBubble(7.6,1.20+1.3,6.1,'“Halo! Selamat datang di WFS PROJECT Autonomous Software House!”','#F59E0B');
    selectedIdx=-2;
    applySelected();
    if(onSelectAgent){
      const ag=nxAgent?{...nxAgent,name:'Wahyu FS',floor:3}:{name:'Wahyu FS',color:0xF59E0B,hex:'#F59E0B',role:'Founder / CEO',hair:0x1a1a1a,shirt:0xB45309,pants:0x292524,floor:3};
      onSelectAgent(ag);
    }
    return;
  }
  let root=findAgentRoot(hits[0].object,agentData);
  if(root){
    __sound.playSelect();
    if(window.__wfsSelectAgent){
      const idMap={}; window.__wfsAgentIdList&&window.__wfsAgentIdList.forEach(x=>idMap[x.name]=x.id);
      window.__wfsSelectAgent(idMap[root.agent.name]||root.agent.name);
    }
    const wp=root.walker.visible?root.walker.position:{x:root.home.x,y:root.home.y||0,z:root.home.z};
    const hr=ensureHomeRadius(homeRadius,sph.radius); homeRadius=hr.homeRadius;
    focusGoal={t:new THREE.Vector3(wp.x,(wp.y||0)+1.5,wp.z),r:Math.min(sph.radius,24),follow:root};
    saveCam(sph);
    createBubble(wp.x,(wp.y||0)+1.3,wp.z,'“Halo! Aku '+root.agent.name+'”',root.agent.hex);
    selectedIdx=agentData.indexOf(root);applySelected();
    if(onSelectAgent)onSelectAgent(root.agent);
  }
});
let onDragUp=null, onDragMove=null;
onDragUp=()=>{isDrag=false;autoTmr=setTimeout(()=>{if(autoRotDefault())autoRot=true},6000);if(renderer.domElement&&renderer.domElement.style.cursor==='grabbing')renderer.domElement.style.cursor=''};
onDragMove=(e)=>{if(!isDrag)return;sph.theta-=(e.clientX-prev.x)*.005;sph.phi+=(e.clientY-prev.y)*.005;prev={x:e.clientX,y:e.clientY};updCam()};
addEventListener('pointerup',onDragUp);
addEventListener('pointermove',onDragMove);
// double-click: zoom ke titik (agent/papan = fokus, kosong = maju 30%)
renderer.domElement&&renderer.domElement.addEventListener('dblclick',e=>{
  const pt=getCanvasPointerNdc(e,renderer&&renderer.domElement);
  const ndc=new THREE.Vector2(pt.x,pt.y);
  const ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);
  const bm=window.__projectBoard&&window.__projectBoard.mesh;
  const wbm=window.__whiteboard&&window.__whiteboard.mesh;
  const wbf=window.__whiteboard&&window.__whiteboard.frame;
  const hits=ray.intersectObjects(collectPickTargets({
    agentData, board:window.__projectBoard, whiteboard:window.__whiteboard, nexus:nxChar
  }),true);
  if(hits.length&&isWhiteboardHit(hits[0].object,wbm,wbf)){
    __sound.playSelect();
    focusMeetingRoom();
    try { window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: { view: 'kanban', source: 'whiteboard' } })); } catch { /* ignore */ }
    return;
  }
  if(hits.length&&isBoardHit(hits[0].object,window.__projectBoard)){
    __sound.playSelect();
    const hr=ensureHomeRadius(homeRadius,sph.radius); homeRadius=hr.homeRadius;
    saveCam(sph);
    const bpos=bm?bm.position:new THREE.Vector3(-8.35,3.8,13.3);
    focusGoal={t:new THREE.Vector3(bpos.x,bpos.y,13.2),r:8.5};
    createBubble(bpos.x,bpos.y+2.15,7.8,'“WFS PROJECT Software House — membuka detail proyek…”','#10E5A0');
    try { window.dispatchEvent(new CustomEvent('wfs-open-project-panel')); } catch { /* ignore */ }
    selectedIdx=-1;applySelected(); if(onSelectAgent)onSelectAgent(null);
    return;
  }
  if(hits.length){focusGoal={t:hits[0].point.clone().setY(Math.max(1.5,(hits[0].point.y||0)+0.8)),r:Math.min(sph.radius,18)}}
  else{focusGoal={t:tgt.clone(),r:Math.max(14,sph.radius*0.7)}}
});

// hover pointer di atas agent/papan: isyarat "bisa diklik" (raycast throttled)
const hoverRay=new THREE.Raycaster();let hoverNdc={x:0,y:0},hoverPend=false,hoveredAgent=null;
// cincin highlight hover di bawah agent (visual feedback mengikuti cursor pointer)
let hoverRing=null;
// cincin emas agent TERPILIH (persist: tetap tampil sampai pilihan berubah)
let selectedIdx=-1,selRing=null;
function ensureSelRing(){if(selRing)return;const c=document.createElement('canvas');c.width=c.height=SEL_RING.SIZE;paintRing(c.getContext('2d'),SEL_RING,0.95);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  selRing=new THREE.Mesh(new THREE.PlaneGeometry(SEL_RING.PLANE,SEL_RING.PLANE),new THREE.MeshBasicMaterial({map:t,transparent:true,opacity:SEL_RING.OPACITY,depthWrite:false,color:SEL_RING.COLOR}));
  selRing.rotation.x=-Math.PI/2;selRing.position.y=SEL_RING.Y;selRing.renderOrder=4;selRing.visible=false;office.add(selRing);window.__sceneSelRing=selRing;}
function applySelected(){
  if(selRing)selRing.visible=false;
  if(selectedIdx===-2){
    ensureSelRing();
    selRing.position.set(7.6,1.20+SEL_RING.Y,6.1);
    selRing.visible=true;
    return;
  }
  const a=selectedAgent(agentData,selectedIdx);
  if(!a)return;
  // agent tidak ada di kantor (offsite/meeting figures terpisah) → ring disembunyikan,
  // selectedIdx tetap tersimpan sehingga ring muncul lagi saat agent kembali.
  const p=selAnchorOf(a);
  if(!p)return;
  ensureSelRing();
  selRing.position.set(p.x,ringFloorY(a)+SEL_RING.Y,p.z+p.off);
  selRing.visible=true;
}
// posisi ring utk agent: walker (berjalan) / home (duduk) / null (tidak terlihat di kantor)
const selAnchor=(a)=>selAnchorOf(a);

function ensureHoverRing(){if(hoverRing)return;const c=document.createElement('canvas');c.width=c.height=HOVER_RING.SIZE;paintRing(c.getContext('2d'),HOVER_RING,0.9);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  hoverRing=new THREE.Mesh(new THREE.PlaneGeometry(HOVER_RING.PLANE,HOVER_RING.PLANE),new THREE.MeshBasicMaterial({map:t,transparent:true,opacity:HOVER_RING.OPACITY,depthWrite:false,color:HOVER_RING.COLOR}));
  hoverRing.rotation.x=-Math.PI/2;hoverRing.position.y=HOVER_RING.Y;hoverRing.renderOrder=3;hoverRing.visible=false;office.add(hoverRing);window.__sceneRing=hoverRing;}
renderer.domElement&&renderer.domElement.addEventListener('pointermove',e=>{
  hoverNdc=getCanvasPointerNdc(e,renderer&&renderer.domElement);
  if(!hoverPend){hoverPend=true;setTimeout(()=>{
    hoverPend=false;
    if(!agentData.length)return;
    if(renderer.domElement.style.cursor==='grabbing')return; // jangan ganggu feedback drag
    hoverRay.setFromCamera(hoverNdc,camera);
    const hh=hoverRay.intersectObjects(collectPickTargets({
      agentData, board:window.__projectBoard, whiteboard:window.__whiteboard, nexus:nxChar
    }),true);
    renderer.domElement.style.cursor=hh.length?'pointer':'';
    // highlight visual agent saat hover
    let ha=null;
    let isNxHover=false;
    if(hh.length){
      const p=hh[0].object;
      isNxHover=isNexusHit(p,nxChar);
      ha=findAgentRoot(p,agentData);
    }
    if(ha!==hoveredAgent)hoveredAgent=ha;
    // anchor via selAnchorOf (satu sumber kebenaran dgn sel ring): dulu inline
    // (hardcode .55, tanpa cek sittingChar.visible — ring nyangkut di meja
    // kosong saat agent offsite). Komponen Y diikuti per-frame (blok animasi).
    const hp=selAnchorOf(hoveredAgent);
    if(hp){
      ensureHoverRing();
      hoverRing.position.set(hp.x,ringFloorY(hoveredAgent)+HOVER_RING.Y,hp.z+hp.off);
      hoverRing.visible=true;
    }else if(isNxHover){
      ensureHoverRing();
      hoverRing.position.set(7.6,1.20+HOVER_RING.Y,6.1);
      hoverRing.visible=true;
    }else if(hoverRing)hoverRing.visible=false;
  },80)};
},{passive:true});
renderer.domElement&&renderer.domElement.addEventListener('wheel',e=>{if(focusGoal&&!focusGoal.reset)focusGoal=null;sph.radius=Math.max(12,Math.min(130,sph.radius+e.deltaY*.04));updCam()},{passive:true});

// ─── LIGHTS ────────────────────────────────────────
const ambient=new THREE.AmbientLight(0xFFF5EB,0.65);scene.add(ambient);
const sun=new THREE.DirectionalLight(0xFFFAF0,1.45);
sun.position.set(14,24,12);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-22;sun.shadow.camera.right=22;sun.shadow.camera.top=22;sun.shadow.camera.bottom=-22;sun.shadow.bias=-.0004;sun.shadow.normalBias=.02;
scene.add(sun);
const skyFill=new THREE.DirectionalLight(0x38BDF8,0.45);skyFill.position.set(-16,18,-12);scene.add(skyFill);
scene.add(new THREE.HemisphereLight(0xF8FAFC,0x1E293B,0.55));

// ─── HELPERS ───────────────────────────────────────
const office=new THREE.Group();scene.add(office);
const M=(c,o={})=>new THREE.MeshLambertMaterial({color:c,...o});
const MB=c=>new THREE.MeshBasicMaterial({color:c});
const Glass=()=>new THREE.MeshPhysicalMaterial({color:0xBBCCDD,transparent:true,opacity:0.08,roughness:0});
// contact blob shadow — bidang radial gradient semi-transparan di lantai, anchor bayangan objek
const __blobTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');
  drawBlobShadow(x);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
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

// AO + lantai parket + karpet + wainscot + tekstur sky/glass + glass edge frames —
// builder murni di parts/structure.js (diuji unit); di sini tinggal injek konteks.
// (jendela sky-view dinding belakang & kiri dibangun di blok dinding __wallFade di bawah)
const __st=createStructure({ THREE, office, M, drawAoStrip, drawWoodFloor, drawSky, drawGlassSheen });
const fl=__st.fl, cp=__st.cp, skyTex=__st.skyTex, glassSheen=__st.glassSheen;
// Sembunyikan lantai dasar lama agar tidak tumpang-tindih (eliminasi 100% z-fighting & flicker)
if(fl)fl.visible=false;
if(cp)cp.visible=false;
// Struktur 3 Lantai Bertingkat (Stepped High-Rise Terraces & Stairs)
const __terraces=createTerraces({ THREE, office, M, MB });

// CEILING — DARK BLUE + tekstur panel prosedural (seam grid + vignette)
const __ceilObjsSafe=[];
const ceilCv=document.createElement('canvas');ceilCv.width=ceilCv.height=512;
// plafon panel prosedural — painter murni di parts/ceiling_canvas.js (diuji unit)
drawCeiling(ceilCv.getContext('2d'));
const ceilTex=new THREE.CanvasTexture(ceilCv);
ceilTex.wrapS=ceilTex.wrapT=THREE.RepeatWrapping;ceilTex.repeat.set(5,4);
const ceil=new THREE.Mesh(new THREE.BoxGeometry(34,.1,27),new THREE.MeshLambertMaterial({color:0xffffff,map:ceilTex,transparent:true,opacity:0.85}));
ceil.position.y=4.3;office.add(ceil);
// balok rangka penopang (beams) — memecah kepolosan bidang langit
[[0,-9],[0,-4.5],[0,0],[0,4.5],[0,9]].forEach(([,z])=>{
  const b=new THREE.Mesh(new THREE.BoxGeometry(33.6,.22,.4),M(0x14243D));
  b.position.set(0,4.2,z);office.add(b);__ceilObjsSafe.push(b);
});
[[-11.2],[-5.6],[0],[5.6],[11.2]].forEach(([x])=>{
  const b=new THREE.Mesh(new THREE.BoxGeometry(.4,.22,26.4),M(0x14243D));
  b.position.set(x,4.2,0);office.add(b);__ceilObjsSafe.push(b);
});

// Ceiling light panels (recessed) — brighter for dark bg contrast
const __ceilObjs=[];
// Panel plafon recessed & material jendela sky-view — diregistrasi agar mode neon
// bisa menggelapkan/mengembalikannya (dulu dibiarkan terang saat neon → jelek).
const __ceilPanels=[];const __skyWinMats=[];
for(let i=-3;i<=3;i++){for(let j=-2;j<=2;j++){
  const p=new THREE.Mesh(new THREE.BoxGeometry(3,.03,1),MB(0xF0F4FF));
  p.position.set(i*4.6,4.23,j*5.2);office.add(p);__ceilObjs.push(p);__ceilPanels.push(p);
  if(j===0){ // hanya 5 point light di jalur tengah — sisanya emissive saja
    const pl=new THREE.PointLight(0xFFFFFF,0.35,12,1.6);
    pl.position.set(i*4.5,3.8,j*5);office.add(pl);
  }
}}

// ═══ RUANG MEETING (modul parts/room.js) ═══
const __mr=createMeetingRoom({THREE,office,M,blobMat:__blobMat},Glass());
const MRX=__mr.MRX,MRZ=__mr.MRZ,meetSeats=__mr.meetSeats;
window.__whiteboard = {
  mesh: __mr.boardMesh,
  frame: __mr.boardFrame,
  redraw: __mr.boardRedraw,
  focus: () => focusMeetingRoom(),
  openSprintBoard: () => {
    try { window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: { view: 'kanban', source: 'whiteboard' } })); return true; } catch { return false; }
  },
};
window.__openTaskBoard = (opts) => {
  try {
    window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: opts || { view: 'kanban' } }));
    return true;
  } catch {
    return false;
  }
};
function focusMeetingRoom() {
  const hr=ensureHomeRadius(homeRadius,sph.radius); homeRadius=hr.homeRadius;
  saveCam(sph);
  if (selectedIdx !== -1) { selectedIdx = -1; applySelected(); if (onSelectAgent) onSelectAgent(null); }
  const ft = meetingFocusTarget(MRX, MRZ);
  focusGoal = { t: new THREE.Vector3(ft.x, ft.y, ft.z), r: ft.radius };
  return true;
}

// ═══════════════════════════════════════════════════
// DESK POSITIONS — agents face NEGATIVE Z (toward monitor)
// Chair is behind agent (positive Z from desk)
// Monitor is at desk front (negative Z from desk center)
// ═══════════════════════════════════════════════════
// Layout 14 meja kini di parts/desk_layout.js (kolom x ∈ {-8,-4,0,4,8}, baris z ∈ {-3,1.5,6})
const desks = DESKS;

// ═══════════════════════════════════════════════════
// CHARACTER BUILDER
// ═══════════════════════════════════════════════════

// Profil tampilan (LOOKS) & looksOf kini di parts/character_looks.js

// headY: pusat kepala; fz: arah depan (+1 berdiri/+Z, -1 duduk/-Z); torsoY: pusat torso
function addAccessories(g,agent,headY,fz,torsoY){
  const L=looksOf(agent), has=a=>L.acc.includes(a);
  const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);g.add(m);return m};
  const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  if(has('glasses')){
    [-1,1].forEach(sd=>add(B(.075,.06,.012),new THREE.MeshBasicMaterial({color:0x111111}),sd*.06,headY+.02,fz*.138));
    add(B(.04,.012,.012),new THREE.MeshBasicMaterial({color:0x111111}),0,headY+.025,fz*.138);
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
  const isHairLong = isLongHair(agent.name);
  // Warna cerah hidup & berkarakter: gunakan warna ikonik agent untuk pakaian agar kontras tinggi & terbaca
  const shirtCol = agent.color || agent.shirt;
  const pantsCol = (agent.pants === 0x08281F || agent.pants === 0x111827 || agent.pants === 0x212121) ? 0x1E293B : (agent.pants || 0x334155);

  if(standing){
    // ── STANDING CHARACTER (Human Stylized 3D Avatar) ──
    // Kaki silinder mulus manusiawi (tapered)
    [-1,1].forEach(sd=>{
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(.052,.044,.52,12),M(pantsCol));
      leg.position.set(sd*.075,.26,0);leg.userData.isLeg=true;leg.userData.phase=sd>0?0:Math.PI;leg.castShadow=true;g.add(leg);
      // Sepatu Sneakers: sol putih + bodi berwarna + toe cap
      const sole=new THREE.Mesh(new THREE.BoxGeometry(.11,.03,.20),M(0xFFFFFF));
      sole.position.set(sd*.075,.015,.02);g.add(sole);
      const shoe=new THREE.Mesh(new THREE.BoxGeometry(.10,.05,.18),M(agent.color));
      shoe.position.set(sd*.075,.055,.01);g.add(shoe);
      const toe=new THREE.Mesh(new THREE.SphereGeometry(.048,10,8),M(0xFFFFFF));
      toe.position.set(sd*.075,.045,.09);g.add(toe);
    });
    // Pinggul & Torso ramping alami
    const hips=new THREE.Mesh(new THREE.CylinderGeometry(.13,.12,.12,12),M(pantsCol));
    hips.position.set(0,.56,0);g.add(hips);
    const torso=new THREE.Mesh(new THREE.CylinderGeometry(.15,.13,.34,14),M(shirtCol));
    torso.position.set(0,.79,0);torso.castShadow=true;g.add(torso);
    // Kerah baju melingkar halus
    const col=new THREE.Mesh(new THREE.CylinderGeometry(.09,.08,.04,12),M(0xFFFFFF));
    col.position.set(0,.965,0);g.add(col);
    const btn=new THREE.Mesh(new THREE.BoxGeometry(.025,.09,.01),MB(new THREE.Color(shirtCol).multiplyScalar(.75)));
    btn.position.set(0,.8,.095);g.add(btn);
    // Lengan silinder halus & tangan bulat manusiawi
    [-1,1].forEach(sd=>{
      const ua=new THREE.Mesh(new THREE.CylinderGeometry(.045,.04,.18,10),M(shirtCol));
      ua.position.set(sd*.215,.8,0);ua.userData.isArm=true;ua.userData.phase=sd>0?0:Math.PI;g.add(ua);
      const fa=new THREE.Mesh(new THREE.CylinderGeometry(.038,.035,.17,10),M(skin));
      fa.position.set(sd*.215,.62,0);g.add(fa);
      const hand=new THREE.Mesh(new THREE.SphereGeometry(.038,10,8),M(skin));
      hand.position.set(sd*.215,.51,0);g.add(hand);
    });
    // Leher silinder
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.045,.05,.08,12),M(skin));
    neck.position.set(0,.99,0);g.add(neck);
    // Kepala manusia oval mulus (Stylized Human Head)
    const head=new THREE.Mesh(new THREE.SphereGeometry(.125,20,16),M(skin));
    head.scale.set(0.96,1.12,1.0);
    head.position.set(0,1.14,0);head.castShadow=true;g.add(head);
    // Telinga halus
    [-1,1].forEach(sd=>{
      const ear=new THREE.Mesh(new THREE.SphereGeometry(.032,10,8),M(skin));
      ear.scale.set(0.5,1.0,0.8);
      ear.position.set(sd*.13,1.13,0);g.add(ear);
    });
    // Hidung mungil halus
    const nose=new THREE.Mesh(new THREE.SphereGeometry(.022,8,8),M(new THREE.Color(skin).multiplyScalar(.90).getHex()));
    nose.position.set(0,1.13,.125);g.add(nose);
    // Pipi bersemu merah alami (Blush)
    [-1,1].forEach(sd=>{
      const blush=new THREE.Mesh(new THREE.SphereGeometry(.025,8,8),M(0xFCA5A5));
      blush.scale.set(1.0,0.6,0.3);
      blush.position.set(sd*.08,1.10,.115);g.add(blush);
    });
    // Mata hidup: sklera putih + pupil espresso + specular glint
    [-1,1].forEach(sd=>{
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.025,10,8),MB(0xFFFFFF));
      eye.scale.set(1.0,1.1,0.4);
      eye.position.set(sd*.058,1.16,.118);g.add(eye);
      const pup=new THREE.Mesh(new THREE.SphereGeometry(.016,8,8),MB(0x1E293B));
      pup.scale.set(1.0,1.1,0.4);
      pup.position.set(sd*.058,1.158,.125);g.add(pup);
      const glint=new THREE.Mesh(new THREE.SphereGeometry(.006,6,6),MB(0xFFFFFF));
      glint.position.set(sd*.058+.006,1.166,.132);g.add(glint);
      const brow=new THREE.Mesh(new THREE.BoxGeometry(.045,.015,.012),M(agent.hair));
      brow.rotation.z=sd*-.12;
      brow.position.set(sd*.058,1.21,.115);g.add(brow);
    });
    // Mulut senyum ramah
    const mouth=new THREE.Mesh(new THREE.BoxGeometry(.055,.014,.012),MB(0xB45309));
    mouth.position.set(0,1.06,.12);g.add(mouth);
    // Rambut bersiluet alami melengkung
    const hairVol=new THREE.Mesh(new THREE.SphereGeometry(.135,18,14),M(agent.hair));
    hairVol.scale.set(0.98,1.12,1.02);
    hairVol.position.set(0,1.16,-.01);g.add(hairVol);
    const fringe=new THREE.Mesh(new THREE.SphereGeometry(.065,12,10),M(agent.hair));
    fringe.scale.set(1.8,0.7,0.8);
    fringe.position.set(0,1.24,.075);g.add(fringe);
    if(isHairLong){
      [-1,1].forEach(sd=>{
        const strand=new THREE.Mesh(new THREE.CylinderGeometry(.032,.022,.35,10),M(agent.hair));
        strand.position.set(sd*.115,1.02,-.04);strand.rotation.z=sd*-.08;g.add(strand);
      });
    }
    // Badge & Lanyard
    const badge=new THREE.Mesh(new THREE.BoxGeometry(.06,.06,.015),MB(agent.color));
    badge.position.set(STANDING.badge.x,STANDING.badge.y,STANDING.badge.z);g.add(badge);
    g.userData.badge = badge;
    const lany=new THREE.Mesh(new THREE.BoxGeometry(.03,.16,.01),MB(0x35507A));
    lany.position.set(STANDING.lanyard.x,STANDING.lanyard.y,STANDING.lanyard.z);g.add(lany);
  } else {
    // ── SITTING CHARACTER (Menghadap -Z ke monitor) ──
    // Paha silinder halus mengarah ke meja (-Z)
    [-1,1].forEach(sd=>{
      const thigh=new THREE.Mesh(new THREE.CylinderGeometry(.055,.05,.26,12),M(pantsCol));
      thigh.rotation.x=Math.PI/2;
      thigh.position.set(sd*.085,.44,-.08);thigh.castShadow=true;g.add(thigh);
      const shin=new THREE.Mesh(new THREE.CylinderGeometry(.048,.044,.30,12),M(pantsCol));
      shin.position.set(sd*.085,.24,-.2);g.add(shin);
      // Sepatu di bawah meja
      const sole=new THREE.Mesh(new THREE.BoxGeometry(.11,.03,.18),M(0xFFFFFF));
      sole.position.set(sd*.085,.015,-.24);g.add(sole);
      const shoe=new THREE.Mesh(new THREE.BoxGeometry(.10,.05,.16),M(agent.color));
      shoe.position.set(sd*.085,.055,-.24);g.add(shoe);
    });
    const hips=new THREE.Mesh(new THREE.CylinderGeometry(.14,.13,.12,12),M(pantsCol));
    hips.position.set(0,.5,.02);g.add(hips);
    // Torso manusiawi tegak
    const torso=new THREE.Mesh(new THREE.CylinderGeometry(.15,.13,.36,14),M(shirtCol));
    torso.position.set(0,.74,.02);torso.castShadow=true;g.add(torso);
    torso.userData.isTorso=true; torso.userData.baseY=.74;
    const col=new THREE.Mesh(new THREE.CylinderGeometry(.09,.08,.04,12),M(0xFFFFFF));
    col.position.set(0,.93,.02);g.add(col);
    const btn=new THREE.Mesh(new THREE.BoxGeometry(.025,.1,.01),MB(new THREE.Color(shirtCol).multiplyScalar(.75)));
    btn.position.set(0,.76,.115);g.add(btn);
    // Lengan santai menjangkau keyboard
    [-1,1].forEach(sd=>{
      const ua=new THREE.Mesh(new THREE.CylinderGeometry(.045,.04,.20,10),M(shirtCol));
      ua.position.set(sd*.215,.68,-.03);ua.rotation.x=.35;g.add(ua);
      const fa=new THREE.Mesh(new THREE.CylinderGeometry(.038,.035,.18,10),M(skin));
      fa.position.set(sd*.215,.56,-.2);fa.rotation.x=Math.PI/2.4;g.add(fa);
      const hand=new THREE.Mesh(new THREE.SphereGeometry(.038,10,8),M(skin));
      hand.position.set(sd*.16,.55,-.31);g.add(hand);
      hand.userData.isTypeHand=true; hand.userData.side=sd; hand.userData.baseY=.55;
    });
    // Leher silinder
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.045,.05,.08,12),M(skin));
    neck.position.set(0,.955,.02);g.add(neck);
    // Kepala manusia oval mulus
    const head=new THREE.Mesh(new THREE.SphereGeometry(.125,20,16),M(skin));
    head.scale.set(0.96,1.12,1.0);
    head.position.set(0,1.1,.02);head.castShadow=true;g.add(head);
    head.userData.isHead=true; head.userData.baseY=1.1;
    // Telinga halus
    [-1,1].forEach(sd=>{
      const ear=new THREE.Mesh(new THREE.SphereGeometry(.032,10,8),M(skin));
      ear.scale.set(0.5,1.0,0.8);
      ear.position.set(sd*.13,1.09,.02);g.add(ear);
    });
    // Hidung mungil halus (arah -Z)
    const nose=new THREE.Mesh(new THREE.SphereGeometry(.022,8,8),M(new THREE.Color(skin).multiplyScalar(.90).getHex()));
    nose.position.set(0,1.09,-.105);g.add(nose);
    // Pipi bersemu merah (arah -Z)
    [-1,1].forEach(sd=>{
      const blush=new THREE.Mesh(new THREE.SphereGeometry(.025,8,8),M(0xFCA5A5));
      blush.scale.set(1.0,0.6,0.3);
      blush.position.set(sd*.08,1.06,-.095);g.add(blush);
    });
    // Mata menghadap monitor (-Z)
    [-1,1].forEach(sd=>{
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.025,10,8),MB(0xFFFFFF));
      eye.scale.set(1.0,1.1,0.4);
      eye.position.set(sd*.058,1.12,-.108);g.add(eye);
      const pup=new THREE.Mesh(new THREE.SphereGeometry(.016,8,8),MB(0x1E293B));
      pup.scale.set(1.0,1.1,0.4);
      pup.position.set(sd*.058,1.118,-.115);g.add(pup);
      const glint=new THREE.Mesh(new THREE.SphereGeometry(.006,6,6),MB(0xFFFFFF));
      glint.position.set(sd*.058+.006,1.126,-.122);g.add(glint);
      const brow=new THREE.Mesh(new THREE.BoxGeometry(.045,.015,.012),M(agent.hair));
      brow.rotation.z=sd*-.12;
      brow.position.set(sd*.058,1.17,-.105);g.add(brow);
    });
    // Mulut senyum (arah -Z)
    const mouth=new THREE.Mesh(new THREE.BoxGeometry(.055,.014,.012),MB(0xB45309));
    mouth.position.set(0,1.02,-.11);g.add(mouth);
    // Rambut bersiluet alami (arah belakang = +Z)
    const hairVol=new THREE.Mesh(new THREE.SphereGeometry(.135,18,14),M(agent.hair));
    hairVol.scale.set(0.98,1.12,1.02);
    hairVol.position.set(0,1.12,.03);g.add(hairVol);
    const fringe=new THREE.Mesh(new THREE.SphereGeometry(.065,12,10),M(agent.hair));
    fringe.scale.set(1.8,0.7,0.8);
    fringe.position.set(0,1.20,-.065);g.add(fringe);
    if(isHairLong){
      [-1,1].forEach(sd=>{
        const strand=new THREE.Mesh(new THREE.CylinderGeometry(.032,.022,.35,10),M(agent.hair));
        strand.position.set(sd*.115,.98,.06);strand.rotation.z=sd*-.08;g.add(strand);
      });
    }
    const badge=new THREE.Mesh(new THREE.BoxGeometry(.06,.06,.015),MB(agent.color));
    badge.position.set(SITTING.badge.x,SITTING.badge.y,SITTING.badge.z);g.add(badge);
    g.userData.badge = badge;
    const lany=new THREE.Mesh(new THREE.BoxGeometry(.03,.16,.01),MB(0x35507A));
    lany.position.set(SITTING.lanyard.x,SITTING.lanyard.y,SITTING.lanyard.z);g.add(lany);
  }
  { const a = accessoryAnchor(standing); addAccessories(g,agent,a.headY,a.fz,a.torsoY); }
  // Selection halo indicator di bawah kaki/kursi agent (cincin halus agar figur terbaca jelas)
  const baseHalo=new THREE.Mesh(new THREE.RingGeometry(.18,.22,16),new THREE.MeshBasicMaterial({color:agent.color,side:THREE.DoubleSide,transparent:true,opacity:.35}));
  baseHalo.rotation.x=-Math.PI/2; baseHalo.position.set(0,.01,0); g.add(baseHalo);
  return g;
}


// ═══════════════════════════════════════════════════
// DESK WORKSTATIONS & AGENTS (reconstructed)
// ═══════════════════════════════════════════════════
const agentData=[];
const screenData=[];

const LABEL_Y=2.45; // tepat di atas kepala (tinggi duduk ≈1.95)
const _LF=LABEL_FULL, _LS=LABEL_SHORT;
function makeLabel(agent){
  const mk=(full)=>{
    const spec=full?_LF:_LS;
    const W=spec.W, H=spec.H + 14;
    const lc=document.createElement('canvas'); lc.width=W; lc.height=H;
    const c=lc.getContext('2d');
    
    // 1. Gambar teks label base
    drawLabelText(c,agent,spec,full);
    
    // 2. Glowing glassmorphism border dengan warna identitas agen
    const rad = spec.RADIUS || 14;
    c.save();
    c.strokeStyle = agent.hex || '#38BDF8';
    c.lineWidth = 3.5;
    c.shadowColor = agent.hex || '#38BDF8';
    c.shadowBlur = 10;
    if (c.roundRect) {
      c.beginPath();
      c.roundRect(2, 2, W - 4, spec.H - 4, rad);
      c.stroke();
    } else {
      c.strokeRect(2, 2, W - 4, spec.H - 4);
    }
    
    // 3. Ekor segitiga speech bubble mengarah ke kepala karakter
    c.fillStyle = 'rgba(10,14,24,0.96)';
    c.beginPath();
    c.moveTo(W / 2 - 10, spec.H - 4);
    c.lineTo(W / 2, spec.H + 11);
    c.lineTo(W / 2 + 10, spec.H - 4);
    c.closePath();
    c.fill();
    c.strokeStyle = agent.hex || '#38BDF8';
    c.lineWidth = 3.0;
    c.beginPath();
    c.moveTo(W / 2 - 10, spec.H - 4);
    c.lineTo(W / 2, spec.H + 11);
    c.lineTo(W / 2 + 10, spec.H - 4);
    c.stroke();
    
    // 4. Status dot online (hijau neon menyala)
    c.fillStyle = '#10E5A0';
    c.shadowColor = '#10E5A0';
    c.shadowBlur = 8;
    c.beginPath();
    c.arc(16, full ? 22 : spec.H / 2, 4.5, 0, Math.PI * 2);
    c.fill();
    c.restore();

    const tex=uiTexture(new THREE.CanvasTexture(lc)); tex.minFilter=THREE.LinearFilter;
    return {tex, as: W / H};
  };
  const full=mk(true), short=mk(false);
  const label=new THREE.Sprite(uiMaterial(new THREE.SpriteMaterial({
    map: short.tex,
    transparent: true,
    depthTest: false,
    sizeAttenuation: false
  })));
  label.scale.set(0.042 * short.as, 0.042, 1); // ±17px tinggi label di HP (dari 12.5px) — keterbacaan mobile
  label.userData={full,short,mode:'short'};
  label.renderOrder=35; // Selalu di depan agar tidak tertutup perabotan
  return label;
}
// Ukuran label tetap di layar (sizeAttenuation=false): tinggi ≈ fraksi tinggi viewport.
// Logika murni (frac & wantFull) di parts/label_spec.js::labelScale (diuji unit);
// di sini tinggal baca viewport/kamera + terapkan mode & scale ke sprite.
function sizeLabels(){
  const w=container.clientWidth||800, h=container.clientHeight||600;
  const near=camera.position.distanceTo(tgt);
  const {frac,wantFull}=labelScale(w,h,camera.fov,near);
  // Bubble frac proporsional (±26-30px tinggi) agar teks rapi & elegan tanpa bertumpukan
  const bubbleFrac = Math.max(0.018, Math.min(0.035, frac * 1.15));
  const apply=L=>{
    if(!L)return;
    const u=L.userData; const mode=wantFull?'full':'short';
    if(u.mode!==mode){u.mode=mode;L.material.map=u[mode].tex;L.material.needsUpdate=true}
    const as=u[mode].as;
    L.scale.set(bubbleFrac * as, bubbleFrac, 1);
  };
  agentData.forEach(a=>apply(a.label));
  try{ if(typeof nxLabel!=='undefined'&&nxLabel)apply(nxLabel); }catch{ /* abaikan: label tambahan opsional */ }
  window.__labelFrac=+bubbleFrac.toFixed(4);
}

function buildDesk(agent,dp){
  const g=new THREE.Group();
  // Meja kayu oak skandinavia cerah modern
  const top=new THREE.Mesh(new THREE.BoxGeometry(1.5,.07,.8),M(0xF5EBE1));
  top.position.set(0,.74,0);top.castShadow=true;top.receiveShadow=true;g.add(top);
  const edge=new THREE.Mesh(new THREE.BoxGeometry(1.52,.02,.82),new THREE.MeshBasicMaterial({color:agent.color}));
  edge.position.set(0,.705,0);g.add(edge);
  [[-.68,-.33],[.68,-.33],[-.68,.33],[.68,.33]].forEach(([lx,lz])=>{
    const leg=new THREE.Mesh(new THREE.BoxGeometry(.05,.72,.05),M(0x1E293B));
    leg.position.set(lx,.36,lz);g.add(leg);
  });
  // Monitor — digeser ke samping kanan (+X=0.32) agar wajah & badan agent di X=0 terlihat jelas tanpa terhalang
  const mBase=new THREE.Mesh(new THREE.BoxGeometry(.22,.02,.14),M(0xAABBCC));
  mBase.position.set(.32,.78,-.22);g.add(mBase);
  const mStand=new THREE.Mesh(new THREE.BoxGeometry(.04,.2,.04),M(0xAABBCC));
  mStand.position.set(.32,.88,-.24);g.add(mStand);
  const mBody=new THREE.Mesh(new THREE.BoxGeometry(.72,.42,.035),M(0x1E1E24));
  mBody.position.set(.32,1.08,-.24);mBody.castShadow=true;g.add(mBody);
  // Layar (canvas screen)
  const sc=document.createElement('canvas');sc.width=128;sc.height=76;
  const sctx=sc.getContext('2d');
  const stx=uiTexture(new THREE.CanvasTexture(sc));stx.minFilter=THREE.LinearFilter;
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(.66,.36), uiMaterial(new THREE.MeshBasicMaterial({map:stx})));
  screen.position.set(.32,1.08,-.22);g.add(screen);
  screenData.push({ctx:sctx,canvas:sc,tex:stx,type:agent.screen||'terminal',hex:agent.hex});
  // Screen light — warna agent
  const sLight=new THREE.PointLight(agent.color,.35,2.5,2);
  sLight.position.set(.32,1.08,-.05);g.add(sLight);
  // Keyboard & mouse di depan agent
  const kb=new THREE.Mesh(new THREE.BoxGeometry(.4,.02,.14),M(0x2A2A30));
  kb.position.set(-.06,.79,-.05);g.add(kb);
  const mouse=new THREE.Mesh(new THREE.BoxGeometry(.05,.02,.08),M(0x2A2A30));
  mouse.position.set(.22,.79,-.05);g.add(mouse);
  // Kursi kantor ergonomis
  const seat=new THREE.Mesh(new THREE.BoxGeometry(.42,.06,.42),M(0x3B4A5A));
  seat.position.set(0,.44,.55);g.add(seat);
  const back=new THREE.Mesh(new THREE.BoxGeometry(.38,.38,.05),M(0x2E3B48));
  back.position.set(0,.65,.74);g.add(back);
  const pole=new THREE.Mesh(new THREE.BoxGeometry(.05,.38,.05),M(0x94A3B8));
  pole.position.set(0,.2,.55);g.add(pole);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.22,.26,.04,10),M(0x64748B));
  base.position.set(0,.02,.55);g.add(base);
  // Glow di bawah meja (dGlow — dipakai updateShift/cyberpunk)
  const dGlow=new THREE.PointLight(agent.color,.15,3,2);
  dGlow.position.set(0,.3,-.1);g.add(dGlow);
  // Nameplate pribadi: nama + role di sisi depan meja (spec di parts/nameplate_spec.js)
  (() => {
    const c = document.createElement('canvas');
    drawNameplate(c.getContext('2d'), agent.name, agent.role, agent.hex);
    const tex = uiTexture(new THREE.CanvasTexture(c)); tex.minFilter = THREE.LinearFilter;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(PLATE.w, PLATE.h), uiMaterial(new THREE.MeshBasicMaterial({ map: tex, transparent: true })));
    plate.position.set(0, PLATE.y, PLATE.z); g.add(plate);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(PLATE.w, .02, .05), M(0x2E3642));
    stand.position.set(0, PLATE.standY, PLATE.standZ); g.add(stand);
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
  // Contact blob shadow di bawah meja kerja (menancapkan meja & laci kabinet ke lantai)
  const deskShadow=new THREE.Mesh(new THREE.PlaneGeometry(1.6,1.1),__blobMat);
  deskShadow.rotation.x=-Math.PI/2;deskShadow.position.set(0,0.012,0.15);deskShadow.renderOrder=2;
  deskShadow.userData.blob=true;g.add(deskShadow);

  g.position.set(dp.x, dp.y || 0, dp.z);
  office.add(g);
  return {dGlow,screenLight:sLight};
}

// semua desk: 8 utama + 3 extra (posisi kanan) — desks array hanya 11? pakai AGENTS 8 + AGENTS_EXTRA 3
const allDesks=[...desks];
const allAgents=allAgentsFn();
// desks hanya 11 posisi — AGENTS_EXTRA pakai 3 posisi terakhir
allAgents.forEach((agent,i)=>{
  const dp=allDesks[i];
  if(!dp)return;
  // Posisi Lantai Bertingkat Alami (Lantai 1: Y=0, Lantai 2: Y=0.60, Lantai 3: Y=1.20)
  const deskY = dp.z < -0.8 ? 0 : (dp.z <= 4.5 ? 0.60 : 1.20);
  agent.floor = dp.z < -0.8 ? 1 : (dp.z <= 4.5 ? 2 : 3);
  const {dGlow,screenLight}=buildDesk(agent,{...dp,y:deskY});
  // Karakter duduk — skala 2.2x proporsional gagah dan terlihat jelas dari kamera
  const sittingChar=buildChar(agent,false);
  sittingChar.scale.set(2.2,2.2*looksOf(agent).h,2.2);
  sittingChar.position.set(dp.x,deskY+0.04,dp.z+.46);
  addBlobShadow(sittingChar,0.72);
  sittingChar.traverse(o=>{if(o.isMesh&&o.material&&!o.material.isMeshBasicMaterial){o.castShadow=true;}});
  office.add(sittingChar);
  // Walker
  const walker=buildChar(agent,true);
  walker.scale.set(2.2,2.2*looksOf(agent).h,2.2);
  walker.visible=false;
  addBlobShadow(walker,0.72);
  walker.traverse(o=>{if(o.isMesh&&o.material&&!o.material.isMeshBasicMaterial){o.castShadow=true;}});
  office.add(walker);
  // Label
  const label=makeLabel(agent);
  if(!namesVisible)label.visible=false;
  label.position.set(dp.x,deskY+LABEL_Y+0.35,dp.z+.46);
  label.userData.baseY=deskY+LABEL_Y+0.35; label.userData.baseX=dp.x; label.userData.antiY=0; label.userData.antiX=0;
  office.add(label);
  agentData.push({
    agent,state:'sitting',timer:rng.r(8,25),
    home:{x:dp.x,y:deskY+0.04,z:dp.z+.46},
    sittingChar,walker,label,dGlow,screenLight,
    walkTarget:null,walkPause:0
  });
  });

  // Workstations & Agents Spesialis Tambahan untuk perluasan multi-baris di tiap lantai
  EXTENDED_SPECIALISTS.forEach((agent) => {
  const dp = agent.desk;
  const deskY = dp.z < -0.8 ? 0 : (dp.z <= 4.5 ? 0.60 : 1.20);
  agent.floor = dp.z < -0.8 ? 1 : (dp.z <= 4.5 ? 2 : 3);
  const { dGlow, screenLight } = buildDesk(agent, { ...dp, y: deskY });

  const sittingChar = buildChar(agent, false);
  sittingChar.scale.set(2.2, 2.2 * looksOf(agent).h, 2.2);
  sittingChar.position.set(dp.x, deskY + 0.04, dp.z + 0.46);
  addBlobShadow(sittingChar, 0.72);
  sittingChar.traverse(o => { if (o.isMesh && o.material && !o.material.isMeshBasicMaterial) o.castShadow = true; });
  office.add(sittingChar);

  const walker = buildChar(agent, true);
  walker.scale.set(2.2, 2.2 * looksOf(agent).h, 2.2);
  walker.visible = false;
  addBlobShadow(walker, 0.72);
  walker.traverse(o => { if (o.isMesh && o.material && !o.material.isMeshBasicMaterial) o.castShadow = true; });
  office.add(walker);

  const label = makeLabel(agent);
  if (!namesVisible) label.visible = false;
  label.position.set(dp.x, deskY + LABEL_Y + 0.35, dp.z + 0.46);
  label.userData.baseY = deskY + LABEL_Y + 0.35; label.userData.baseX = dp.x; label.userData.antiY = 0; label.userData.antiX = 0;
  office.add(label);

  agentData.push({
    agent, state: 'sitting', timer: rng.r(8, 25),
    home: { x: dp.x, y: deskY + 0.04, z: dp.z + 0.46 },
    sittingChar, walker, label, dGlow, screenLight,
    walkTarget: null, walkPause: 0
  });
  });
setTimeout(()=>{
  try{
    createBubble(-8,2.8,-2.5,'“Halo! Semua tim AI WFS PROJECT aktif 24/7!”','#10E5A0');
  }catch{ /* abaikan: bubble intro opsional */ }
},1200);

  window.__agentData=agentData; window.__screens=screenData; window.__setTime=(m)=>updateTime(m); window.__dbg=()=>({t:timeOfDay,ph:__shift.phase,fr:frame,focus:focusGoal?{r:focusGoal.r,reset:!!focusGoal.reset}:null});window.__toggleNeon=()=>{toggleCyberpunk();return cyberpunkMode}; window.__meet=()=>({active:__meet.active,vis:__meet.figures.filter(f=>f.visible).length}); window.__lunch=()=>({on:__shift.lunch,atCafe:agentData.filter(a=>a.lunch).length}); window.__cam={sph,tgt,upd:()=>updCam()};window.__camCam=camera; // debug/e2e
  // Badge status real-time: poll gateway tiap 20s, warnai badge dada sesuai status task
  const __intervals=[];
  const __timeouts=[];
  (function(){
  const idMapFn=()=>agentIdMap(window.__wfsAgentIdList||[]);
  const findByGid=(gid)=>agentData.find(a=>idMapFn()[a.agent?.name]===gid);
  const prevFailed={};
  async function pollStatus(){
    if(pageHidden) return; // hemat fetch saat tab tidak dilihat
    window.__pollBadges=pollStatus; // diekspos utk refresh instan onVis
    try{
      const r=await fetch('/wfs-api/agents/status');
      const d=await r.json();
      const agents=d.agents||{};
      const im=idMapFn();
      window.__wfsAgentIdMap=im;
      // SATU fetch utk badge + bangun + alert + task running (dulu 2 interval fetch terpisah)
      try{
        const r2=await fetch('/wfs-api/tasks');
        const t2=await r2.json();
        const tasks=Array.isArray(t2)?t2:(t2.tasks||[]);
        // gabung data via parts/running_tasks.js (murni, diuji unit) — dipakai autoTalk
        window.__wfsRunningTasks={byAgent:buildRunningByAgent(agents,tasks)};
      }catch{ /* respons non-JSON */ }
      // SATU fetch utk badge + bangun + alert + task running (dulu 2 interval fetch terpisah)
      statusPollActions(agentData,agents,im,prevFailed,findByGid).forEach(act=>{
        if(act.type==='badge'){
          const badge=act.ad.sittingChar?.userData?.badge;
          if(badge&&act.color)badge.material.color.set(act.color);
        }else if(act.type==='wake'){
          if(act.ad.state==='sitting')act.ad.timer=0.5; // paksa bangun segera
        }else if(act.type==='alert'){
          const bay=(act.ad.walker.visible?act.ad.walker.position.y:act.ad.home.y)||0;
          const wp=act.ad.walker.visible?act.ad.walker.position:{x:act.ad.home.x,y:bay,z:act.ad.home.z};
          createBubble(wp.x,bay+1.3,wp.z,'Ada task failed! Cek log…','#f66');
        }
      });
    }catch{ /* abaikan */ }
  }
  __timeouts.push(setTimeout(pollStatus,4000));
  __intervals.push(setInterval(pollStatus,20000));
  })();


// Kolaborasi antar role & pickCollab diekstrak murni ke parts/dialog.js —
// pickCollab di sini dibungkus agar tetap pakai agentData lokal.
const pickCollabLocal=(ad)=>pickCollab(ad,agentData);



// ═══════════════════════════════════════════════════
// MEETING LOGIC
// ═══════════════════════════════════════════════════
const allOfficeAgents = [...allAgents, ...EXTENDED_SPECIALISTS];
const __meet=createMeeting({THREE,office,rng,agents:allOfficeAgents,agentData,buildChar,seats:meetSeats,roomZ:MRZ,onChange:onMeetingChange,looksOf,addBlobShadow});
const updateMeeting=m=>__meet.update(m);


// ═══ PERABOT (modul terpisah: parts/furniture.js) ═══
const __furn=createFurniture({THREE,office,M,MB,rng});
const addPlant=__furn.addPlant;

// ═══ RECEPTION DESK WITH WFS LOGO (front-right, near meeting room) ═══
// Builder murni di parts/reception.js (diuji unit); di sini tinggal injek konteks.
// Footprint OBSTACLES didaftarkan di dalam builder (import obstacles.js).
const __rc=createReception({ THREE, office, M, MB, drawResepsiLogo, makeLabel, buildChar, looksOf, blobMat: __blobMat });
if(__rc&&__rc.reception)__rc.reception.position.y=1.20;
const rcLight=__rc.rcLight; const nxLabel=__rc.nxLabel; nxChar=__rc.nexusChar; nxAgent=__rc.nexusAgent;
sizeLabels();

// ═══════════════════════════════════════════════════
// WFS EXTRAS — kafe, server room, rak buku, water cooler, zona lantai
// ═══════════════════════════════════════════════════
// --- ZONA LANTAI (patch warna + label) ---
createZones({THREE,office,namesVisible});

// --- CAFÉ / COFFEE BAR (depan kiri) ---
// Builder murni di parts/cafe.js (diuji unit); di sini tinggal injek konteks.
const __cafe=createCafe({ THREE, office, M, MB, blobMat: __blobMat });
if(__cafe&&__cafe.cafe)__cafe.cafe.position.y=1.20;

// --- WELCOME & LOUNGE (kanan depan): set sofa lengkap, bukan lantai kosong ---
// Sofa besar sudah ada di (10.5, 6) menghadap -X. Dilengkapi: karpet lounge,
// coffee table + majalah, 2 kursi santai, lampu berdiri, meja majalah/TV info.
// Builder murni di parts/lounge.js (diuji unit); di sini tinggal injek konteks.
const __loungeObj=createLounge({ THREE, office, M, MB, drawTvDashboard, blobMat: __blobMat });
if(__loungeObj&&__loungeObj.lounge)__loungeObj.lounge.position.y=1.20;
// --- SERVER ROOM + WATER COOLER ---
// Builder murni di parts/serverroom.js (diuji unit); di sini tinggal injek konteks.
// LEDs server room (fase & laju acak per LED) dikumpulkan utk animasi blink.
const __server=createServerRoom({ THREE, office, M, MB, blobMat: __blobMat });
const __leds=__server.leds;

// --- RAK BUKU (dinding kiri belakang) ---
// Builder murni di parts/bookshelf.js (diuji unit); di sini tinggal injek konteks.
const __shelfObj=createBookshelf({ THREE, office, M, rng, blobMat: __blobMat });


// Papan PROYEK NYATA WFS PROJECT — kartu dari task engine sungguhan (parts/projectboard.js)
window.__projectBoard = createProjectBoard(office, THREE);
if(window.__projectBoard&&window.__projectBoard.mesh){
  window.__projectBoard.mesh.position.y=2.6+1.20;
  if(window.__projectBoard.frame)window.__projectBoard.frame.position.y=2.6+1.20;
}
// --- DEKORASI TAMBAHAN: poster, tanaman besar, partisi kaca, rug, lampu lounge ---
// Builder murni di parts/decor.js (diuji unit); di sini tinggal injek konteks.
createDecor({ THREE, office, M });

// --- TANAMAN BESI tambahan di sudut ---
addPlant(11.6,-8.5,true);
addPlant(-11.6,8.8,true);

// --- JUDUL di dinding belakang (big wall text WFS PROJECT) ---
const wtc=document.createElement('canvas');wtc.width=1024;wtc.height=200;
const wtx=wtc.getContext('2d');
drawWallTitle(wtx);
const wtt=uiTexture(new THREE.CanvasTexture(wtc));
const wallTitle=new THREE.Mesh(new THREE.PlaneGeometry(4.6,0.9), uiMaterial(new THREE.MeshBasicMaterial({map:wtt,transparent:true})));
// Dipasang di dinding KIRI (x=-16.8, menghadap +X) — spot kosong antara pilar dinding kampus
// dan jendela z=-3.4 (lebar 4.6 → z -8.8..-4.2, aman dari keduanya). Sebelumnya mesh
// ini dibuat tapi TIDAK PERNAH di-add ke scene (kode mati).
wallTitle.position.set(-16.79,2.9,-6.5);wallTitle.rotation.y=Math.PI/2;wallTitle.renderOrder=5;
office.add(wallTitle);



// ═══ DINDING KANTOR SOLID + LOGO WFS PROJECT ═══
// Kamera default ada di sisi z negatif & x positif => dinding LATAR = z=+9.5 (belakang) dan x=-12.5 (kiri).
// Dinding dekat kamera (z=-9.5, x=+12.5) tetap kaca transparan agar interior terlihat.
// --- DINDING KANTOR SOLID + LOGO WFS PROJECT (builder murni di parts/walls.js, diuji unit) ---
createWalls({ THREE, office, skyTex, glassSheen, fl, ceil, skyWinMats:__skyWinMats });

// ═══ JAM DINDING (modul parts/room.js) ═══
const __clk=createWallClock({THREE,office,M},-4.6,2.9,13.27,Math.PI);
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
const drawScreen=(s,i)=>{ if(shouldRedrawScreenAt(frame,i)) drawScreenFrame(s,frame); };

// ═══════════════════════════════════════════════════
// TIME SYSTEM
// ═══════════════════════════════════════════════════
// slider handled by React
// clock handled by React
// status handled by React
let timeOfDay=(()=>{ // mulai dari jam NYATA saat load (biar jam dinding & HUD terasa hidup),
  // dibulatkan ke menit; disinkronkan dgn sim clock (1 hari kerja ≈ 12 mnt nyata)
  const d=new Date();return d.getHours()*60+d.getMinutes();})();
const __light=createLighting({THREE,scene,renderer,sun,ambient,agentData,onTimeUpdate,onStatusUpdate,onTick:m=>updateMeeting(m)});
let __sim={acc:0,last:null,manual:false,lastManualSet:0,time:timeOfDay};
function updateTime(min,manual=true){timeOfDay=min;__light.apply(min);__sim.time=min;if(manual){__sim=setSimManual(min,performance.now())}}
updateTime(timeOfDay);

// ═══════════════════════════════════════════════════
// DEPLOY TICKER — flip-flop agent deployment status
// Siklus 21 — kualitas berkelanjutan: stabilitas verifikasi sistem; 0 edit produksi.
// ═══════════════════════════════════════════════════


// ═══════════════════════════════════════════════════
// CYBERPUNK LIGHTS OFF MODE
// ═══════════════════════════════════════════════════
let cyberpunkMode=(function(){try{return localStorage.getItem('wfs_neon')==='1'}catch{return false}})();
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
  ceilPanels:__ceilPanels,skyWins:__skyWinMats,
  pendants:{
    bulbs:office.children.filter(c=>c.isMesh&&c.material&&c.material.isMeshBasicMaterial&&c.position.y>3.1&&c.position.y<3.15),
    lights:office.children.filter(c=>c.isPointLight&&c.position.y>3.0&&c.position.y<3.15)},
  panelLights:office.children.filter(c=>c.isPointLight&&c.position.y>3.5&&c.position.y<3.95),
  restoreTime:()=>updateTime(timeOfDay)});
function toggleCyberpunk() {
  cyberpunkMode = !cyberpunkMode;
  if (cyberpunkMode) {
    // ── MODE GELAP MEWAH (Cyberpunk Night Studio) ──
    tubeLights.forEach(l => { l.intensity = 0.85; l.color.set(0x00F0FF); });
    tubeMeshes.forEach(m => { m.material.color.set(0x18E0FF); m.material.opacity = 0.95; });
    ambient.intensity = 0.58;
    sun.intensity = 1.25;
    renderer.toneMappingExposure = 1.15;
    fl.material.color.set(0x1a2638);
    cp.material.color.set(0x142033);
    if (ceil && ceil.material) ceil.material.opacity = 0.75;
    agentData.forEach(a => { if (a.dGlow) { a.dGlow.intensity = 0.9; a.dGlow.distance = 4.5; } });
    screenLights.forEach(l => { l.intensity = 0.6; });
    if (rcLight) rcLight.intensity = 0.9;
    // SINKRONISASI SEMUA LANTAI KE MODE GELAP
    if (__terraces && __terraces.setMode) __terraces.setMode(true);
  } else {
    // ── MODE TERANG (Daylight Architectural Studio) ──
    tubeLights.forEach(l => { l.intensity = 0; });
    tubeMeshes.forEach(m => { m.material.color.set(0x334466); m.material.opacity = 0.3; });
    ambient.intensity = 0.52;
    sun.intensity = 1.35;
    renderer.toneMappingExposure = 1.15;
    fl.material.color.set(0xffffff);
    cp.material.color.set(0xd0d8e0);
    if (ceil && ceil.material) ceil.material.opacity = 0.45;
    agentData.forEach(a => { if (a.dGlow) { a.dGlow.intensity = 0.25; a.dGlow.distance = 3.0; } });
    screenLights.forEach(l => { l.intensity = 0; });
    if (rcLight) rcLight.intensity = 0.4;
    // SINKRONISASI SEMUA LANTAI KE MODE TERANG
    if (__terraces && __terraces.setMode) __terraces.setMode(false);
  }
  try { localStorage.setItem('wfs_neon', cyberpunkMode ? '1' : '0'); } catch { /* abaikan */ }
  return cyberpunkMode;
}
try { localStorage.removeItem('wfs_neon'); } catch { /* abaikan */ }
cyberpunkMode = false;
if (__terraces && __terraces.setMode) __terraces.setMode(false);

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
const helmetVisor=new THREE.Mesh(new THREE.BoxGeometry(.1,.04,.02),MB(0x4D9FFF));
helmetVisor.position.set(leadDesk.x+.55,.88,leadDesk.z+.15);office.add(helmetVisor);
// Tiny helmet glow
const helmetGlow=new THREE.PointLight(0x4D9FFF,0.15,1,2);
helmetGlow.position.set(leadDesk.x+.55,.9,leadDesk.z+.15);office.add(helmetGlow);

// Cincin lantai di sekitar meja utama
const ringGeo=new THREE.RingGeometry(1.2,1.25,32);
const ringMat=new THREE.MeshBasicMaterial({color:0x4D9FFF,transparent:true,opacity:0.15,side:THREE.DoubleSide});
const floorRing=new THREE.Mesh(ringGeo,ringMat);
floorRing.rotation.x=-Math.PI/2;
floorRing.position.set(leadDesk.x,.02,leadDesk.z+.2);
office.add(floorRing);
// Inner ring
const ringInner=new THREE.Mesh(new THREE.RingGeometry(1.05,1.08,32),new THREE.MeshBasicMaterial({color:0x4D9FFF,transparent:true,opacity:0.08,side:THREE.DoubleSide}));
ringInner.rotation.x=-Math.PI/2;ringInner.position.set(leadDesk.x,.02,leadDesk.z+.2);
office.add(ringInner);

// Pulse ring (animated in render loop)
const pulseRing=new THREE.Mesh(new THREE.RingGeometry(1.3,1.33,32),new THREE.MeshBasicMaterial({color:0x4D9FFF,transparent:true,opacity:0,side:THREE.DoubleSide}));
pulseRing.rotation.x=-Math.PI/2;pulseRing.position.set(leadDesk.x,.02,leadDesk.z+.2);
office.add(pulseRing);

// ═══════════════════════════════════════════════════
// WATER COOLER CONVERSATIONS — Speech Bubbles
// ═══════════════════════════════════════════════════
const chatBubbles=[];

function createBubble(x,y,z,text,color,anchor){
  // Hapus bubble lama milik agent yang sama atau posisi yang sangat berdekatan (< 1.2m)
  for(let i=chatBubbles.length-1;i>=0;i--){
    const b=chatBubbles[i];
    const sameAgent=anchor&&anchor.agent&&b.anchor&&b.anchor.agent===anchor.agent;
    const samePos=Math.hypot(b.sprite.position.x-x,b.sprite.position.z-z)<1.2;
    if(sameAgent||samePos){
      office.remove(b.sprite);
      b.sprite.material.dispose();
      chatBubbles.splice(i,1);
    }
  }
  // ROTASI BUBBLE (UX fix): batasi bubble aktif (maks 3, sempit maks 2) agar kampus 3D luas tetap bersih dan terbaca
  const MAX_BUBBLES = getMaxBubbles(container && container.clientWidth ? container.clientWidth : (typeof window !== 'undefined' ? window.innerWidth : 1280));
  while(chatBubbles.length >= MAX_BUBBLES){
    const old=chatBubbles.shift();
    office.remove(old.sprite);
    old.sprite.material.dispose();
  }
  const bc=document.createElement('canvas');
  bc.width=BUBBLE_W;bc.height=BUBBLE_H;
  const bx=bc.getContext('2d');
  drawBubble(bx,text,color,{clampText:clampBubbleText});
  const btex=uiTexture(new THREE.CanvasTexture(bc));btex.minFilter=THREE.LinearFilter;
  const sprite=new THREE.Sprite(uiMaterial(new THREE.SpriteMaterial({map:btex,transparent:true,depthTest:false,sizeAttenuation:false})));
  sprite.userData.aspect=BUBBLE_W/BUBBLE_H; sprite.renderOrder=30;
  const {w:sW,h:hFrac}=bubbleScale();
  sprite.scale.set(sW,hFrac,1);
  sprite.material.opacity=0;                              // fade-in
  sprite.position.set(x,y+1.35,z);
  office.add(sprite);
  chatBubbles.push({sprite,life:3.5,startY:y+1.35,anchor:anchor||null});
  window.__bubbles=chatBubbles;window.__bubbleCount=chatBubbles.length; window.__lastBubble=text;
  window.__lastBubbleAt=performance.now();
}


// Auto talk: agent cerita sendiri tiap beberapa detik (per role)

let lastTalkRT=performance.now();
function autoTalk(){
  const now=performance.now();
  if(now-lastTalkRT<autoTalkDelay())return;
  lastTalkRT=now;
  const activeAgents=agentData.filter(a=>a.state!=='offsite'&&(a.sittingChar.visible||a.walker.visible));
  if(activeAgents.length===0)return;
  const ad=activeAgents[Math.floor(Math.random()*activeAgents.length)];
  const text=autoTalkText(ad,window.__wfsRunningTasks,window.__wfsAgentIdMap);
  if(!ad||text==null)return;
  const baseAy=(ad.walker.visible?ad.walker.position.y:ad.home.y)||0;
  const wp=ad.walker.visible?ad.walker.position:{x:ad.home.x,y:baseAy,z:ad.home.z};
  // anchor mengikuti agent agar bubble tidak tertinggal di posisi lama saat agent berjalan
  const anc={agent:ad,get x(){return ad.walker.visible?ad.walker.position.x:ad.home.x},get z(){return ad.walker.visible?ad.walker.position.z:ad.home.z},y:baseAy+1.3};
  createBubble(wp.x,baseAy+1.3,wp.z,text,ad.agent.hex,anc);
}
// Sinkron task running: tidak ada interval sendiri — data status + tasks diambil di pollStatus (SATU fetch /agents/status)
let deltaFrame=0; // delta dtk frame terakhir (utk cooldown chat berbasis waktu nyata)
function checkConversations(){
  // Logika pasangan terdekat di parts/chat_check.js (murni + unit test).
  // Cooldown dihitung dgn delta detik NYATA (dulu 0.016 per frame — di GPU
  // lambat ~1.5 FPS agent terkunci dari chat bermenit-menit, bukan 8 detik).
  const pairs=nearbyPairsPure(agentData.map(a=>({
    a, visible:a.walker.visible, x:a.walker.position.x, z:a.walker.position.z, cooldown:a._chatCooldown||0
  })), CHAT_RADIUS);
  for(const [a,b] of pairs){
    const phrase=chatPhrases[Math.floor(Math.random()*chatPhrases.length)];
    const bay=(a.walker&&a.walker.visible?a.walker.position.y:a.home.y)||0;
    const anc={get x(){return a.walker.position.x},get z(){return a.walker.position.z},y:bay+1.3};
    createBubble(a.walker.position.x,bay+1.3,a.walker.position.z,phrase,a.agent.hex,anc);
    a._chatCooldown=CHAT_COOLDOWN_SEC;b._chatCooldown=CHAT_COOLDOWN_SEC;
  }
  for(let i=0;i<agentData.length;i++){
    const a=agentData[i];
    if(a._chatCooldown)a._chatCooldown=tickCooldownPure(a._chatCooldown,deltaFrame);
    else a._chatCooldown=0;
  }
}

let bubbleAcc = 0; // akumulasi dt antar tick bubble (throttle ~20×/dtk)
function updateBubbles(delta){
  bubbleAcc += delta;
  if (!shouldUpdateBubbles(frame)) return;
  updateBubblesPure(chatBubbles, bubbleAcc, { remove: (b)=>{ office.remove(b.sprite); b.sprite.material.dispose(); } });
  bubbleAcc = 0;
}

// ═══════════════════════════════════════════════════
// SHIFT CHANGE — Agents arrive/leave
// ═══════════════════════════════════════════════════
const __shift=createShift({THREE,agentData,rng,isNamesVisible:()=>namesVisible,alwaysActive:true,isCampus:true});
const updateShift=m=>__shift.update(m);

// Track keyboard sounds — kini benar-benar dipakai: tick keyboard & langkah saat agent jalan
let keyTimer=0, stepTimer=0;
// Tujuan jalan-jalan agent: pantry, dispenser, printer, lounge, ruang meeting, resepsionis + multi-lantai kampus
// — diekstrak ke walk_destinations.js (murni + unit test; lounge dikoreksi keluar footprint sofa).
const walkDestinations = CAMPUS_WALK_DESTINATIONS || WALK_DESTINATIONS;
const updateWalkers=createMotion({rng,agentData,walkDestinations,pickCollab:pickCollabLocal,createBubble});
let lastMeetingState=false;
const clock=new THREE.Clock();
// Hemat CPU/GPU: saat tab tersembunyi, hentikan loop render (visibilitas
// tak mengubah logika clock — THREE.Clock.getDelta melompat saat resume,
// delta sudah di-clamp .05 sehingga aman).
let rafId=null, pageHidden=document.visibilityState==='hidden';
let __perfWin={t0:0,lastFrame:0,fps:0,downgraded:false,shadowLevel:0,goodStreak:0,basePR:0};
function animate(){
  if(pageHidden)return; // loop berhenti total saat tab hidden (hemat CPU/GPU)
  rafId=requestAnimationFrame(animate);
  if(!renderer)return; // UI-only mode (tanpa WebGL)
  const delta=Math.min(clock.getDelta(),.05);
  deltaFrame=delta;
  const elapsed=clock.getElapsedTime();
  frame++;
  window.__animFrames=frame;
  if(focusGoal){
    if(focusGoal.follow&&!focusGoal.reset){ // follow agent berjalan: target kamera ikut posisi agent saat ini (murni, parts/kamera_focus.js)
      focusGoal=updateFollowGoal(focusGoal,homeRadius,sph.radius,HOME_TGT);
    }
    if(focusGoal.reset&&focusStep(tgt,sph,focusGoal.t,focusGoal.r,focusGoal.phi))focusGoal=null;
    else{focusStep(tgt,sph,focusGoal.t,focusGoal.r,focusGoal.phi)}
    updCam();
  }
  if(autoRot){autoRotateStep(sph);updCam()}
  screenData.forEach(drawScreen);
  updateWalkers(delta);

  // Water cooler convos
  checkConversations();updateBubbles(delta);autoTalk();
  // Shift
  updateShift(timeOfDay);
  // ── Auto-advance waktu simulasi: tanpa ini jam HUD statis selamanya dan seluruh
  // day-cycle (shift datang/pulang, lunch, jendela meeting, pencahayaan senja)
  // tidak pernah terpicu otomatis — slider & aksi tim hanya mem-set nilai statis.
  // Slider manual menempatkan simulasi ke mode MANUAL: berhenti sampai 8 dtk
  // pengguna tidak menyentuh slider, lalu autoplay lanjut dari posisi baru.
  // Memakai performance.now() (bukan delta yang di-clamp .05) supaya laju
  // simulasi konsisten di GPU lambat (SwiftShader ~1.5 FPS) maupun cepat.
  {
    // Auto-advance via advanceSimClock (murni, parts/sim_clock.js, diuji unit).
    const nowSim=performance.now();
    __sim=advanceSimClock(__sim,nowSim);
    // Mode neon mengambil alih pencahayaan: waktu simulasi tetap berjalan (shift,
    // lunch, meeting tetap hidup) tapi __light.apply TIDAK boleh menimpa palet
    // gelap — dulu ini menimpa neon tiap tick (mode gelap "perang" dgn siang).
    if(__sim.stepped){timeOfDay=__sim.time;if(!cyberpunkMode)__light.apply(timeOfDay);}
  }

  // cincin denyut agent utama — via pulseFx (murni, diuji unit)
  const pf=pulseFx(elapsed);
  pulseRing.scale.set(pf.scale,1,pf.scale);
  pulseRing.material.opacity=pf.opacity;
  // Efek ambient berbasis elapsed di-throttle ~20×/dtk (AMBIENT_EVERY=3):
  // ring, visor, label duduk, label NX, dan animasi hidup karakter duduk (napas, ketik, lirik layar)
  if(shouldUpdateAmbient(frame)){
    const fx=ambientFx(elapsed);
    ringMat.opacity=fx.ring;
    helmetVisor.material.opacity=fx.visor;
    agentData.forEach((a,i)=>{
      if(a.state==='sitting'){
        const baseLabelY=((a.home&&a.home.y)||0)+LABEL_Y;
        a.label.userData.baseY=baseLabelY; a.label.userData.baseX=a.home.x;
        a.label.position.y=baseLabelY+(a.label.userData.antiY||0)+ambientFx(elapsed,i).label;
        if(a.sittingChar&&a.sittingChar.visible){
          applyCharMotion(a.sittingChar, charMotion(elapsed, i, 'desk'));
        }
      }
    });
    if(nxChar){
      applyCharMotion(nxChar, charMotion(elapsed, 0, 'reception'));
    }
    nxLabel.position.y=3.3+fx.nx;
    if(__meet&&__meet.active&&typeof __meet.attendees==='function'){
      const att=__meet.attendees();
      att.forEach((ai,seatIdx)=>{
        const fig=__meet.figures&&__meet.figures[ai];
        if(fig&&fig.visible){
          applyCharMotion(fig, charMotion(elapsed, seatIdx, 'meeting'));
        }
      });
    }
  }

  // Dust drift — di-throttle ~20×/dtk (drift sangat lambat; dulu 40×sin/cos +
  // upload buffer GPU tiap frame). Y via dustY (murni, respawn > 3.6 → 0.5).
  if(shouldUpdateDust(frame)){
    for(let i=0;i<pN;i++){
      pP[i*3]+=Math.sin(elapsed+i)*.0006*DUST_UPDATE_EVERY; // ×3: kecepatan drift sama di throttle ⅓
      pP[i*3+1]=dustY(pP[i*3],pP[i*3+1],elapsed,i);
    }
    pG.attributes.position.needsUpdate=true;
  }
  // Labels (bobbing duduk di-throttle di blok ambient di atas)
  // cincin emas mengikuti agent terpilih (juga saat berjalan/meeting) dgn tracking halus & rotasi elegan
  if(selRing&&selectedIdx>=0&&selectedIdx<agentData.length){
    const a=agentData[selectedIdx];
    const p=selAnchor(a);
    if(!p){selRing.visible=false}
    else{
      const targetY = ringFloorY(a) + SEL_RING.Y;
      selRing.position.x += (p.x - selRing.position.x) * 0.25;
      selRing.position.z += (p.z + p.off - selRing.position.z) * 0.25;
      selRing.position.y += (targetY - selRing.position.y) * 0.25;
      selRing.rotation.z += 0.012;
      selRing.visible=true;
    }
  }else if(selRing&&selectedIdx===-2){
    const targetY = 1.20 + SEL_RING.Y;
    selRing.position.x += (7.6 - selRing.position.x) * 0.25;
    selRing.position.z += (6.1 - selRing.position.z) * 0.25;
    selRing.position.y += (targetY - selRing.position.y) * 0.25;
    selRing.rotation.z += 0.012;
    selRing.visible=true;
  }
  // cincin biru hover mengikuti agent yang di-hover tiap frame — dulu posisi
  // hanya diset saat pointermove (throttle 80 ms): ring BEKU di posisi lama
  // saat agent berjalan / naik-turun lantai, terlihat "tertinggal" di lantai.
  if(hoverRing&&hoverRing.visible&&hoveredAgent){
    const hp=selAnchorOf(hoveredAgent);
    if(!hp){hoverRing.visible=false}
    else{
      const hy=ringFloorY(hoveredAgent)+HOVER_RING.Y;
      hoverRing.position.x += (hp.x - hoverRing.position.x) * 0.45;
      hoverRing.position.z += (hp.z + hp.off - hoverRing.position.z) * 0.45;
      hoverRing.position.y += (hy - hoverRing.position.y) * 0.45;
    }
  }
  // Atap & lampu panel disembunyikan saat kamera di atas (agar isi kantor terlihat), dimunculkan dari sudut rendah
  if(window.__wallFade)window.__wallFade(camera.position);
  { const hide = sph.phi < 1.15 || camera.position.y > 5.2; ceil.visible=!hide; __ceilObjs.forEach(o=>{o.visible=!hide}); __ceilObjsSafe.forEach(o=>{o.visible=!hide}); }
  // Anti-tumpuk label: dorong ke atas bila label lain terlalu dekat di layar (iterasi ringan)
  // di-throttle: full pass mahal (5 iter × N label × project) — cukup tiap kelipatan 4 frame;
  // seluruh blok label (project camera per label + overlapPass + sweep/clamp) ikut dithrottle:
  // dulu berjalan TIAP frame meski sizeLabels() sudah di-throttle. Label bergerak lambat &
  // offset per-agent tersimpan di userData.antiY/antiX sehingga tetap benar di antara tick.
  // Pemeriksaan viewport zona TIAP FRAME (murah: 5 zona × project) — dulu masih
  // di dalam blok throttle relayout (komentar siklus 44 salah klaim), kini diekstrak
  // zoneViewportGuard dan dipanggil di luar throttle sehingga koreksi tidak tertunda
  // ±4 frame & jalan juga pada frame % 4 ≠ 0 (mis. frame pertama animate()).
  zoneViewportGuard(window.__zoneLabels, {
    camera, clientWidth: container.clientWidth, clientHeight: container.clientHeight,
    PX_PER_TAN, worldPerPx, accumulate: accumulateZoneAnti,
  });
  if(namesVisible&&shouldRelayoutLabels(frame)){
    sizeLabels();
    const vis=agentData.filter(a=>a.label.visible && a.state !== 'offsite');
    // k = px per unit tan(fov/2); proyeksi kamera per label dihitung di sini,
    // pembangunan pts (agent/zona/bubble) via parts/label_overlap.js (murni, diuji unit).
    const k=PX_PER_TAN(container.clientHeight,camera.fov);
    const pxW=container.clientWidth/2, pxH=container.clientHeight/2; // NDC → piksel layar dari pusat
    const pts=buildAgentPts(vis.map(a=>({...a,proj:a.label.position.clone().project(camera)})),k,pxW,pxH);
    pts.sort((p,q)=>p.y-q.y);
    // label ZONA statis ikut dihitung (sebagai penghalang): agent yang menumpuk zona digeser, zona tidak bergerak.
    // fade & jitter via buildZonePts; penerapan opacity/visible di sini (butuh sprite nyata).
    if(window.__zoneLabels){
      const kz=k;
      const zents=window.__zoneLabels.map(zt=>{
        const zb=(window.__zoneBase&&window.__zoneBase.get(zt))||{y:zt.position.y,x:zt.position.x};
        return {ref:zt,visible:zt.visible,proj:zt.position.clone().project(camera),
          dist:camera.position.distanceTo(zt.position),label:zt.userData.label,
          base:zb,antiY:zt.userData.antiY,antiX:zt.userData.antiX,scale:zt.scale};
      });
      buildZonePts(zents,kz,pxW,pxH).forEach(zp=>{
        // fade diterapkan ke sprite nyata via referensi zp.zt (urutan aman)
        if(zp.zt){zp.zt.material.opacity=zp.fade.opacity;zp.zt.visible=zp.fade.visible;}
        pts.push(zp);
      });
    }
    // bubble dialog ikut sebagai penghalang statis: label zona digeser menjauh dari bubble (bubble tidak bergerak)
    const bents=chatBubbles.map(bb=>({ref:bb.sprite,proj:bb.sprite.position.clone().project(camera)}));
    buildBubblePts(bents,k,pxW,pxH).forEach(zp=>pts.push(zp));
    const __L=agentData[0].label;
    for(let iter=0;iter<5;iter++){ // multi-pass: satu pass hanya menggeser sedikit, 3 pass menjamin kluster padat benar2 terpisah
    overlapPass(pts);
    } // end multi-pass anti-overlap
    // SWEEP+CLAMP SIKLIKAL (diekstrak ke parts/label_overlap.js): sweep greedy bisa
    // mendorong label melewati batas viewport, dan clamp bisa menimbulkan overlap baru
    // -> ulangi (sweep→clamp) sampai stabil (max 3x). Konvergen: total ruang vertikal
    // aman melebihi kebutuhan, tiap iterasi hanya mengurangi pelanggaran.
    sweepClampRounds(pts, { height: container.clientHeight, width: container.clientWidth });
    // konversi offset piksel ke satuan dunia (~ jarak/tinggi layar) via worldPerPx
    // (murni, parts/label_overlap.js); penerapan clamp offset via labelWorldOffset.
    // OFFSET DI-DAMPING (bukan snap): relayout hanya tiap kelipatan frame; offset
    // baru yang jauh berbeda dari sebelumnya membuat label terlihat melompat.
    // Approach eksponensial (rate 12/s: konvergen <0.3 dtk, gerak halus) —
    // saat relayout pertama (antiY/antiX belum ada) langsung pakai nilai penuh.
    // (Pemeriksaan viewport zona dipindah ke atas — jalan tiap frame.)
    const wpp = worldPerPx(camera.position.distanceTo(tgt), camera.fov, container.clientHeight);
    const LBL_SMOOTH=1-Math.exp(-12*(deltaFrame||0.016));
    pts.forEach(p=>{
      if(p.zone) return; // zona adalah penghalang statis bagi label agent, posisinya dikendalikan oleh guard viewport
      const {dy,dx}=labelWorldOffset(p,wpp);
      const cdy=Math.max(-1.2,Math.min(1.6,dy));
      const cdx=Math.max(-1.5,Math.min(1.5,dx));
      const u=p.a.label.userData;
      const prevY=(u.antiY===undefined)?cdy:u.antiY+(cdy-u.antiY)*LBL_SMOOTH;
      const prevX=(u.antiX===undefined)?cdx:u.antiX+(cdx-u.antiX)*LBL_SMOOTH;
      p.a.label.position.y=p.baseY+prevY; p.a.label.position.x=p.baseX+prevX;
      u.antiY=prevY; u.antiX=prevX; // utk base frame berikutnya (nilai ter-damping)
    });
  } else {
    // bila nama disembunyikan lalu dimunculkan lagi, posisi direset oleh state (sitting/meeting/walker) — tak ada sisa offset
  }
  // Papers
  __pages.update(delta,elapsed);
  // LED server room: kedip lambat → cukup ~20×/dtk (throttle), opacity dari ledOpacity
  // (dulu 70+ LED di-update tiap frame).
  if(shouldUpdateLeds(frame)){
    for(let i=0;i<__leds.length;i++)__leds[i].m.material.opacity=ledOpacity(__leds[i],elapsed);
  }
  // jam dinding di-throttle: canvas 96×96 + upload tekstur cukup ~3×/dtk
  // (jarum detik diskrit per detik) — dulu digambar ulang tiap frame.
  // timeOfDay = MENIT simulasi (0-1440) → drawClockFace mengharapkan DETIK
  // sejak tengah malam (minutes = nowSeconds/60). Tanpa konversi, jarum selalu
  // menunjuk ~00:xx (bug lama: 14:30 ditampilkan sebagai 00:14).
  if(shouldRedrawClock(frame))drawClock(simMinutesToClockSeconds(timeOfDay));

  // Sounds — tick keyboard agent yang duduk + langkah kaki agent yang jalan
  // keyclick & langkah kaki via tickSoundTimer (murni, diuji unit):
  // timer dikurangi delta, trigger saat habis + reset interval.
  {
    const k = tickSoundTimer(keyTimer, delta, () => .09 + Math.random() * .18);
    keyTimer = k.timer;
    if (k.trigger && __sound.state() !== "none" && agentData.some(a => a.state === 'sitting' && a.sittingChar && a.sittingChar.visible)) __sound.playKeyClick();
  }
  {
    const s = tickSoundTimer(stepTimer, delta, .32);
    stepTimer = s.timer;
    if (s.trigger) {
      // langkah hanya saat walker benar-benar melangkah (bukan berdiri ngobrol/antre di tujuan)
      const __mv = agentData.some(a => a.walker && a.walker.visible && (a.state === 'walking_out' || a.state === 'walking_back' || a.state === 'leaving'));
      if (__sound.state() !== "none" && __mv) __sound.playStep();
    }
  }

  // Sounds — meeting chime only
  if(__meet.active&&!lastMeetingState)__sound.playMeetingChime();
  lastMeetingState=__meet.active;

  // ── Shadow auto-update di-throttle: tanpa ini Three.js merender peta bayangan
  // (pass scene kedua, PCF 2048²) SETIAP frame. Matahari statis + agen bergerak
  // lambat → cukup refresh ~6×/dtk; di antara refresh pakai bayangan cache.
  renderer.shadowMap.autoUpdate=false;
  if(shouldRefreshShadow(frame))renderer.shadowMap.needsUpdate=true;
  renderer.render(scene,camera);
  // ── Adaptive quality: bila FPS rendah (GPU lemah/SwiftShader), turunkan beban
  // bertahap: pixelRatio → resolusi shadow map → matikan shadow. Sampling
  // berbasis WAKTU (tiap 2 dtk), bukan frame%60 — di GPU ~1.5 FPS, 60 frame
  // butuh 40 detik sebelum adaptasi pertama terpicu (bug lama: __perf.fps
  // selalu 0 dan degradasi tak pernah jalan pada perangkat yang paling butuh).
  {
    // Adaptive quality via perfStep (murni, parts/perf_quality.js, diuji unit).
    __perfWin = perfStep(__perfWin, performance.now(), frame, {
      renderer: { getPixelRatio: () => renderer.getPixelRatio(), setPixelRatio: (v) => renderer.setPixelRatio(v) },
      sun,
      needsShadowUpdate: () => { renderer.shadowMap.needsUpdate = true; },
      basePixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    });
    window.__perf = __perfWin; // hook debug: ikut reassign tiap frame (fps/downgraded live, tidak stale)
  }
}
window.__perf=__perfWin;
animate();
const onVis=()=>{ pageHidden=document.visibilityState==='hidden';
  if(!pageHidden){ // hidupkan lagi loop render saat kembali visible (anti double-loop)
    if(rafId){cancelAnimationFrame(rafId);rafId=null;}
    animate();
  }
  else if(__sound.state()==='running'){try{__sound.suspend()}catch{/* abaikan */}} // tab hidden → hemat CPU audio
  if(!pageHidden){ // kembali visible: resume audio + refresh instan (tanpa nunggu tick)
    try{
      if(__sound.state()==='suspended')__sound.resume();
      if(window.__pollBadges)window.__pollBadges();
    }catch{/* abaikan */}
  }
  __sound.dbg(s=>{window.__audio=s;});
};
document.addEventListener('visibilitychange',onVis);
const onResize = () => {
  if (!container || !renderer || !camera) return;
  const w = Math.max(1, container.clientWidth || 1);
  const h = Math.max(1, container.clientHeight || 1);
  const asp = w / h;
  camera.aspect = asp;
  const targetFov = getResponsiveFov(asp);
  if (camera.fov !== targetFov) {
    camera.fov = targetFov;
  }
  camera.updateProjectionMatrix();
  __vo();
  renderer.setSize(w, h);
  // Responsive radius: portrait butuh kamera lebih dekat agar kantor fit di layar.
  if (!focusGoal && !sph.__saved) {
    sph.radius = getResponsiveRadius(asp, null, homeRadius, sph.radius);
    updCam();
  }
};
let resizeObserver = null;
if (typeof ResizeObserver !== 'undefined' && container) {
  try {
    resizeObserver = new ResizeObserver(() => { onResize(); });
    resizeObserver.observe(container);
  } catch { /* fallback window resize */ }
}
window.addEventListener('resize', onResize);
window.__resizeScene = onResize;
const onKey=(e)=>{ if(e.key==='Escape'&&window.__escModalAtDispatch===false&&focusGoal){focusGoal=resetFocusGoal(HOME_TGT,homeRadius,sph.radius);selectedIdx=-1;applySelected();if(onSelectAgent)onSelectAgent(null);delete sph.__saved;} };window.addEventListener('keydown',onKey);

  // Return controls for React UI
  // ── Kontrol aksi tim (dipakai menu React) ──
  function teamAction(action){
    if(action==='meeting'){
      updateTime(615); // stand-up window
      focusMeetingRoom();
    } else if(action==='break'){
      agentData.forEach(ad=>{
        if(ad.state!=='sitting')return;
        ad.state='walking_out';ad.sittingChar.visible=false;ad.walker.visible=true;
        ad.walker.position.set(ad.home.x,(ad.home&&ad.home.y)||0,ad.home.z);
        ad.walkTarget={x:-6.0+rng.r(-0.8,0.8),z:5.6+rng.r(-0.4,0.4)}; // Executive Cafe Promenade (L3)
        ad._route=null; // recalc otomatis: tanpa rute, stepRoute jatuh ke walkTarget
        ad.walkPause=12;
      });
    } else if(action==='work'){
      updateTime(660);
      agentData.forEach(ad=>{
        if(ad.state==='meeting'||ad.state==='walking_out'||ad.state==='walking_back'){
          ad.walker.visible=false;ad.sittingChar.visible=true;
          ad.state='sitting';ad.timer=rng.r(8,20);
          ad.label.position.set(ad.home.x,((ad.home&&ad.home.y)||0)+LABEL_Y,ad.home.z);
        }
        if(!namesVisible)ad.label.visible=false;
      });
      if(window.__zoneLabels)resetZoneBaseOffsets(window.__zoneLabels.map(zt=>({ref:zt,base:window.__zoneBase&&window.__zoneBase.get(zt)})));
      if(__meet.active){__meet.update(-1)}
    } else if(action==='tour'){
      agentData.forEach(ad=>{ if(ad.state==='sitting'){ad.timer=0.1;} });
    } else if(action==='test_audio'){
      if(audioMuted) return false;
      __sound.playTaskDone();
      return true;
    }
  }
  const sceneControls = {
    teamAction,
    toggleNames: () => { namesVisible=!namesVisible; try{localStorage.setItem('wfs_names',namesVisible?'1':'0')}catch{/* abaikan */};
      agentData.forEach(ad=>{ad.label.visible=namesVisible && ad.state !== 'offsite';ad.label.userData.antiY=0;ad.label.userData.antiX=0});
      if(window.__zoneLabels)resetZoneBaseOffsets(window.__zoneLabels.map(zt=>({ref:zt,base:window.__zoneBase&&window.__zoneBase.get(zt),visible:namesVisible}))); },
    isNamesVisible: () => namesVisible,
    setSelected: (idx) => { selectedIdx=idx; applySelected(); if(onSelectAgent)onSelectAgent(idx>=0&&idx<agentData.length?agentData[idx].agent:(idx===-2?(nxAgent?{...nxAgent,name:'Wahyu FS',floor:3}:{name:'Wahyu FS',color:0xF59E0B,hex:'#F59E0B',role:'Founder / CEO',floor:3}):null)); },
    getSelected: () => selectedIdx,
    resetFocus: () => { if(focusGoal){focusGoal=resetFocusGoal(HOME_TGT,homeRadius,sph.radius)} selectedIdx=-1; applySelected(); if(onSelectAgent)onSelectAgent(null); delete sph.__saved; },
    setAutoRotate: (v) => { autoRot=!!v; __userRot=!!v; try{localStorage.setItem('wfs_autorot',autoRot?'1':'0')}catch{/* abaikan */} },
    isAutoRotate: () => autoRot,
    setTime: (minutes) => updateTime(minutes),
    toggleCyberpunk: () => toggleCyberpunk(),
    isCyberpunk: () => cyberpunkMode,
    zoomIn: () => { if(focusGoal&&!focusGoal.reset)focusGoal=null; sph.radius=Math.max(12,sph.radius-4); updCam(); },
    zoomOut: () => { if(focusGoal&&!focusGoal.reset)focusGoal=null; sph.radius=Math.min(130,sph.radius+4); updCam(); },
    focusFloor: (floorNum) => {
      if (selectedIdx !== -1) { selectedIdx = -1; applySelected(); if (onSelectAgent) onSelectAgent(null); }
      delete sph.__saved;
      const targetPhi = (sph.phi < 0.7 || sph.phi > 1.35) ? 1.05 : undefined;
      if (floorNum === 1 || floorNum === '1') {
        focusGoal = { t: new THREE.Vector3(0, 0.5, -3.0), r: 18, phi: targetPhi };
        return true;
      } else if (floorNum === 2 || floorNum === '2') {
        focusGoal = { t: new THREE.Vector3(0, 1.1, 1.5), r: 19, phi: targetPhi };
        return true;
      } else if (floorNum === 3 || floorNum === '3') {
        focusGoal = { t: new THREE.Vector3(0, 1.8, 6.0), r: 21, phi: targetPhi };
        return true;
      }
      return false;
    },
    focusTeam: (teamKey) => {
      if (selectedIdx !== -1) { selectedIdx = -1; applySelected(); if (onSelectAgent) onSelectAgent(null); }
      delete sph.__saved;
      const ft = teamPodFocusTarget(teamKey);
      focusGoal = { t: new THREE.Vector3(ft.x, ft.y, ft.z), r: ft.r, phi: ft.phi };
      const teamObj = findTeamByKey(teamKey);
      if (teamObj) {
        __sound.playSelect();
        createBubble(ft.x, ft.y + 1.8, ft.z, '“Pod ' + teamObj.name + ' (Lt. ' + teamObj.floor + ')”', teamObj.hex || teamObj.color || '#10E5A0');
      }
      return true;
    },
    focusAgent: (idOrName) => {
      if (!idOrName) return false;
      const q = String(idOrName).toLowerCase().trim();
      if (q === 'ceo' || q === 'wahyu fs' || q === 'wahyu' || q === 'founder') {
        __sound.playSelect();
        const hr=ensureHomeRadius(homeRadius,sph.radius); homeRadius=hr.homeRadius;
        saveCam(sph);
        const np=new THREE.Vector3(7.6,1.20+0.8,6.1);
        focusGoal={t:np,r:16};
        createBubble(7.6,1.20+1.3,6.1,'“Halo! Selamat datang di WFS PROJECT Autonomous Software House!”','#F59E0B');
        selectedIdx=-2;
        applySelected();
        if(onSelectAgent){
          const ag=nxAgent?{...nxAgent,name:'Wahyu FS',floor:3}:{name:'Wahyu FS',color:0xF59E0B,hex:'#F59E0B',role:'Founder / CEO',hair:0x1a1a1a,shirt:0xB45309,pants:0x292524,floor:3};
          onSelectAgent(ag);
        }
        return true;
      }
      const SCENE_BY_ID = {
        'be1': 'BUDI', 'be2': 'RIZKY', 'fe1': 'DEWI', 'fe2': 'ANDI',
        'mob1': 'YOGA', 'ux1': 'MAYA', 'devops1': 'TONI', 'qa1': 'RINA',
        'ai-cs': 'BANTUIN AI', 'ai-train': 'TRAINER AI', 'integ': 'INTEGRATOR BOT',
        'mkt1': 'LINA', 'cs-h': 'SUPPORT', 'pm1': 'SARI',
      };
      const mapped = SCENE_BY_ID[q] || q;
      const targetName = String(mapped).toUpperCase();
      let root = agentData.find(ad => ad.agent && (
        String(ad.agent.name || '').toUpperCase() === targetName ||
        String(ad.agent.id || '').toLowerCase() === q
      ));
      if (!root && window.__wfsAgentIdList) {
        const item = window.__wfsAgentIdList.find(x => String(x.id).toLowerCase() === q || String(x.name).toLowerCase() === q);
        if (item) {
          const nm = String(item.name).toUpperCase();
          root = agentData.find(ad => ad.agent && String(ad.agent.name || '').toUpperCase() === nm);
        }
      }
      if (root) {
        __sound.playSelect();
        if (window.__wfsSelectAgent) {
          const idMap = {};
          if (window.__wfsAgentIdList) window.__wfsAgentIdList.forEach(x => { idMap[x.name] = x.id; });
          window.__wfsSelectAgent(idMap[root.agent.name] || root.agent.name);
        }
        const wp = root.walker && root.walker.visible ? root.walker.position : { x: root.home.x, y: root.home.y || 0, z: root.home.z };
        const hr2=ensureHomeRadius(homeRadius,sph.radius); homeRadius=hr2.homeRadius;
        focusGoal = { t: new THREE.Vector3(wp.x, (wp.y || 0) + 1.5, wp.z), r: Math.min(sph.radius, 20), follow: root };
        saveCam(sph);
        createBubble(wp.x, (wp.y || 0) + 1.3, wp.z, '“Halo! Aku ' + root.agent.name + '”', root.agent.hex || '#10E5A0');
        selectedIdx = agentData.indexOf(root);
        applySelected();
        if (onSelectAgent) onSelectAgent(root.agent);
        return true;
      }
      return false;
    },
    focusMeetingRoom: () => {
      return focusMeetingRoom();
    },
    setView: (name) => {
      const targetPhi = (sph.phi < 0.7 || sph.phi > 1.35) ? 1.05 : undefined;
      if(name==='l1'||name==='floor1'){ focusGoal={t:new THREE.Vector3(0,0.5,-3.0),r:18,phi:targetPhi}; return true; }
      if(name==='l2'||name==='floor2'){ focusGoal={t:new THREE.Vector3(0,1.1,1.5),r:19,phi:targetPhi}; return true; }
      if(name==='l3'||name==='floor3'){ focusGoal={t:new THREE.Vector3(0,1.8,6.0),r:21,phi:targetPhi}; return true; }
      if(name==='iso'||name==='front'||name==='top'){
        // ganti sudut kamera = batalkan fokus/pilihan agent (konsisten dgn Escape & klik kosong)
        if(selectedIdx!==-1){selectedIdx=-1;applySelected();if(onSelectAgent)onSelectAgent(null);}
        delete sph.__saved;
      }
      focusGoal=null; tgt.copy(HOME_TGT);
      if(name==='iso'){sph.theta=Math.PI*0.78;sph.phi=1.0}
      else if(name==='front'){sph.theta=0;sph.phi=1.2}
      else if(name==='top'){sph.theta=Math.PI*0.78;sph.phi=0.35}
      else return false;
      if(sph.__saved){sph.theta=sph.__saved.theta;sph.phi=sph.__saved.phi;sph.radius=Math.max(24,Math.min(60,sph.__saved.radius));}
      else{
        const asp=computeAspect(container.clientWidth,container.clientHeight);
        const homeMobile=asp<0.6?48:asp<0.8?48:null;
        sph.radius=(name==='top')?(asp<1.2?60:56):(homeRadius||homeMobile||Math.max(24,Math.min(60,sph.radius)));
      }
      updCam(); return true;
    },
    setAudioMuted: (v) => {
      audioMuted = !!v;
      __sound.setMuted(audioMuted);
      saveMuted();
      __sound.dbg(s=>{window.__audio=s;});
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('wfs-ambience-changed', { detail: { enabled: ambienceEnabled, volume: ambienceVolume, muted: audioMuted } }));
        }
      } catch { /* abaikan */ }
    },
    isAudioMuted: () => audioMuted,
    playTaskDone: () => __sound.playTaskDone(),
    playTaskFail: () => __sound.playTaskFail(),
    playTaskUrgent: () => __sound.playTaskUrgent(),
    playSelect: () => __sound.playSelect(),
    playCardPickup: () => __sound.playCardPickup(),
    playCardDrop: () => __sound.playCardDrop(),
    testAudio: (sample = 'done') => {
      if (audioMuted) return false;
      if (sample === 'fail') __sound.playTaskFail();
      else if (sample === 'select') __sound.playSelect();
      else if (sample === 'chime') __sound.playMeetingChime();
      else if (sample === 'urgent') __sound.playTaskUrgent();
      else if (sample === 'ambience') __sound.previewAmbience();
      else if (sample === 'card_pickup') __sound.playCardPickup();
      else if (sample === 'card_drop' || sample === 'card') __sound.playCardDrop();
      else __sound.playTaskDone();
      return true;
    },
    setAudioVolume: (v) => {
      audioVolume = clampVolume(v);
      __sound.setVolume(audioVolume);
      try { saveAudioVolume(typeof localStorage !== 'undefined' ? localStorage : null, audioVolume); } catch { /* abaikan */ }
      __sound.dbg(s=>{window.__audio=s;});
    },
    getAudioVolume: () => audioVolume,
    setAmbienceEnabled: (v) => {
      ambienceEnabled = !!v;
      __sound.setAmbienceEnabled(ambienceEnabled);
      try { saveAmbienceEnabled(typeof localStorage !== 'undefined' ? localStorage : null, ambienceEnabled); } catch { /* abaikan */ }
      __sound.dbg(s=>{window.__audio=s;});
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('wfs-ambience-changed', { detail: { enabled: ambienceEnabled, volume: ambienceVolume, muted: audioMuted } }));
        }
      } catch { /* abaikan */ }
    },
    isAmbienceEnabled: () => __sound.isAmbienceEnabled(),
    setAmbienceVolume: (v) => {
      ambienceVolume = clampAmbienceVolume(v);
      __sound.setAmbienceVolume(ambienceVolume);
      try { saveAmbienceVolume(typeof localStorage !== 'undefined' ? localStorage : null, ambienceVolume); } catch { /* abaikan */ }
      __sound.dbg(s=>{window.__audio=s;});
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('wfs-ambience-changed', { detail: { enabled: ambienceEnabled, volume: ambienceVolume, muted: audioMuted } }));
        }
      } catch { /* abaikan */ }
    },
    getAmbienceVolume: () => __sound.getAmbienceVolume(),
    isAmbienceActive: () => __sound.isAmbienceActive(),
    previewAmbience: () => __sound.previewAmbience(),
    getAudioEngine: () => __sound,
    resize: onResize,
    destroy: () => {
      window.__officeSceneDestroyed=true;
      __intervals.forEach(clearInterval);
      __timeouts.forEach(clearTimeout);
      if (resizeObserver) {
        try { resizeObserver.disconnect(); } catch { /* abaikan */ }
        resizeObserver = null;
      }
      window.removeEventListener('resize', onResize);
      delete window.__resizeScene;
      document.removeEventListener('visibilitychange', onVis);
      if(rafId){cancelAnimationFrame(rafId);rafId=null;}
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerup', onDragUp);
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('keydown', __ensureAudio);
      window.removeEventListener('pointerdown', __ensureAudio);
      __disposeAudioWake && __disposeAudioWake(); // lepaskan listener wake audio sekali-pakai (anti AudioContext leak)
      // Papan proyek: hentikan interval fetch /wfs-project + listener visibilitychange
      // (tanpa ini, tiap remount meninggalkan papan lama yang terus fetch selamanya).
      try { window.__projectBoard && window.__projectBoard.destroy() } catch{/* abaikan */}
      delete window.__projectBoard;
      // TV lounge: hentikan rantai poll adaptif + listener visibility-nya
      try { __loungeObj && __loungeObj.tvDestroy && __loungeObj.tvDestroy() } catch{/* abaikan */}
      // Ruang meeting & whiteboard: bersihkan interval & listener
      try { __mr && __mr.destroy && __mr.destroy(); } catch{/* abaikan */}
      // Shift (daycycle): clear semua setTimeout pending (arrive/depart berantai per 800ms)
      try { __shift && __shift.dispose && __shift.dispose() } catch{/* abaikan */}
      // Audio: engine menutup AudioContext scene lama (mencegah MaxAudioContextsExceeded)
      try { __sound.dispose() } catch{/* abaikan */}
      delete window.__officeSound;
      delete window.__toggleNeon;
      delete window.__sceneSelRing;
      delete window.__focusTeam;
      delete window.__focusAgent;
      delete window.__focusMeetingRoom;
      delete window.__whiteboard;
      delete window.__openTaskBoard;
      if(renderer){renderer.dispose();container.removeChild(renderer.domElement);}
    }
  };
  window.__focusTeam = (k) => sceneControls.focusTeam(k);
  window.__focusAgent = (k) => sceneControls.focusAgent(k);
  window.__focusMeetingRoom = () => sceneControls.focusMeetingRoom();
  return sceneControls;
}
