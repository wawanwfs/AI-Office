// parts/extended_desks.js — Workstation Pods & Specialist Agents Tambahan
// Memperluas area kantor 3 lantai agar setiap lantai memiliki multi-baris meja nyata (bukan 1 baris saja).
// Lantai 1: Cluster Arsitektur & Riset Produk (Z = -6.8)
// Lantai 2: Cluster Database & Cloud Infrastructure (Z = 3.2)
// Lantai 3: Cluster Security Operations & Release Engineering (Z = 9.8)

export const EXTENDED_SPECIALISTS = [
  // ── LANTAI 1: Product & Strategy Atrium (Z = -6.8, Y = 0) ──
  {
    name: 'ARIS',
    color: 0x00F0FF,
    hex: '#00F0FF',
    role: 'Solution Architect',
    screen: 'palette',
    floor: 1,
    hair: 0x222222,
    shirt: 0x0E7490,
    pants: 0x164E63,
    desk: { x: -5.5, z: -6.8 }
  },
  {
    name: 'CLARA',
    color: 0xF472B6,
    hex: '#F472B6',
    role: 'UX Researcher',
    screen: 'docs',
    floor: 1,
    hair: 0x4A148C,
    shirt: 0xBE185D,
    pants: 0x1A1A2E,
    desk: { x: 5.5, z: -6.8 }
  },

  // ── LANTAI 2: Core Engineering & Dev Mezzanine (Z = 3.2, Y = 0.60) ──
  {
    name: 'FERRY',
    color: 0x38BDF8,
    hex: '#38BDF8',
    role: 'Database Engineer',
    screen: 'charts',
    floor: 2,
    hair: 0x1E293B,
    shirt: 0x0284C7,
    pants: 0x0F172A,
    desk: { x: -6.0, z: 3.2 }
  },
  {
    name: 'HENDRA',
    color: 0x34D399,
    hex: '#34D399',
    role: 'Cloud Infra Engineer',
    screen: 'deploy',
    floor: 2,
    hair: 0x111827,
    shirt: 0x059669,
    pants: 0x1E293B,
    desk: { x: 6.0, z: 3.2 }
  },

  // ── LANTAI 3: Quality, Security & Delivery Penthouse (Z = 9.8, Y = 1.20) ──
  {
    name: 'SECBOT',
    color: 0xEF4444,
    hex: '#EF4444',
    role: 'Security Engineer',
    screen: 'bugs',
    floor: 3,
    hair: 0x000000,
    shirt: 0xB91C1C,
    pants: 0x18181B,
    desk: { x: -5.0, z: 9.8 }
  },
  {
    name: 'NINA',
    color: 0xF59E0B,
    hex: '#F59E0B',
    role: 'Release Manager',
    screen: 'board',
    floor: 3,
    hair: 0x3E2723,
    shirt: 0xD97706,
    pants: 0x292524,
    desk: { x: 5.0, z: 9.8 }
  }
];
