# WFS PROJECT — Agent Roles

Dokumen hidup. Setiap agent punya: ID, nama, role, deskripsi, model/provider,
system instructions, tools/permissions, status (Idle/Planning/Working/Waiting/
Blocked/Reviewing/Offline), current task, history, output, metrics.

## Role inti (11)

| # | Role | Tanggung jawab inti |
|---|---|---|
| 1 | Project/Product Manager | Terjemahkan instruksi → scope; rencana & milestones; requirements/acceptance; pecah subtask; atur dependency & penugasan; monitor blocker; laporan; eskalasi ke owner |
| 2 | Business Analyst / Solution Architect | Analisis kebutuhan; functional/non-functional requirements; desain arsitektur; kontrak API & data flow; pilih pendekatan teknis; ADR |
| 3 | UI/UX Designer | User journey; layout & IA; design system; spec visual; aksesibilitas desktop+mobile |
| 4 | Frontend Developer | Implementasi UI; halaman/komponen/routing/forms/state; konek ke API; responsive; loading/empty/error state; build + FE tests; tanpa tombol palsu |
| 5 | Backend Developer | Business logic; API/service/validation/auth; data model & migration; integrasi eksternal; error handling; unit+integration tests |
| 6 | Database Engineer | Schema & relasi; migration aman; query/index; transaction; seed; backup/integrity |
| 7 | DevOps / Infra Engineer | Workspace setup; Dockerfile/Compose; dependency/build/runtime; port/routing/health/lifecycle; logs/resource; deployment config |
| 8 | QA / Test Automation | Test plan dari acceptance; unit/integration/e2e; uji API & alur; responsive; lapor bug; cek regression; test report nyata |
| 9 | Code Reviewer / SW Engineer | Kualitas & maintainability; duplikasi/kompleksitas; standar; error/edge; feedback actionable; review sebelum finalisasi |
| 10 | Security Engineer | Auth/authz; injection/XSS/CSRF/SSRF; dependency vuln; secrets; container/network; severity + rekomendasi; tidak klaim lolos tanpa audit nyata |
| 11 | Documentation Engineer | README/setup; arsitektur/API/config/env; cara jalankan; perubahan & known limitations; panduan + troubleshooting |

## Peran tambahan (opsional)

Mobile developer, AI/ML engineer, data engineer, performance engineer, technical writer.

## Aturan

- Semua role tidak harus aktif di tiap proyek — planner memilih role minimal.
- Status agent berasal dari event eksekusi nyata, bukan animasi acak.
- Belum ada provider/kredensial → tampilkan status konfigurasi yang dibutuhkan,
  jangan berpura-pura menjalankan model AI.
- Map ke agent eksekutor existing: pm1/be1/be2/fe1/fe2/mob1/ux1/devops1/qa1/ai-train/integ/mkt1/cs-h/ceo.

## Kolaborasi Agent A & B

- **Agent A (wfs-agent-1)** — Software Architect & Backend Engineer: audit arsitektur;
  backend/API/database; task management & orchestration; agent routing; LLM abstraction;
  sandbox/container; workspace/preview/log/port; auth; backend testing & docs.
- **Agent B (wfs-assist)** — Product Engineer, Frontend & Quality: audit GUI;
  rombak GUI jadi software house; task composer UX; 3 lantai fungsional; agent profiles;
  dashboard projects/file explorer/terminal/preview/log; integrasi frontend-API;
  loading/empty/error; responsive/a11y; e2e & regression.

Kolaborasi wajib: audit bersama, sepakati rencana + kontrak API + data model sebelum
mengembangkan komponen saling bergantung; source of truth sama (task/agent/project/container
status); jangan saling menimpa file tanpa koordinasi; build/test/verifikasi sebelum selesai.
