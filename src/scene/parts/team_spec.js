// parts/team_spec.js — Spesifikasi Pembagian Divisi / Tim Kerja Kantor WFS PROJECT
// Modul murni (tanpa dependensi THREE/DOM) agar dapat diuji unit 100% deterministik.

export const TEAMS = [
  {
    key: 'core-be',
    name: 'Backend & Data',
    shortName: 'Backend',
    color: '#22D3EE',
    hex: '#22D3EE',
    floor: 2,
    lead: 'GILANG',
    roles: ['backend', 'database', 'db', 'be', 'data'],
    agentIds: ['be1', 'be2', 'db1', 'be-lead'],
    members: ['GILANG', 'BUDI', 'RIZKY', 'FERRY'],
    podCenter: { x: -8.5, y: 0.60, z: 2.0, r: 16, phi: 1.05 },
  },
  {
    key: 'fe-design',
    name: 'Frontend & Design',
    shortName: 'Frontend',
    color: '#F472B6',
    hex: '#F472B6',
    floor: 1,
    lead: 'DEWI',
    roles: ['frontend', 'fe', 'mobile', 'mob', 'design', 'ui/ux', 'ux'],
    agentIds: ['fe1', 'fe2', 'mob1', 'ux1', 'ux2', 'dsgn1'],
    members: ['DEWI', 'ANDI', 'YOGA', 'MAYA', 'CLARA', 'TARI'],
    podCenter: { x: -6.0, y: 0.0, z: -5.0, r: 16, phi: 1.05 },
  },
  {
    key: 'ops-sec',
    name: 'DevOps & Security',
    shortName: 'DevOps',
    color: '#34D399',
    hex: '#34D399',
    floor: 3,
    lead: 'TONI',
    roles: ['devops', 'infra', 'sre', 'security', 'secops', 'cloud'],
    agentIds: ['devops1', 'infra1', 'sre1', 'sec1', 'secops1'],
    members: ['TONI', 'HENDRA', 'DONI', 'SECBOT', 'BAGAS'],
    podCenter: { x: -8.0, y: 1.20, z: 8.0, r: 17, phi: 1.05 },
  },
  {
    key: 'qa-gov',
    name: 'QA & Governance',
    shortName: 'QA & Gov',
    color: '#FB7185',
    hex: '#FB7185',
    floor: 3,
    lead: 'RINA',
    roles: ['qa', 'governance', 'release', 'test', 'tester'],
    agentIds: ['qa1', 'gov1', 'rel1'],
    members: ['RINA', 'NINA', 'CITRA'],
    podCenter: { x: 8.0, y: 1.20, z: 8.0, r: 17, phi: 1.05 },
  },
  {
    key: 'prod-growth',
    name: 'Product & Growth',
    shortName: 'Product',
    color: '#F59E0B',
    hex: '#F59E0B',
    floor: 1,
    lead: 'SARI',
    roles: ['pm', 'product', 'strategy', 'growth', 'integration', 'integ'],
    agentIds: ['pm1', 'mkt1', 'arch1', 'prod1', 'integ'],
    members: ['SARI', 'LINA', 'ARIS', 'RIAN', 'INTEGRATOR BOT'],
    podCenter: { x: 7.0, y: 0.0, z: -5.0, r: 16, phi: 1.05 },
  },
  {
    key: 'ai-cs',
    name: 'AI & Customer Success',
    shortName: 'AI & CS',
    color: '#10E5A0',
    hex: '#10E5A0',
    floor: 1,
    lead: 'BANTUIN AI',
    roles: ['ai', 'support', 'customer', 'cs', 'knowledge'],
    agentIds: ['ai-cs', 'ai-train', 'cs-h'],
    members: ['BANTUIN AI', 'TRAINER AI', 'SUPPORT'],
    podCenter: { x: 0.0, y: 0.0, z: -3.0, r: 15, phi: 1.05 },
  },
];

/**
 * Mencari divisi / tim berdasarkan string role task.
 */
export function findTeamByRole(role) {
  if (!role || typeof role !== 'string') return null;
  const clean = role.trim().toLowerCase();
  for (const team of TEAMS) {
    if (team.roles.includes(clean)) return team;
    if (team.roles.some((r) => clean.includes(r))) return team;
  }
  return null;
}

/**
 * Mencari divisi / tim berdasarkan nama agen atau ID gateway.
 */
export function findTeamByAgent(agentIdOrName) {
  if (!agentIdOrName || typeof agentIdOrName !== 'string') return null;
  const clean = agentIdOrName.trim().toUpperCase();
  const lower = agentIdOrName.trim().toLowerCase();

  for (const team of TEAMS) {
    if (team.agentIds.some((id) => id.toLowerCase() === lower)) return team;
    if (team.members.some((m) => m.toUpperCase() === clean)) return team;
    if (team.members.some((m) => clean.startsWith(m.toUpperCase()))) return team;
  }
  return null;
}

/**
 * Mencari divisi / tim berdasarkan key unik.
 */
export function findTeamByKey(key) {
  if (!key) return null;
  return TEAMS.find((t) => t.key === key) || null;
}

/**
 * Mengagregasi metrik progres pengerjaan task per tim / divisi.
 * @param {Array|Object} rawTasks Daftar task dari /wfs-api/tasks atau { tasks: [...] }
 * @returns {Array} Array metrik tiap tim dengan statistik total, done, running, pct, dll.
 */
export function computeTeamStats(rawTasks) {
  const list = Array.isArray(rawTasks)
    ? rawTasks
    : (rawTasks && Array.isArray(rawTasks.tasks) ? rawTasks.tasks : []);

  const statsMap = {};
  for (const team of TEAMS) {
    statsMap[team.key] = {
      key: team.key,
      name: team.name,
      shortName: team.shortName,
      color: team.color,
      hex: team.hex,
      floor: team.floor,
      lead: team.lead,
      members: team.members,
      agentIds: team.agentIds,
      total: 0,
      done: 0,
      running: 0,
      review: 0,
      failed: 0,
      pending: 0,
      pct: 0,
    };
  }

  // Akumulasikan task ke tim yang sesuai
  list.forEach((t) => {
    if (!t) return;
    const team = findTeamByRole(t.role) || findTeamByAgent(t.agent_id);
    const targetKey = team ? team.key : 'core-be';
    const s = statsMap[targetKey];
    if (!s) return;

    s.total += 1;
    const status = String(t.status || '').toLowerCase();
    if (status === 'done' || status === 'completed') s.done += 1;
    else if (status === 'running') s.running += 1;
    else if (status === 'review') s.review += 1;
    else if (status === 'failed') s.failed += 1;
    else s.pending += 1;
  });

  return TEAMS.map((team) => {
    const s = statsMap[team.key];
    s.pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
    return s;
  });
}

/**
 * Koordinat fokus kamera 3D untuk menyorot pod meja kerja tim.
 */
export function teamPodFocusTarget(teamKey) {
  const team = findTeamByKey(teamKey);
  if (!team || !team.podCenter) {
    return { x: 0, y: 1.1, z: 1.5, r: 19, phi: 1.05 };
  }
  return { ...team.podCenter };
}
