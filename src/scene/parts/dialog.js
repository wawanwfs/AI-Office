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
  'BANTUIN AI':['“Siang kak! Mau cek order?”','“Chat 47 hari ini 👍”','“CS AI standby 24/7 ⚡”'],
  'BUDI':['“API-nya udah jalan”','“Push dulu…”','“Query di-cache Redis 🚀”'],
  'RIZKY':['“Webhook Midtrans ✓”','“Query ku-optimize”','“DB indexing selesai 📊”'],
  'DEWI':['“Responsive rapi ✨”','“Dark mode siap”','“Tailwind rapi pol 🎨”'],
  'ANDI':['“Lighthouse 97! ⚡”','“Hover-nya lucu”','“Micro-interaction smooth ✨”'],
  'YOGA':['“Build APK selesai”','“Push notif live”','“Mobile view verified 📱”'],
  'MAYA':['“Design v3 🎨”','“Spacing dikoreksi”','“Figma to code pas 📐”'],
  'TONI':['“CPU 12%, aman”','“Docker up 🟢”','“Cluster k8s normal 🛡️”'],
  'RINA':['“214 test passing ✓”','“1 bug ketemu”','“Coverage 94% aman 🧪”'],
  'LINA':['“CPC turun 18% 📈”','“Leads naik!”','“Traffic campaign +35% 🚀”'],
  'SARI':['“Sprint on track 🎯”','“Demo ya besok”','“Backlog tersaring rapi 📋”'],
  'CEO':['“WFS siap scale up 🚀”','“Deal baru 🤝”','“Kopi dulu ☕”'],
  'WAHYU FS':['“WFS siap scale up 🚀”','“Sprint on track 🎯”','“Klien puas, produk jalan ✨”'],
  'TRAINER AI':['“Fine-tuning model 98% ⚡”','“Dataset siap dilatih 📊”','“Loss konvergen rapi 🎯”'],
  'INTEGRATOR BOT':['“Sync multi-agent aktif 🔄”','“Pipeline CI/CD hijau 🟢”','“API gateway stabil 🌐”'],
  'SUPPORT':['“Tiket #104 terselesaikan ✅”','“CS respons < 1 menit ⚡”','“Rating pelanggan 4.9 ⭐”'],
  // ── Spesialis Kampus Multi-Lantai WFS PROJECT ──
  'ARIS':['“Microservices decoupled rapi 🏛️”','“Event-driven architecture siap ⚡”','“Sistem siap scale 100k RPS 📐”'],
  'CLARA':['“Hasil user interview masuk 📊”','“Usability testing skor 89% ✨”','“User journey makin intuitif 💡”'],
  'RIAN':['“Product roadmap Q4 locked 🎯”','“Product-market fit verified 🚀”','“Fitur baru selaras KPI 📈”'],
  'TARI':['“Design system token sinkron 🎨”','“Iconography v2 konsisten ✨”','“Visual aesthetic premium 💎”'],
  'FERRY':['“Read replica Postgres aktif 🐘”','“Query latency drop ke 1.8ms ⚡”','“Sharding partisi lancar 📊”'],
  'GILANG':['“High throughput pipeline stabil 🟢”','“gRPC service terhubung rapi 🔗”','“Concurrency race condition aman 🛡️”'],
  'HENDRA':['“Multi-region failover ready ☁️”','“Terraform infra apply sukses 🏗️”','“Cloud cost efisien 32% 💰”'],
  'DONI':['“SLO 99.99% terjaga ketat 🛡️”','“Zero downtime deployment ⚡”','“Auto-scaling pod responsif 🟢”'],
  'SECBOT':['“Vulnerability scan: 0 critical 🔒”','“Pen-test perimeter lolos 🛡️”','“Auth token encrypted AES-256 🔑”'],
  'BAGAS':['“Secret scanning di CI bersih 🛡️”','“Container image signed Cosign 🔐”','“Zero trust policy enforced 🌐”'],
  'NINA':['“Staging changelog approved 📋”','“Rollout Canary v10.8 siap 🚀”','“Semua greenlight untuk rilis ✨”'],
  'CITRA':['“Audit compliance 100% lolos 📜”','“Code quality metric A+ 🌟”','“Standard SOP terverifikasi ✅”'],
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
    const rid = agentIdMap && agentIdMap[ad.agent?.name];
    const run = rid && rt.byAgent[rid];
    if (run) return 'Task #' + run.id + ': ' + clampBubbleText(run.title);
  }
  const name = ad.agent?.name ? String(ad.agent.name).toUpperCase() : '';
  const role = ad.agent?.role ? String(ad.agent.role).toUpperCase() : '';
  const lines = roleTalk[name] ||
                (role.includes('CEO') ? (roleTalk['WAHYU FS'] || roleTalk.CEO) : null) ||
                (role.includes('TRAINER') ? roleTalk['TRAINER AI'] : null) ||
                (role.includes('INTEGRAT') ? roleTalk['INTEGRATOR BOT'] : null) ||
                (role.includes('SUPPORT') || role.includes('SUCCESS') ? roleTalk.SUPPORT : null) ||
                (role.includes('ARCHITECT') ? roleTalk.ARIS : null) ||
                (role.includes('RESEARCH') ? roleTalk.CLARA : null) ||
                (role.includes('STRATEG') ? roleTalk.RIAN : null) ||
                (role.includes('VISUAL') ? roleTalk.TARI : null) ||
                (role.includes('DATABASE') ? roleTalk.FERRY : null) ||
                (role.includes('SENIOR') || (role.includes('BACKEND') && role.includes('LEAD')) ? roleTalk.GILANG : null) ||
                (role.includes('CLOUD') || role.includes('INFRA') ? roleTalk.HENDRA : null) ||
                (role.includes('RELIABILITY') || role.includes('SRE') ? roleTalk.DONI : null) ||
                (role.includes('SECURITY') ? roleTalk.SECBOT : null) ||
                (role.includes('DEVSECOPS') ? roleTalk.BAGAS : null) ||
                (role.includes('RELEASE') ? roleTalk.NINA : null) ||
                (role.includes('GOVERNANCE') ? roleTalk.CITRA : null) ||
                roleTalk[role] ||
                roleTalk[ad.agent?.name] ||
                ['“Fokus dulu…”'];
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
  // ── Kolaborasi Antar-Lantai Spesialis Kampus WFS PROJECT ──
  ['ARCHITECT','BACKEND',['Desain event-driven siap diimplementasi?','Siap, payload Kafka distandarkan','Bagus, perhatikan idempotent consumer','Sudah ada deduping di Redis 🚀']],
  ['ARCHITECT','DEVSECOPS',['Bagaimana perimeter network cluster?','Kita pasang mTLS antar service 🔐','Arsitektur zero-trust terpenuhi','Audit trail juga langsung aktif 🛡️']],
  ['RESEARCH','DESIGN',['User kesulitan di bagian checkout','Bisa kurampingkan jadi 2 step ✨','Heatmap konversi bakal naik 📈','Prototipe langsung ku-update 🎨']],
  ['STRATEGIST','PROJECT MANAGER',['Fitur prioritas Q4 sudah disepakati?','Sprint backlog siap dibagi ke tim 🎯','Timeline delivery tetap on-track','Aman, alokasi tim seimbang 📋']],
  ['DATABASE','BACKEND',['Query analytics lambat di jam sibuk','Sudah kubuat index komposit baru 🐘','Latency turun dari 450ms ke 12ms ⚡','Mantap, beban server langsung lega']],
  ['RELIABILITY','INFRA',['Traffic spike 3x lipat terdeteksi 📈','Kubernetes HPA scale ke 12 pod ☁️','Resource CPU masih aman di 45%','Load balancer routing merata 🟢']],
  ['SECURITY','DEVSECOPS',['Hasil SAST scanner aman semua?','Nol vulnerabilitas critical di build ini 🔒','Image docker signed dengan Cosign 🔐','Aman masuk pipeline deploy 🛡️']],
  ['RELEASE','QA',['Semua regression test sudah hijau?','1402 unit test & e2e lolos 100% 🧪','Canary rollout ke 10% user siap 🚀','Kupantau error rate di Datadog 📊']],
  ['VISUAL','FRONTEND',['Design token typography sudah update?','CSS variable langsung terhubung 🎨','Render di semua viewport tajam ✨','Bagus, visual makin konsisten']],
  ['GOVERNANCE','RELEASE',['Dokumen audit compliance sudah lengkap?','Semua sign-off lead sudah ada 📜','Checklist governance terpenuhi ✅','Release disetujui untuk deploy 🚀']],
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
