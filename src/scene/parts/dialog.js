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

// autoTalk: keputusan murni (diuji unit) — delay acak & pilihan teks.
// Delay 4–10 dtk antar bubble obrolan otomatis.
export const autoTalkDelay = (rng = Math) => 4000 + rng.random() * 6000;

// Pilih teks bubble otomatis utk agent ad:
// 1) task running utk agent ini → 'Task #id: judul' (status kerja nyata)
// 2) else frasa per-role (roleTalk), fallback '“Fokus dulu…”'
// runningTasks: {byAgent:{[id]:{id,title}}} atau null/undefined.
export function autoTalkText(ad, runningTasks, agentIdMap, rng = Math) {
  if (!ad) return null;
  const rt = runningTasks;
  if (rt && rt.byAgent) {
    const rid = agentIdMap && agentIdMap[ad.agent.name];
    const run = rid && rt.byAgent[rid];
    if (run) return 'Task #' + run.id + ': ' + clampBubbleText(run.title);
  }
  const lines = roleTalk[ad.agent.name] || ['“Fokus dulu…”'];
  return lines[Math.floor(rng.random() * lines.length)];
}

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
// Memotong di batas KATA terakhir (bila hasil >60% batas) sehingga kata tak
// terpotong tengah — pola sama dengan clip() papan proyek. Fallback: potong
// apa adanya bila kata tunggal sangat panjang / tidak ada spasi yang membantu.
export const clampBubbleText=(text)=>{
  let t=String(text);
  if(t.length<=32)return t;
  const head=t.slice(0,31);
  const sp=head.lastIndexOf(' ');
  if(sp>=Math.floor(32*.6))return head.slice(0,sp)+'…';
  return head+'…';
};

// Durasi total percakapan kolaborasi (detik): LINE_SEC per baris + jeda akhir.
export const LINE_SEC=1.8;
export const collabDuration=(lines)=>LINE_SEC*lines.length+1.2;
