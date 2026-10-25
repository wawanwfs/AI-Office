# WFS PROJECT — Implementation Plan

Status: Fase 1 (Audit) → Fase 2 (Fondasi). Dokumen hidup.

## Fase 1 — Audit (SEDANG BERJALAN)

- [x] Inventaris backend (server.py, tasks.py, hq_proxy.py, sandbox_exec.py, project_api.py).
- [x] Inventaris frontend (src/components, scene, CSS) — paralel oleh Agent B.
- [x] Deteksi referensi dibantuin.com (70 tempat).
- [x] Cek Docker runtime → **belum aktif di VM ini** (blocker sandbox).
- [x] Verifikasi test suite baseline (1328 lulus).
- [x] Inventory env vars & konfigurasi → `.env.example` dibuat.

## Fase 2 — Fondasi (mulai setelah audit)

- [ ] Hapus integrasi dibantuin.com (fokus, aman, migration terkontrol).
- [ ] Struktur navigasi baru (Overview, Projects, AI Office, Tasks, Agents,
      Workspaces, Preview Apps, Testing, Activity, Settings).
- [x] Core data models (SQLite): projects, tasks, subtasks, agents, runs, events
      (`backend/database.py`, 12 role terserd di 3 lantai). Test `backend/test_database.py` (4 pass).
- [x] API overview nyata (`GET /api/sh/overview`) — angka dari SQLite utk dashboard owner.
- [ ] Task lifecycle & event model (Draft→Planning→Ready→Running→Testing→Review→Completed + Queued/Blocked/Awaiting/Failed/Cancelled/Retrying).
- [x] Config/env scaffolding (`.env.example` dibuat di root).

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

- [x] Install/konfigurasi Docker di VM (engine aktif, user masuk grup docker; verifikasi container nyata sukses).
- [ ] Workspace manager (/workspaces/{project-id}, persistent) — dasar scaffold sudah ada di `docker_sandbox.py`.
- [x] Container lifecycle service (provision → build → start → health → stop → logs → cleanup) — `docker_sandbox.py`, teruji dengan demo-project.
- [x] Dynamic port allocation & preview routing (hindari bentrok) — `allocate_port()` 3100-3900 + loopback mapping.
- [x] Isolasi & least-privilege (non-root, resource limits, no docker socket mount) — `--memory=512m --cpus=1.0 --pids-limit=100`, port loopback, tanpa mount docker.sock.
- [x] Health checks + status jujur (ready/unhealthy/failed) — HTTP health check 200 pada start_container.
- [ ] Integrasi dengan GUI + endpoint API (create project → scaffold → start → preview URL).

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
