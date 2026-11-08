<p align="center">
  <img src="public/wfs-logo.svg" width="360" alt="WFS Project" />
</p>

<h1 align="center">WFS AI Office</h1>
<p align="center"><strong>Kantor virtual 3D tempat tim agent AI bekerja, ngobrol, rapat, dan mengerjakan task nyata.</strong></p>
<p align="center">Dibuat oleh <a href="https://github.com/wawanwfs">Wahyu Fajar Setiawan</a> · WFS Project</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react" />
  <img src="https://img.shields.io/badge/Three.js-0.183-black?style=flat-square&logo=threedotjs" />
  <img src="https://img.shields.io/badge/Vite-8-646cff?style=flat-square&logo=vite" />
  <img src="https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" />
  [![CI](https://github.com/wawanwfs/AI-Office/actions/workflows/ci.yml/badge.svg)](https://github.com/wawanwfs/AI-Office/actions/workflows/ci.yml)
</p>

---

## Apa ini?

WFS AI Office adalah dashboard operasional software house **WFS Project** dalam bentuk diorama 3D isometrik.
Setiap agent AI punya peran (PM, Frontend, Backend, QA, DevOps, Marketing, AI Customer Service, dst.), meja,
layar yang hidup, dan perilaku sendiri. Mereka duduk, berjalan, saling menghampiri, dan berdialog sesuai profesi.

Yang membedakan dari sekadar animasi: **UI terhubung ke backend nyata**.

| Fitur | Keterangan |
|---|---|
| Kantor 3D | Dinding kantor, logo WFS Project, zona Dev Desk / Meeting / Lounge / Café / Server, siang-malam, mode neon |
| Karakter per role | Kulit, tinggi, aksesori berbeda (kacamata, hijab, topi, headphone, blazer, dll.) |
| Interaksi antar role | Agent menghampiri rekan dan bertukar dialog sesuai profesi |
| Papan Task | Daftar task nyata, filter, cari, detail ulasan QA, jalankan dengan konfirmasi |
| Task engine | Multi-call JSON, QA otomatis + retry, bukti uji, file hasil |
| Jeda / Lanjut | Tombol nyata ke backend (jeda menolak eksekusi dengan HTTP 409) |
| Chat agent | Percakapan nyata per agent lewat gateway OpenAI-compatible |
| Widget AI CS | Widget embed untuk toko, dengan riwayat per tenant |
| Responsif | Dock bawah tunggal, panel jadi bottom-sheet di HP, kamera adaptif portrait |

## Arsitektur dan status snapshot

```text
Browser (React + Three.js, Vite)
    ├── /                 → Landing (lazy workspace entry)
    └── /app/?mode=...    → Dashboard / Full AI Office
                │
           same-origin API
                │
backend_live/wfs_hq_server.py  → HQ gateway / reverse proxy
                │
backend_live/wfs_server.py     → FastAPI task engine :8787
    ├── wfs_tasks.py, wfs_orders.py
    ├── wfs_api_service.py, wfs_sh_console.py
    └── backend/database.py, backend/sandbox_exec.py
```

File `backend_live/wfs_*.py` merupakan sumber superset yang diuji CI.
Snapshot ini **tidak** berisi `backend/server.py` atau `backend/hq_proxy.py`
sebagai entrypoint siap pakai. Nama tersebut masih digunakan di lingkungan
deployment tersendiri. Beberapa skrip deployment bergantung pada path absolut,
Docker host, konfigurasi API, dan service lain; **jangan menganggap clone
repository langsung merupakan full-stack production deployment**.

## Menjalankan dan memverifikasi

### Frontend (Windows PowerShell, Linux, macOS)

```sh
npm ci
npm test
npm run build
npm run dev
```

Akses alamat lokal yang dicetak Vite, biasanya `http://localhost:5173/`.
Landing tetap dapat dibuka tanpa backend; operasi agent/task memerlukan
gateway yang dikonfigurasi dan terkoneksi. Endpoint API tidak otomatis
dipalsukan ketika backend belum tersedia.

### Pengujian backend (Python 3.11)

Windows PowerShell:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-pytest.txt
python -m pytest backend_live backend -q
```

Linux/macOS:

```sh
python3.11 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-pytest.txt
python -m pytest backend_live backend -q
```

Untuk audit integrasi yang membutuhkan host live, lihat
[mode audit CI](docs/ci-audit-execution.md). Untuk risiko dan pekerjaan
lanjutan lihat [laporan audit 2026-11-08](docs/AUDIT_2026-11-08.md).
Jangan menyimpan key API di source maupun mem-publish Docker socket.

## Phase 7 continuation — fail-closed recovery and reviewed Docker input

Local operator recovery now attaches uncertain brief receipts ONLY to
existing matching project tasks and queue jobs, without generating a second
paid job. Preview operators provide approved SHA-256 digests for Compose,
Dockerfile, API and ingress sources; Docker refuses altered input.
Billed provider worker URL/port/path/proxy policies are also stricter.

Read the updated [Phase 7 REA](docs/REA_PHASE7.md),
[operator runbook](docs/PHASE7_RUNTIME_RUNBOOK.md), and
[Phase 8 handoff](docs/NEXT_PHASE8_PROMPT.md).
No official paid AI call, general AI-built preview or production deployment
was performed.


## Phase 7 — Real preview RBAC, Docker egress and Windows recovery

The Phase 7 secure project panel now inspects **real** QA manifests,
approved read-only preview health and owner invoice discrepancy reports.
An opt-in /api/v4 read-only proxy checks project RBAC and an operator
registry; no Docker credential is provided to the public gateway.
Two disposable fullstack templates run behind a pinned nonroot TCP ingress:
database and application join only internal networks, preserving
WebSocket/SSE while actual Docker tests reject direct external IPv4 traffic.
Windows native CI also verifies SQLite WAL/create-only backup and restore.

**Boundaries:** no authorized paid AI provider generation, no verified
official invoice, no arbitrary generated-app preview admission, no public
interactive proxy, no production daemon approval, no full Windows/Linux
cleanroom Docker Desktop installation or rollback. Production was untouched.

- [Phase 7 REA and acceptance matrix](docs/REA_PHASE7.md)
- [Phase 7 Windows/Linux operator runbook](docs/PHASE7_RUNTIME_RUNBOOK.md)
- [Phase 8 handoff](docs/NEXT_PHASE8_PROMPT.md)

## Phase 6 — Authenticated Briefs, Real Coding QA & Operator Preview

**Implemented / tested:** A user may submit a scoped Python coding brief
from the secure panel, creating a persisted task and durable queue job after
bearer authentication, project permission and approved spending checks.
A hashed SQLite idempotency receipt blocks duplicates on network retries.
The CI end-to-end test runs the **actual** legacy task engine through a
separate Master Worker, real Docker unittest QA, and content-checked artifact
download for two independent projects. Actual generated **synthetic source
files** and test files are attached to CI evidence.

A worker-only OpenAI-compatible SSE billing adapter records final provider
usage and fails closed on uncertain output; its provider tests use mocks.
An operator-only template-preview manager launches/restarts/cleans two real
React/FastAPI/PostgreSQL Compose stacks with independent ports and tokens.

**Not yet supported:** a real paid-provider code-generation acceptance test
(the CI model is an offline deterministic fixture), every paid route metered,
arbitrary AI-generated fullstack preview deployment, a public authenticated
reverse proxy, production daemon isolation or tested Windows/Linux cutover.
Production remains untouched; no provider account was billed.

- [Phase 6 REA and acceptance matrix](docs/REA_PHASE6.md)
- [Phase 6 Windows/Linux operator and backup runbook](docs/PHASE6_RUNTIME_RUNBOOK.md)
- [Phase 7 next implementation prompt](docs/NEXT_PHASE7_PROMPT.md)

## Phase 5 — Verified Python QA, Authenticated Streams & Disposable Fullstack

Phase 5 validates **real Docker-based Python code QA**, per-attempt SHA-256
artifact attestation, bounded worker output and cleanup on cancellation;
**scoped bearer-authenticated** project control/SSE/WebSocket; and **two**
disposable React/Vite + FastAPI + PostgreSQL preview stacks using separate
Docker Compose projects, loopback ports and tokens in GitHub Actions.

A separate, explicitly approved worker can process limited Python coding
roles. The public HTTP gateway has **no Docker socket**; older unscoped APIs
remain denied in strict mode. Added offline WAL-aware SQLite snapshots and
create-only restore, with tamper/integrity tests. These are safety and
rehearsal building blocks, **not** general-purpose production multi-tenant
project deployment or live paid-provider validation.

- [Phase 5 REA and measurable gates](docs/REA_PHASE5.md)
- [Windows/Linux validation and recovery runbook](docs/PHASE5_RUNTIME_RUNBOOK.md)
- [Phase 6 activation implementation prompt](docs/NEXT_PHASE6_PROMPT.md)

## Phase 4 — Isolated execution and secure project control

Phase 4 adds **ContextVar-isolated per-attempt worker workspaces**, bounded
parallel job slots, fail-closed paid retry quarantine, deny-by-default scoped
bearer-token `/api/v4` routes, and a separately executed Docker test runner.
A real GitHub Actions Docker runtime test exercises non-root, read-only,
no-network project isolation and cleanup. These are production-oriented
components, **not** confirmation that the entire platform is production-ready.

Read the [Phase 4 REA matrix](docs/REA_PHASE4.md),
[runtime setup and safety runbook](docs/PHASE4_RUNTIME_RUNBOOK.md),
and [next Phase 5 implementation handoff](docs/NEXT_PHASE5_PROMPT.md).
The legacy engine, authenticated full-stack preview, production deployment
and complete per-project authorization still have P0 blockers.

## Pengembangan Phase 3 — guarded integration

Phase 3 adds an **opt-in** separate Master Queue worker, per-project RBAC
and transactional AI token/cost ledger. The hardened gateway compose removes
host Docker socket, host networking and provider secret mounts; strict mode
blocks unmetered legacy execution/chat. It is **not a drop-in production
deployment** until separate worker, metered chat, container sandbox and
backup/rollback rehearsal are complete.

See [Phase 3 REA and acceptance gates](docs/REA_PHASE3.md),
[Phase 4 handoff](docs/NEXT_PHASE4_PROMPT.md) and the
[Phase 2 queue contracts](docs/master-queue-phase2.md). Browser Actions
generate desktop/mobile screenshots of the frontend and WebGL fallback;
the CI browser may report "Gateway offline" and does not validate live APIs.

## Pengembangan Phase 2

Antrean persisten (belum terhubung ke worker produksi) tersedia di
`backend/master_queue.py`. Fitur ini dimulai paused dan hanya menyimpan
metadata job, bukan mengeksekusi task atau memakai API berbayar.

Lihat [matriks REA Phase 2](docs/REA_PHASE2.md) dan
[panduan Master Queue](docs/master-queue-phase2.md) untuk hasil verifikasi,
keterbatasan produksi dan tahapan integrasi yang aman.

## Struktur repo

```
src/scene/OfficeScene.js   scene 3D (kantor, karakter, perilaku)
src/components/            Dock, HUD, Papan Task, Chat, Statistik, Log, dll.
src/lib/api.js             klien API + token otomatis
backend/                   database & sandbox (unit test)
backend_live/              superset gateway & task engine (uji CI)
docs/                      catatan arsitektur, audit & changelog
DEV_LOG.md                 log pengembangan harian
```

## Kontrol

Drag untuk memutar · Scroll / pinch untuk zoom · Tap agent untuk fokus · Slider waktu siang-malam · Tombol Neon untuk mode cyberpunk · Esc menutup panel.

## Lisensi & atribusi

MIT. Fondasi visualisasi isometrik awal berasal dari proyek MIT *ai-office* karya Gaurav Mishra;
sejak itu kantor, karakter, dinding, UI, backend, task engine, dan seluruh fitur operasional dibangun ulang
dan dikembangkan oleh WFS Project. Hak cipta asli dipertahankan di `LICENSE` sesuai ketentuan MIT.


## Phase 9 — Offline reviewer signature & scoped Docker egress proof

The local disposable preview operator CLI now requires a detached Ed25519
signature over its exact v2 source/asset/lock/SBOM/image admission manifest,
plus an out-of-band pinned reviewer public-key fingerprint. The signing
private key is NEVER provisioned to this repo, CI, or Docker worker.
Programmatic manager internals still require an explicitly trusted caller;
signature enforcement is currently **CLI-only**.

Two disposable multi-tenant Docker API containers undergo direct public
IPv4/IPv6 TCP and metadata connection denials, proxy-environment checks,
a deliberately simulated DNS rebound, and real Docker network membership
inspection. **Simulated rebinding is not an authoritative DNS firewall test.**

- [Phase 9 narrow REA gates](docs/REA_PHASE9.md)
- [Phase 9 local operator signing/runtime runbook](docs/PHASE9_RUNTIME_RUNBOOK.md)
- [Next Phase 10 implementation prompt](docs/NEXT_PHASE10_PROMPT.md)

No real provider integration, arbitrary user source execution, production
deployment, or independently verified invoice reconciliation is claimed.


## Phase 10 — Signed manager trust policy & scoped offline wheelhouse

Every known `TemplatePreviewManager` entry now requires a signed v2
reviewed manifest plus an independently pinned reviewer-allowlist policy.
Policy revocation/edits and signature changes deny subsequent reservations,
status, transitions and Docker commands. The disposable CI two-stack
proof uses an **ephemeral synthetic signer** (not external approval).
The new CI job demonstrates SHA256 hash-locked `--no-index` installation
and tamper rejection for **only** the preview crypto Python dependency
slice — not a production offline container build or independent provenance.

- [Phase 10 narrow REA](docs/REA_PHASE10.md)
- [Phase 10 Windows/Linux operator runbook](docs/PHASE10_RUNTIME_RUNBOOK.md)
- [Next Phase 11 execution prompt](docs/NEXT_PHASE11_PROMPT.md)

The generic untrusted-code preview, public interactive TLS gateway,
complete OCI/JS/Python supply chain, paid AI authorization and production
hardening remain blocked.
