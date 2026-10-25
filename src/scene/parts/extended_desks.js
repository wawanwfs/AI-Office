// parts/extended_desks.js — Workstation Pods & Specialist Agents Kampus WFS PROJECT
// Memperluas area kantor 3 lantai agar setiap lantai memiliki sayap Barat & Timur yang luas dan multi-baris meja nyata.

export const EXTENDED_SPECIALISTS = [
  // ── LANTAI 1: Product & Strategy Atrium (Sayap Barat & Timur, Y = 0) ──
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
    desk: { x: -12.0, z: -7.5 }
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
    desk: { x: -8.0, z: -7.5 }
  },
  {
    name: 'RIAN',
    color: 0x38BDF8,
    hex: '#38BDF8',
    role: 'Product Strategist',
    screen: 'board',
    floor: 1,
    hair: 0x1E293B,
    shirt: 0x0284C7,
    pants: 0x0F172A,
    desk: { x: 8.0, z: -7.5 }
  },
  {
    name: 'TARI',
    color: 0xA855F7,
    hex: '#A855F7',
    role: 'Visual Designer',
    screen: 'palette',
    floor: 1,
    hair: 0x312E81,
    shirt: 0x7E22CE,
    pants: 0x1E1B4B,
    desk: { x: 12.0, z: -7.5 }
  },

  // ── LANTAI 2: Core Engineering & Cloud Database Pods (Y = 0.60) ──
  {
    name: 'FERRY',
    color: 0x22D3EE,
    hex: '#22D3EE',
    role: 'Database Engineer',
    screen: 'charts',
    floor: 2,
    hair: 0x1E293B,
    shirt: 0x0891B2,
    pants: 0x0F172A,
    desk: { x: -13.0, z: 2.5 }
  },
  {
    name: 'GILANG',
    color: 0x00E5FF,
    hex: '#00E5FF',
    role: 'Senior Backend Lead',
    screen: 'terminal',
    floor: 2,
    hair: 0x111827,
    shirt: 0x0369A1,
    pants: 0x1E293B,
    desk: { x: -8.5, z: 2.5 }
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
    desk: { x: 8.5, z: 2.5 }
  },
  {
    name: 'DONI',
    color: 0x10E5A0,
    hex: '#10E5A0',
    role: 'Site Reliability Eng',
    screen: 'charts',
    floor: 2,
    hair: 0x1F2937,
    shirt: 0x047857,
    pants: 0x064E3B,
    desk: { x: 13.0, z: 2.5 }
  },

  // ── LANTAI 3: Quality, Security & Delivery Penthouse (Y = 1.20) ──
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
    desk: { x: -12.0, z: 9.5 }
  },
  {
    name: 'BAGAS',
    color: 0xF87171,
    hex: '#F87171',
    role: 'DevSecOps Specialist',
    screen: 'terminal',
    floor: 3,
    hair: 0x450A0A,
    shirt: 0x991B1B,
    pants: 0x18181B,
    desk: { x: -7.5, z: 9.5 }
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
    desk: { x: 7.5, z: 9.5 }
  },
  {
    name: 'CITRA',
    color: 0xFBBF24,
    hex: '#FBBF24',
    role: 'Quality Governance Lead',
    screen: 'docs',
    floor: 3,
    hair: 0x78350F,
    shirt: 0xB45309,
    pants: 0x451A03,
    desk: { x: 12.0, z: 9.5 }
  }
];
