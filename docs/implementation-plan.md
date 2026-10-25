# WFS PROJECT — Implementation Plan

Status: Fase 1 (Audit) → Fase 2 (Fondasi). Dokumen hidup.

## Fase 1 — Audit (SEDANG BERJALAN)

- [x] Inventaris backend (server.py, tasks.py, hq_proxy.py, sandbox_exec.py, project_api.py).
- [x] Inventaris frontend (src/components, scene, CSS) — paralel oleh Agent B.
- [x] Deteksi referensi dibantuin.com (70 tempat).
- [x] Cek Docker runtime → **belum aktif di VM init** (blocker sandbox).
- [ ] Verifikasi test suite baseline (1328 lulus).
- [ ] Inventory env vars & konfigurasi.

## Fase 2 — Fondasi (mulai setelah audit)

- [ ] Hapus integrasi dibantuin.com (fokus, aman, migration terkontrol).
- [ ] Struktur navigasi baru (Overview, Projects, AI Office, Tasks, Agents,
      Workspaces, Preview Apps, Testing, Activity, Settings).
- [ ] Core data models (SQLite): projects, tasks, subtasks, agents, runs, events.
- [ ] Task lifecycle & event model (Draft→Planning→Ready→Running→Testing→Review→Completed + Queued/Blocked/Awaiting/Failed/Cancelled/Retrying).
- [ ] Config/env scaffolding (`.env.example`, validasi).

## Fase 3 — Agent Orchestration

- [ ] Agent registry + role config (11 role: PM, BA/Architect, UI/UX, FE, BE, DB, DevOps, QA, Reviewer, Security, Docs).
- [ ] Planner & dependency-aware scheduler.
- [ ] Background execution (task queue persistent, concurrency limit).
- [ ] Execution logs & status persistence.
- [ ] Provider AI abstraction layer (multi-provider, fallback, token tracking).

## Fase 4 — GUI Software House

- [ ] Dashboard owner (angka dari DB/event nyata).
- [ ] Global Task Composer (+ New Project / Give Your Agents a Task).
- [ ] Project workspace (overview, file explorer, task board, assignments, terminal, preview, logs, test, git).
- [ ] Agents dashboard.
- [ ] Visualisasi 3 lantai fungsional (F1 product, F2 engineering, F3 QA/security/delivery).
- [ ] Activity feed + notifikasi.

## Fase 5 — Docker Sandbox (REQUIREMENT INTI)

- [ ] Install/konfigurasi Docker di VM (blocker — perlu aksi).
- [ ] Workspace manager (/workspaces/{project-id}, persistent).
- [ ] Container lifecycle service (provision → build → start → health → stop → logs → cleanup).
- [ ] Dynamic port allocation & preview routing (hindari bentrok).
- [ ] Isolasi & least-privilege (non-root, resource limits, no docker socket mount).
- [ ] Health checks + status jujur (ready/unhealthy/failed).

## Fase 6 — Engineering Workspace

- [ ] Terminal terisolasi per proyek.
- [ ] File explorer.
- [ ] Build/test execution.
- [ ] Git integration (branch/commit/diff/checkpoint).

## Fase 7 — QA, Security & Stabilisasi

- [ ] End-to-end scenarios (A: buat website baru; B: perbaiki bug; C: container gagal; D: restart sistem; E: isolasi sandbox).
- [ ] Periksa semua acceptance criteria.
- [ ] Dokumentasi akhir + laporan.

## Prinsip eksekusi

- Bertahap, jangan tunda sandbox ke tahap tak terdefinisi.
- Jangan berhenti di desain/laporan — implementasi nyata.
- Bundle test + build + preview jujur.
