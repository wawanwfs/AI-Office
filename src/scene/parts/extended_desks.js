// parts/extended_desks.js — Workstation Pods & Specialist Agents Kampus WFS PROJECT
// 12 spesialis tambahan pada sayap Barat & Timur (x = ±10.5 / ±13.5 — DI DALAM dinding 34m),
// tersusun terasering per lantai: L1 z=-5 (Atrium), L2 z=1 (Mezzanine), L3 z=7 (Penthouse).

export const EXTENDED_SPECIALISTS = [
  // ── LANTAI 1: Product & Strategy Atrium (Y = 0, z = -5) ──
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
    desk: { x: -13.5, z: -5 }
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
    desk: { x: -10.5, z: -5 }
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
    desk: { x: 10.5, z: -5 }
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
    desk: { x: 13.5, z: -5 }
  },

  // ── LANTAI 2: Core Engineering & Cloud Pods (Y = 0.60, z = 1) ──
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
    desk: { x: -13.5, z: 1 }
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
    desk: { x: -10.5, z: 1 }
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
    desk: { x: 10.5, z: 1 }
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
    desk: { x: 13.5, z: 1 }
  },

  // ── LANTAI 3: Quality, Security & Delivery Penthouse (Y = 1.20, z = 7) ──
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
    desk: { x: -13.5, z: 7 }
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
    desk: { x: -6.0, z: 8.8 }
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
    desk: { x: 6.0, z: 8.8 }
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
    desk: { x: 13.5, z: 7 }
  }
];
