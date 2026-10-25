// parts/agent_competencies.js — Profil keahlian teknis, domain fokus & stack teknologi 26 agen kampus + Founder WFS
// Modul murni tanpa THREE/DOM yang memetakan kapabilitas rekayasa perangkat lunak otonom WFS PROJECT.

export const AGENT_COMPETENCIES = {
  'WAHYU FS': {
    domain: 'Executive Architecture & Vision',
    summary: 'Arsitektur sistem end-to-end, strategi produk otonom, dan kepemimpinan engineering.',
    tags: ['System Architecture', 'Autonomous AI', 'Executive Vision', 'Fullstack Tech'],
    isFounder: true
  },
  'ARIS': {
    domain: 'Distributed Architecture & Microservices',
    summary: 'Perancangan topologi microservices, event-driven architecture, dan skalabilitas sistem.',
    tags: ['Microservices', 'Event-Driven', 'Kafka', 'System Design']
  },
  'CLARA': {
    domain: 'User Research & Usability Testing',
    summary: 'Riset perilaku pengguna, wawancara kualitatif, dan pengujian kegunaan antarmuka.',
    tags: ['User Research', 'Journey Maps', 'Usability Test', 'Heuristics']
  },
  'RIAN': {
    domain: 'Product Strategy & Roadmap Planning',
    summary: 'Penyusunan product roadmap, validasi product-market fit, dan penyelarasan metrik KPI.',
    tags: ['Product Roadmap', 'Market Fit', 'Feature Specs', 'OKRs']
  },
  'TARI': {
    domain: 'Visual Design & Design Systems',
    summary: 'Standardisasi design system, token warna/tipografi, dan aset visual beresolusi tinggi.',
    tags: ['Design System', 'Tokens', 'Figma', 'UI Aesthetics']
  },
  'FERRY': {
    domain: 'High Performance Database Engineering',
    summary: 'Optimasi query Postgres, indeks relasional, arsitektur partisi dan read-replica.',
    tags: ['PostgreSQL', 'Redis', 'Sharding', 'Query Tuning']
  },
  'GILANG': {
    domain: 'High Throughput Backend & Concurrency',
    summary: 'Pipeline throughput tinggi, komunikasi RPC latensi ultra-rendah, dan integritas transaksi.',
    tags: ['Go / Node.js', 'gRPC', 'Protobuf', 'Concurrency']
  },
  'HENDRA': {
    domain: 'Cloud Infrastructure & IaC',
    summary: 'Penyediaan infrastruktur cloud berbasis kode, isolasi jaringan VPC, dan efisiensi cloud.',
    tags: ['Terraform', 'Multi-Cloud', 'Docker', 'VPC Routing']
  },
  'DONI': {
    domain: 'Site Reliability & Observability',
    summary: 'Pemeliharaan SLO 99.99%, monitoring telemetri metrik real-time, dan mitigasi downtime.',
    tags: ['Kubernetes', 'SLO 99.99%', 'Prometheus', 'Grafana']
  },
  'SECBOT': {
    domain: 'Cybersecurity & Perimeter Defense',
    summary: 'Pemindaian celah keamanan, mitigasi eksploitasi zero-day, dan enkripsi payload data.',
    tags: ['Pen-testing', 'Vuln Scan', 'AES-256', 'OWASP Top 10']
  },
  'BAGAS': {
    domain: 'DevSecOps & Supply Chain Security',
    summary: 'Keamanan pipeline CI/CD, penandatanganan container image, dan kebijakan zero-trust.',
    tags: ['Container Security', 'Cosign', 'Secret Scanning', 'Zero Trust']
  },
  'NINA': {
    domain: 'Release Engineering & Canary Rollouts',
    summary: 'Orkestrasi rilis canary bertahap, audit changelog staging, dan mitigasi rollback.',
    tags: ['Canary Deploy', 'Changelogs', 'SemVer', 'Release Safety']
  },
  'CITRA': {
    domain: 'Quality Governance & Compliance',
    summary: 'Audit kepatuhan standar kode internasional, SOP rilis, dan validasi mutu engineering.',
    tags: ['ISO Compliance', 'Code Review', 'SOP Governance', 'Quality Audit']
  },
  'BUDI': {
    domain: 'Core Backend & API Services',
    summary: 'Pengembangan REST API inti, caching memori Redis, dan logika bisnis aplikasi.',
    tags: ['FastAPI / Express', 'REST API', 'Redis Cache', 'Postgres']
  },
  'RIZKY': {
    domain: 'Fintech & Payment Gateway Integration',
    summary: 'Integrasi payment gateway, webhook transaksi finansial, dan audit rekonsiliasi billing.',
    tags: ['Midtrans', 'Payment Webhooks', 'SQL Ledger', 'Security']
  },
  'DEWI': {
    domain: 'Modern Frontend & Component Architecture',
    summary: 'Antarmuka web interaktif, arsitektur komponen React, dan integrasi styling Tailwind.',
    tags: ['React', 'Tailwind CSS', 'Vite PWA', 'Responsive UI']
  },
  'ANDI': {
    domain: 'Web Performance & Micro-Interactions',
    summary: 'Optimasi skor Lighthouse 95+, animasi CSS halus 60fps, dan interaktivitas tingkat lanjut.',
    tags: ['Lighthouse 97+', 'Web Vitals', 'CSS 60fps', 'TypeScript']
  },
  'YOGA': {
    domain: 'Cross-Platform Mobile Engineering',
    summary: 'Pengembangan aplikasi mobile Android/iOS, integrasi push notification, dan mobile UX.',
    tags: ['React Native', 'Android / iOS', 'Push SDK', 'Mobile UI']
  },
  'MAYA': {
    domain: 'UI/UX Prototyping & Interaction Design',
    summary: 'Wireframing interaktif, alur navigasi intuitif, dan standardisasi aksesibilitas WAI-ARIA.',
    tags: ['Figma Prototyping', 'User Flows', 'A11y ARIA', 'Microcopy']
  },
  'TONI': {
    domain: 'DevOps & Container Sandbox Isolation',
    summary: 'Manajemen sandbox Docker terisolasi, orkestrasi resource server, dan automasi host.',
    tags: ['Docker Compose', 'Linux Kernel', 'Sandbox Isolation', 'Bash Script']
  },
  'RINA': {
    domain: 'Automated Testing & Quality Assurance',
    summary: 'Pengujian unit test deterministik, skenario E2E otomatis, dan pelacakan regresi bug.',
    tags: ['Vitest', 'E2E Headless', 'Regression Tests', 'Bug Tracking']
  },
  'LINA': {
    domain: 'Growth Marketing & Conversion Analytics',
    summary: 'Analisis conversion rate, penelusuran atribusi campaign, dan optimasi biaya CPC.',
    tags: ['Growth Analytics', 'Conversion Rate', 'CPC Tracking', 'SEO / Ads']
  },
  'SARI': {
    domain: 'Agile Project Management & Delivery',
    summary: 'Pengawalan sprint backlog, alokasi kapasitas tim, dan pelaporan milestone deliverable.',
    tags: ['Sprint Planning', 'Task Board', 'Milestones', 'Agile Scrum']
  },
  'BANTUIN AI': {
    domain: 'Autonomous Customer Success AI',
    summary: 'Layanan pelanggan otomatis 24/7, penanganan pertanyaan order, dan eskalasi cerdas.',
    tags: ['LLM Support', '24/7 Helpdesk', 'Ticket Routing', 'Fast Response']
  },
  'TRAINER AI': {
    domain: 'AI Model Alignment & Knowledge Tuning',
    summary: 'Kurasi dataset latih, evaluasi alignment model, dan optimasi prompt instruksi AI.',
    tags: ['Fine-Tuning', 'Dataset Prep', 'Prompt Alignment', 'Evaluation']
  },
  'INTEGRATOR BOT': {
    domain: 'Multi-Agent Orchestration & Webhooks',
    summary: 'Sinkronisasi event lintas agen, bridge antrian pesan, dan otomasi pipeline CI/CD.',
    tags: ['Agent Mesh', 'Event Bridge', 'Webhook Sync', 'CI Automation']
  },
  'SUPPORT': {
    domain: 'Customer Care & Ticket Resolution',
    summary: 'Penyelesaian kendala teknis pelanggan, manajemen SLA respon cepat, dan CS feedback.',
    tags: ['Ticket SLA', 'User Assistance', 'Escalation', 'SLA < 1m']
  }
};

export function getAgentCompetency(agentOrName) {
  if (!agentOrName) {
    return {
      domain: 'Autonomous Specialist',
      summary: 'Spesialis tim AI kampus WFS PROJECT.',
      tags: ['AI Specialist', 'WFS Project']
    };
  }
  const rawName = typeof agentOrName === 'string' ? agentOrName : (agentOrName.name || '');
  const cleanName = rawName.trim().toUpperCase();

  if (cleanName === 'WAHYU' || cleanName === 'WAHYU FAJAR S.' || cleanName === 'WAHYU FAJAR SETIAWAN' || cleanName === 'CEO') {
    return AGENT_COMPETENCIES['WAHYU FS'];
  }

  if (AGENT_COMPETENCIES[cleanName]) {
    return AGENT_COMPETENCIES[cleanName];
  }

  // cleanName kosong (objek tanpa properti name / string spasi): jangan biarkan
  // prefix-match `k.startsWith('')` selalu true — itu akan mengembalikan profil
  // Founder untuk agen tanpa nama. Langsung ke fallback berbasis role.
  const matchedKey = cleanName && Object.keys(AGENT_COMPETENCIES).find((k) => cleanName.startsWith(k) || k.startsWith(cleanName));
  if (matchedKey) {
    return AGENT_COMPETENCIES[matchedKey];
  }

  const role = typeof agentOrName === 'object' && agentOrName.role ? agentOrName.role : 'Specialist';
  return {
    domain: role,
    summary: `Spesialis ${role} pada lingkungan autonomous kampus WFS PROJECT.`,
    tags: [role, 'AI Specialist']
  };
}
