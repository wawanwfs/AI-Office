// Polling badge & alert failed — diekstrak murni dari pollBadges / interval
// bangun & interval alert (OfficeScene.js). Tanpa fetch/DOM/THREE.

// Warna badge dada per status task (semantik kode lama).
export const BADGE_COLORS = {
  done: '#10E5A0',
  running: '#f59e0b',
  failed: '#f66',
  review: '#59a5ff',
  pending: '#8b93a3',
};

// Pemetaan status gateway → {gid → warna badge} untuk semua agent (ad).
// agents: { [gid]: { last: status } } dari /wfs-api/agents/status
// Return array entri {ad, gid, status} yang punya badge & warna valid.
export function badgeAssignments(agentData, agents, im) {
  const out = [];
  (agentData || []).forEach((ad) => {
    const gid = im[ad?.agent?.name];
    const st = gid && agents && agents[gid] && agents[gid].last;
    const badge = ad?.sittingChar?.userData?.badge;
    if (st && badge && BADGE_COLORS[st]) out.push({ ad, gid, status: st });
  });
  return out;
}

// Pemetaan status gateway → daftar agent-id yang harus dipaksa bangun
// (running>0). Return array gid unik.
export function wakeAgentIds(agents) {
  const out = [];
  Object.entries(agents || {}).forEach(([gid, v]) => {
    if (v && v.running > 0) out.push(gid);
  });
  return out;
}

// Pemetaan status gateway → daftar alert failed baru (transisi naik).
// prevFailed: { gid: jumlahFailedSebelumnya } — dimutasi di sini persis kode lama.
// Return array entri { gid, ad } yang butuh bubble peringatan.
// AD: fungsi pencari agent-by-gid dari pemanggil.
export function failedAlerts(agents, prevFailed, findByGid) {
  const out = [];
  Object.entries(agents || {}).forEach(([gid, v]) => {
    if (v && v.failed > 0 && prevFailed[gid] !== v.failed) {
      prevFailed[gid] = v.failed;
      const ad = findByGid(gid);
      if (ad) out.push({ gid, ad });
    } else if (!v || v.failed === 0) {
      prevFailed[gid] = 0;
    }
  });
  return out;
}

// ── Gabungan tiga poll (badge / bangun / alert) — satu fetch per siklus ──
// Dulu 3 interval terpisah (20s/21s/25s) masing-masing fetch /agents/status —
// 3× trafik untuk data yang sama. Kini satu interval + satu fetch.

// Terapkan warna badge ke mesh nyata (butuh referensi material — tetap di caller
// sebelumnya; di sini hanya transformasi murni data → aksi deskriptif).

// Satu langkah gabungan: dari respons gateway, hasilkan daftar aksi:
//   [{type:'badge',ad,status,color}, {type:'wake',gid,ad}, {type:'alert',gid,ad}]
// Murni, tanpa fetch/DOM/THREE — unit-testable. findByGid: pencari agent-by-gid.
export function statusPollActions(agentData, agents, im, prevFailed, findByGid) {
  const out = [];
  badgeAssignments(agentData, agents, im).forEach(({ ad, status }) => {
    out.push({ type: 'badge', ad, status, color: BADGE_COLORS[status] });
  });
  wakeAgentIds(agents).forEach((gid) => {
    const ad = findByGid(gid);
    if (ad) out.push({ type: 'wake', gid, ad });
  });
  failedAlerts(agents, prevFailed, findByGid).forEach(({ gid, ad }) => {
    out.push({ type: 'alert', gid, ad });
  });
  return out;
}
