// Sinkronisasi task running — diekstrak murni dari pollRunning (OfficeScene.js).
// pollRunning melakukan fetch /wfs-api/agents/status & /wfs-api/tasks lalu
// menggabungkannya; bagian gabungan data inilah yang murni & diuji unit.
// Tanpa fetch/DOM/THREE.

// Map nama agent → id dari daftar __wfsAgentIdList [{name,id}].
export function agentIdMap(list) {
  const im = {};
  (list || []).forEach((x) => { im[x.name] = x.id; });
  return im;
}

// Gabung data gateway menjadi map task running per agent-id gateway:
// agents: { [gid]: { running: n } } dari /wfs-api/agents/status
// tasks : array ATAU {tasks:[...]} dari /wfs-api/tasks (respons non-array aman)
// Semantik persis kode lama:
//  - running>0 → entri awal {id:'?', title:'mengerjakan', n}
//  - task status 'running' menimpa id/title (n tetap dari status)
export function buildRunningByAgent(agents, tasks) {
  const byAgent = {};
  Object.entries(agents || {}).forEach(([gid, v]) => {
    if (v.running > 0) byAgent[gid] = { id: '?', title: 'mengerjakan', n: v.running };
  });
  const list = Array.isArray(tasks) ? tasks : ((tasks && tasks.tasks) || []);
  list.forEach((t) => {
    const gid = t.agent_id;
    if (t.status === 'running' && byAgent[gid]) byAgent[gid] = { id: t.id, title: t.title, n: byAgent[gid].n };
  });
  return byAgent;
}
