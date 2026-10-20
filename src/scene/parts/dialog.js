// ═══════════════════════════════════════════════════
// WATER COOLER CONVERSATIONS — data dialog & util murni
// (createBubble & autoTalk pindah ke OfficeScene.js — pakai THREE/DOM)
// ═══════════════════════════════════════════════════

// Dialog & frasa agent diekstrak murni (tanpa THREE/canvas) agar bisa di-unit-test.
// ═══════════════════════════════════════════════════
// Dialog & frasa agent diekstrak murni (tanpa THREE/canvas) agar bisa di-unit-test.
export const chatPhrases=[
  'pushing to prod...','merge conflict!!','coffee?','ship it!',
  'lgtm +1','who broke CI?','standup in 5','nice refactor',
  'read the ADR','need a review','lunch?','one more bug...',
  'deploying...','v10.8 is live','taste > speed','type safe pls',
];

export const roleTalk={
  'BANTUIN AI':['“Siang kak! Mau cek order?”','“Chat 47 hari ini ”'],
  'BUDI':['“API-nya udah jalan”','“Push dulu…”'],
  'RIZKY':['“Webhook Midtrans ✓”','“Query ku-optimize”'],
  'DEWI':['“Responsive rapi ”','“Dark mode siap”'],
  'ANDI':['“Lighthouse 97! ”','“Hover-nya lucu”'],
  'YOGA':['“Build APK selesai”','“Push notif live”'],
  'MAYA':['“Design v3 ”','“Spacing dikoreksi”'],
  'TONI':['“CPU 12%, aman”','“Docker up ”'],
  'RINA':['“214 test passing ”','“1 bug ketemu”'],
  'LINA':['“CPC turun 18% ”','“Leads naik!”'],
  'SARI':['“Sprint on track ”','“Demo ya besok”'],
  'CEO':['“Deal baru ”','“Kopi dulu ”'],
};

// Pasangan role yang bisa saling ngobrol + lini dialog bergantian.
export const COLLAB_PAIRS=[
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

// Pilih pasangan kolaborasi utk agent ad: 75% menghampiri rekan dengan role
// yang terhubung di COLLAB_PAIRS (arah ± bebas), sisanya null (jalan-jalan).
export function pickCollab(ad, agentData){
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

// Teks bubble dipangkas agar muat di kanvas (maks 32 karakter + ellipsis).
export const clampBubbleText=(text)=>{
  let t=String(text);
  return t.length>32?t.slice(0,31)+'…':t;
};

// Durasi total percakapan kolaborasi (detik): LINE_SEC per baris + jeda akhir.
export const LINE_SEC=1.8;
export const collabDuration=(lines)=>LINE_SEC*lines.length+1.2;

function createBubble(x,y,z,text,color,anchor){
  const W=360,H=76,bc=document.createElement('canvas');bc.width=W;bc.height=H;
  const bx=bc.getContext('2d');
  bx.fillStyle='rgba(7,16,32,0.94)';
  const rr=(cx,cy,cw,ch,cr)=>{bx.beginPath();bx.moveTo(cx+cr,cy);bx.lineTo(cx+cw-cr,cy);bx.quadraticCurveTo(cx+cw,cy,cx+cw,cy+cr);bx.lineTo(cx+cw,cy+ch-cr);bx.quadraticCurveTo(cx+cw,cy+ch,cx+cw-cr,cy+ch);bx.lineTo(cx+cr,cy+ch);bx.quadraticCurveTo(cx,cy+ch,cx,cy+ch-cr);bx.lineTo(cx,cy+cr);bx.quadraticCurveTo(cx,cy,cx+cr,cy);bx.closePath()};
  rr(3,3,W-6,H-14,10);bx.fill();
  bx.strokeStyle=color;bx.lineWidth=2.5;rr(3,3,W-6,H-14,10);bx.stroke();
  bx.beginPath();bx.moveTo(W/2-9,H-11);bx.lineTo(W/2,H-3);bx.lineTo(W/2+9,H-11);bx.closePath();bx.fillStyle='rgba(7,16,32,0.94)';bx.fill();
  bx.font='700 24px "Segoe UI",Arial,sans-serif';bx.fillStyle='#fff';bx.textAlign='center';
  bx.fillText(clampBubbleText(text),W/2,32);
  const btex=new THREE.CanvasTexture(bc);btex.minFilter=THREE.LinearFilter;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:btex,transparent:true,depthTest:false,sizeAttenuation:false}));
  sprite.userData.aspect=W/H; sprite.renderOrder=30;
  const hFrac=0.034;
  sprite.scale.set(hFrac*sprite.userData.aspect,hFrac,1);
  sprite.material.opacity=0;                              // fade-in
  sprite.position.set(x,y+1.35,z);
  office.add(sprite);
  chatBubbles.push({sprite,life:3.5,startY:y+1.35,anchor:anchor||null});
  window.__bubbles=chatBubbles;window.__bubbleCount=chatBubbles.length; window.__lastBubble=text;
  window.__lastBubbleAt=performance.now();
}


// Auto talk: agent cerita sendiri tiap beberapa detik (per role)
let talkTimer=4; // eslint-disable-line no-unused-vars -- reset loop obrolan
let lastTalkRT=performance.now();
function autoTalk(){
  const now=performance.now();
  if(now-lastTalkRT<4000+Math.random()*6000)return;
  lastTalkRT=now;
  const ad=agentData[Math.floor(Math.random()*agentData.length)];
  if(!ad)return;
  const wp=ad.walker.visible?ad.walker.position:{x:ad.home.x,z:ad.home.z};
  // anchor mengikuti agent agar bubble tidak tertinggal di posisi lama saat agent berjalan
  const anc={get x(){return ad.walker.visible?ad.walker.position.x:ad.home.x},get z(){return ad.walker.visible?ad.walker.position.z:ad.home.z},y:2.6};
  // Prioritas: kalau ada task running untuk agent ini, tampilkan status kerja nyata
  const rt=window.__wfsRunningTasks;
  if(rt&&rt.byAgent){
    const rid=window.__wfsAgentIdMap&&window.__wfsAgentIdMap[ad.agent.name];
    const run=rid&&rt.byAgent[rid];
    if(run){
      createBubble(wp.x,2.6,wp.z,'Task #'+run.id+': '+run.title.slice(0,26)+'…',ad.agent.hex,anc);
      return;
    }
  }
  const lines=roleTalk[ad.agent.name]||['“Fokus dulu…”'];
  createBubble(wp.x,2.6,wp.z,lines[Math.floor(Math.random()*lines.length)],ad.agent.hex,anc);
}
