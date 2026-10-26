// Sinkronisasi task running — diekstrak murni dari pollRunning (OfficeScene.js).
// pollRunning melakukan fetch /wfs-api/agents/status & /wfs-api/tasks lalu
// menggabungkannya; bagian gabungan data inilah yang murni & diuji unit.
// Tanpa fetch/DOM/THREE.

export const SCENE_NAME_TO_ID = {
  'BUDI': 'be1',
  'RIZKY': 'be2',
  'DEWI': 'fe1',
  'ANDI': 'fe2',
  'YOGA': 'mob1',
  'MAYA': 'ux1',
  'TONI': 'devops1',
  'RINA': 'qa1',
  'BANTUIN AI': 'ai-cs',
  'TRAINER AI': 'ai-train',
  'INTEGRATOR BOT': 'integ',
  'LINA': 'mkt1',
  'SUPPORT': 'cs-h',
  'SARI': 'pm1',
  'WAHYU FS': 'ceo',
  'CEO': 'ceo',
  'ARIS': 'arch1',
  'CLARA': 'ux2',
  'RIAN': 'prod1',
  'TARI': 'dsgn1',
  'FERRY': 'db1',
  'GILANG': 'be-lead',
  'HENDRA': 'infra1',
  'DONI': 'sre1',
  'SECBOT': 'sec1',
  'BAGAS': 'secops1',
  'NINA': 'rel1',
  'CITRA': 'gov1'
};

// Map nama agent → id dari daftar __wfsAgentIdList [{name,id}].
export function agentIdMap(list) {
  const im = {};
  (list || []).forEach((x) => { if (x && x.name) im[x.name] = x.id; });
  return im;
}

/**
 * Resolves an agent name or alias to their gateway ID using list, map, or fallback.
 */
export function resolveAgentId(name, idListOrMap) {
  if (!name) return null;
  const clean = String(name).trim();
  const up = clean.toUpperCase();
  const first = up.split(' ')[0];

  if (idListOrMap && !Array.isArray(idListOrMap)) {
    if (idListOrMap[clean]) return idListOrMap[clean];
    if (idListOrMap[up]) return idListOrMap[up];
    if (idListOrMap[first]) return idListOrMap[first];
  }

  if (Array.isArray(idListOrMap)) {
    const found = idListOrMap.find((x) =>
      x && (
        x.name === clean ||
        x.id === clean ||
        (x.name && String(x.name).toUpperCase() === up) ||
        (x.name && String(x.name).split(' ')[0].toUpperCase() === first) ||
        (x.id && String(x.id).toUpperCase() === up)
      )
    );
    if (found && found.id) return found.id;
  }

  return SCENE_NAME_TO_ID[up] || SCENE_NAME_TO_ID[first] || null;
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
    if (v && v.running > 0) byAgent[gid] = { id: '?', title: 'mengerjakan', n: v.running };
  });
  const list = Array.isArray(tasks) ? tasks : ((tasks && tasks.tasks) || []);
  list.forEach((t) => {
    const gid = t.agent_id;
    if (t.status === 'running' && byAgent[gid]) byAgent[gid] = { id: t.id, title: t.title, n: byAgent[gid].n };
  });
  return byAgent;
}
