# WFS PROJECT — AI Software House: Architecture

Status: Fase 1 (Audit) — dokumen hidup, diperbarui seiring implementasi.

## 1. Ringkasan

WFS Project adalah transformasi aplikasi "AI-Office" (kantor virtual 3D isometrik,
React + Three.js + Vite) menjadi **AI Software House operasional**: tempat owner
memberi instruksi lewat GUI, sistem mengubahnya menjadi proyek nyata yang
dikerjakan AI agent (multi-role), dibangun di Docker sandbox per proyek, dan
hasilnya diverifikasi serta diperiksa via preview URL, source code, logs, dan test.

## 2. Stack (existing, dipertahankan)

- Frontend: React 19 + Three.js + Vite 8, vitest + testing-library (1328 test, 114 files).
- Backend: FastAPI (Python), SQLite (tasks.db), httpx untuk LLM calls.
- Proxy/UI: hq_proxy.py menyajikan build statis + proxy `/wfs-api/*`.
- AI: provider abstraction via env (`WFS_AI_BASE/KEY/MODEL`), konfigurasi per-agent.
- Sandbox: skrip `sandbox_exec.py` menargetkan Docker `wfs-agent-*` (Docker belum aktif di VM ini — lihat docs/docker-sandbox.md).

## 3. Komponen inti (eksisting) & status

| Area | File | Status |
|---|---|---|
| API Gateway | backend/server.py | Pertahankan, kembangkan |
| Task Engine | backend/tasks.py | Pertahankan, perlu perluasan data model |
| Proxy+UI | backend/hq_proxy.py | Pertahankan |
| Project API | backend/project_api.py | Pertahankan, perlukas |
| Sandbox exec | backend/sandbox_exec.py | Perlu rewrite → Docker per-proyek |
| GUI komponen | src/components/* | Audit per-komponen (lihat agent-roles) |
| Scene 3D | src/scene/OfficeScene.js | Dipertahankan → dikaitkan ke data nyata |

## 4. Arsitektur target (Fase 2+)

```
GUI (React) ──▸ Backend FastAPI (REST) ──▸ Orchestration Engine
                                                ├─ Planner (task → subtask + dependency)
                                                ├─ Task Scheduler (role routing)
                                                ├─ Agent Registry (role/config/model)
                                                ├─ Execution (LLM provider layer)
                                                ├─ Workspace Manager (/workspaces/{project-id})
                                                ├─ Docker Sandbox (container + port + health)
                                                ├─ Preview Router (URL per proyek)
                                                └─ SQLite/SQL schema (projects, tasks, agents, runs…)
```

Prinsip: **BUILD REAL SOFTWARE** — setiap state berasal dari event nyata, tidak ada
angka hardcoded, tidak ada tombol/mock palsu.

## 5. Data model (target) — perluasan

projects, tasks, subtasks, task_dependencies, agents, agent_roles, agent_runs,
workspaces, container_instances, preview_endpoints, artifacts, test_runs,
build_runs, logs/events, approvals, usage_records.

## 6. Keputusan arsitektur

- ORM/schema: pertahankan SQLite untuk fase awal; buat layer DAO agar bisa pindah
  ke PostgreSQL bila diperlukan (requirement umum "database" per proyek — pindah
  ke PG optional di fase lanjut).
- Kontrak API dipisah per modul (lihat docs/implementation-plan.md).
- Dibantuin.com: hapus total (lihat bagian 7).

## 7. Pembersihan dibantuin.com

Referensi ditemukan di 70 tempat (src + backend). Strategi: hapus kode khusus,
bukan sembunyikan. Detail penghapusan di implementation-plan.md.

## 8. Alur kerja penarget

Owner beri instruksi → Planner analisis → role routing → subtask + dependency →
scheduler → agents eksekusi di workspace/sandbox → integrasi → QA → review →
repair loop → verifikasi → user terima ringkasan + bukti + preview.
