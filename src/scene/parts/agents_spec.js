// Data identitas 14 agen kantor — diekstrak dari OfficeScene.js agar dapat
// di-unit-test (warna, role, screen, penampilan) tanpa memuat THREE.
// Prinsip: data murni; pemakaian (render mesh, nameplate) tetap di OfficeScene.js.

export const AGENTS = [
  {name:'BANTUIN AI', color:0x10E5A0,hex:'#10E5A0',role:'AI Customer Service', screen:'terminal',hair:0x1a1a2e,shirt:0x0B4F3A,pants:0x08281F},
  {name:'BUDI',       color:0x3B82F6,hex:'#3B82F6',role:'Backend Engineer',    screen:'charts',  hair:0x222222,shirt:0x1E3A8A,pants:0x111827},
  {name:'RIZKY',      color:0x22D3EE,hex:'#22D3EE',role:'Backend Engineer',    screen:'terminal',hair:0x1a1a1a,shirt:0x155E75,pants:0x164E63},
  {name:'DEWI',       color:0xF472B6,hex:'#F472B6',role:'Frontend Engineer',   screen:'palette', hair:0x4A148C,shirt:0x9D174D,pants:0x1a1a2e},
  {name:'ANDI',       color:0xFBBF24,hex:'#FBBF24',role:'Frontend Engineer',   screen:'deploy',  hair:0x3E2723,shirt:0x92400E,pants:0x263238},
  {name:'YOGA',       color:0x60A5FA,hex:'#60A5FA',role:'Mobile Engineer',     screen:'map',     hair:0x111111,shirt:0x1D4ED8,pants:0x1F2937},
  {name:'MAYA',       color:0xA78BFA,hex:'#A78BFA',role:'UI/UX Designer',      screen:'docs',    hair:0x4E342E,shirt:0x6D28D9,pants:0x1a1a2e},
  {name:'TONI',       color:0x34D399,hex:'#34D399',role:'DevOps Engineer',     screen:'bugs',    hair:0x263238,shirt:0x065F46,pants:0x212121},
];

export const AGENTS_EXTRA = [
  {name:'RINA',   color:0xFB7185,hex:'#FB7185',role:'QA Engineer',        screen:'bugs',    hair:0x5D1A1A,shirt:0x9F1239,pants:0x1F2937},
  {name:'LINA',   color:0xFB923C,hex:'#FB923C',role:'Growth Marketing',   screen:'charts',  hair:0x3E2723,shirt:0xC2410C,pants:0x292524},
  {name:'SARI',   color:0xF59E0B,hex:'#F59E0B',role:'Project Manager',    screen:'deploy',  hair:0x2D1B0E,shirt:0xB45309,pants:0x1C1917},
  {name:'TRAINER AI', color:0x8B5CF6,hex:'#8B5CF6',role:'AI Knowledge Engineer', screen:'terminal',hair:0x111827,shirt:0x4C1D95,pants:0x1E1B4B},
  {name:'INTEGRATOR BOT', color:0x06B6D4,hex:'#06B6D4',role:'Integration Engineer', screen:'terminal',hair:0x0F172A,shirt:0x155E75,pants:0x083344},
  {name:'SUPPORT HUMAN', color:0x84CC16,hex:'#84CC16',role:'Customer Success', screen:'docs',   hair:0x3B2412,shirt:0x3F6212,pants:0x1A2E05},
];

export const SCREENS = ['terminal','charts','palette','deploy','map','docs','bugs'];

export function allAgents(a = AGENTS, extra = AGENTS_EXTRA) {
  return [...a, ...extra];
}
