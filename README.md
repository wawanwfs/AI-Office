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


## Phase 11 — Verified source staging and locally durable reviewer epoch

The operator preview now builds from an exact private, project-specific,
manifest-verified staging tree, never directly from mutable source paths.
An automated CI regression mutates the original API file during a real
Docker Compose build and verifies that the staged context stays intact.
The local operator SQLite registry records a monotonic reviewer policy
epoch and hash, rejecting old correctly signed policy replay or
same-epoch policy substitution. **This is not OS-immutable storage,
independent signed reviewer authority, or protection from deleting the
registry / malicious same-UID staging writers.**

- [Phase 11 scoped REA](docs/REA_PHASE11.md)
- [Phase 11 operator runbook](docs/PHASE11_RUNTIME_RUNBOOK.md)
- [Phase 12 continuation](docs/NEXT_PHASE12_PROMPT.md)

Full OCI/SBOM provenance, authoritative DNS firewall tests, interactive
public TLS preview, paid-provider approval and production acceptance
remain blocked.


## Phase 12 — independently signed reviewer roster

Preview admission now requires **two different Ed25519 signers**: a reviewer
for the approved v2 manifest and a separately pinned offline roster root
for the allowlist/revocation policy. The exact roster JSON bytes must match
both their independently provisioned SHA-256 and a detached root signature;
a rehashed fake roster cannot authorize a manager. Native Windows/Linux
tests and disposable two-tenant CI use **synthetic one-time identities**
for assurance only, NOT a production authority.

- [Phase 12 acceptance gates](docs/REA_PHASE12.md)
- [Phase 12 operator runbook](docs/PHASE12_RUNTIME_RUNBOOK.md)
- [Phase 13 continuation prompt](docs/NEXT_PHASE13_PROMPT.md)

External identity/custody verification, hardware anti-rollback,
truly immutable Docker build context, fully verified OCI dependencies,
DNS/firewall, generic generated-code admission and interactive TLS previews
remain unproven. Paid AI and production deployment stay BLOCKED.


## Phase 13 — real internal Docker DNS rebinding regression

The disposable two-tenant Docker operator now validates **actual UDP
authoritative DNS answers** from a separate internal-only DNS sidecar.
Each API container checks alternating A/AAAA responses and attempts
network connections to metadata and public IPv4/IPv6 addresses; all
must be blocked. Unlike the historical Phase 9 monkeypatch simulation,
this Phase 13 gate exchanges real DNS packets with a running container.

**Scope:** Docker-internal controlled test only; no claim of an external
authoritative DNS provider, host firewall, rootless daemon, Windows/WSL2
egress certification, or full OS-enforced immutable build contexts.
Source admission remains approved fixed-template-only; no paid AI or
production changes.

- [Phase 13 scoped acceptance evidence](docs/REA_PHASE13.md)
- [Phase 13 disposable DNS runbook](docs/PHASE13_RUNTIME_RUNBOOK.md)
- [Next Phase 14 execution prompt](docs/NEXT_PHASE14_PROMPT.md)


## Phase 14 — independent witness-signed reviewer checkpoint

A third, distinct Ed25519 **witness** now signs an exact policy SHA256,
reviewer-roster root fingerprint and epoch checkpoint. The operator
must provide an independently verified latest receipt SHA256 and pinned
witness public-key fingerprint in addition to all previous manifest and
roster signatures. Manager/CLI operations fail closed if witness evidence
is missing, stale, forged, untrusted or modified, before Docker execution.

Native Windows/Linux tests exercise tampered signatures and **a real
SQLite registry backup/restore**: an old correctly signed policy is
rejected after restore when the independently pinned newest witness
checkpoint remains current. CI's three signing identities are
**synthetic**; this is not an actual external transparency log, hardware
counter or proof of real organizational custody. Full immutable Docker,
external authoritative DNS/host firewall, TLS multi-tenant and offline
signed OCI provenance remain P0 and are **not** claimed ready.

- [Phase 14 bounded REA](docs/REA_PHASE14.md)
- [Phase 14 operator witness guide](docs/PHASE14_RUNTIME_RUNBOOK.md)
- [Phase 15 continuation](docs/NEXT_PHASE15_PROMPT.md)


## Phase 15 — signed Merkle history proof for reviewer checkpoints

The fixed reviewed Docker preview operator now requires a separately
signed, independently pinned **Merkle tree head** and complete ordered
receipt inventory. The Phase 14 witness receipt must be the latest
leaf; the new tree must match a separately archived previous size/root
when the trusted prefix is not empty. All manager operations re-verify
the head signature, four signer identities, latest-leaf inclusion and
trusted-prefix consistency before touching Docker.

Native Linux/Windows and real two-tenant Docker CI use FOUR **synthetic**
temporary Ed25519 keys. Tests reject replayed receipts after SQLite
restores, forged/forked/altered inventories, wrong signing keys and
tampered Merkle history. **This is a bounded full-leaf verifier,
not an actually hosted append-only log, real external key custody,
non-equivocation or a production distributed trust service.**

- [Phase 15 scoped REA](docs/REA_PHASE15.md)
- [Phase 15 operator signed-log runbook](docs/PHASE15_RUNTIME_RUNBOOK.md)
- [Phase 16 continuation](docs/NEXT_PHASE16_PROMPT.md)

Actual external transparency and cross-host gossip, OS immutable
staging, signed offline OCI builds, real host/DNS firewall acceptance,
generated-source QA, public HTTPS tenant previews and billable provider
authorization all remain blocked.


## Phase 16 — Compact RFC6962 inclusion and consistency proof (bounded)

The fixed reviewed local Docker preview now verifies an extra,
**mandatory compact RFC6962 Merkle audit and prefix consistency proof**
against the independently signed, pinned Phase 15 head and separately
archived prior root. Compact inclusion verification uses the current
witness-receipt digest directly and does not depend on the full leaf
inventory. Existing Phase 15 full-inventory verification remains active
for defense in depth; proofs cannot self-authorize new head/root pins.

Native Windows/Linux Python tests and the two real disposable Docker
tenant stacks use synthetic test authorities only. The scope is **offline
cryptographic verification**, NOT an independently operated public
transparency service, non-equivocation/freshness monitor, trusted
third-party reviewer custody, immutable builder, public preview or
production deployment. AI provider execution remains unauthorized.

- [Phase 16 scoped acceptance gates](docs/REA_PHASE16.md)
- [Phase 16 compact proof operator runbook](docs/PHASE16_RUNTIME_RUNBOOK.md)
- [Phase 17 accelerated continuation prompt](docs/NEXT_PHASE17_PROMPT.md)


## Phase 17 — authenticated local reference transparency HTTP log

A disposable, single-writer reference log now provides **real loopback
HTTP** authenticated append (tree-size/root compare-and-swap), a
revalidated and `fsync`'d JSONL journal, domain-separated
Ed25519-signed Merkle heads, and real RFC6962 compact inclusion and
consistency endpoints. Native Linux/Windows tests launch a separate
HTTP process and two independent verifying Python processes on one
CI machine, exercise restart/corruption/replay/fork denial, and check
compatibility with the existing Phase 15/16 trust verifier.

**Important:** this is **NOT** a physically immutable log, external
organization/host, HTTPS public service, signed revocation authority,
independent signing-key custody or production approval. Existing
source/Docker admission remains unchanged; full external transparency,
OS immutable builders, signed offline OCI and public multi-tenant
previews remain blocked. No provider spend or production deployment.

- [Phase 17 scoped acceptance report](docs/REA_PHASE17.md)
- [Phase 17 Windows/Linux local reference log runbook](docs/PHASE17_RUNTIME_RUNBOOK.md)
- [Next Phase 18 accelerated execution prompt](docs/NEXT_PHASE18_PROMPT.md)


## Phase 18 — real pinned HTTPS signed-head gossip (two test processes)

The existing Phase 17 loopback reference log now supports an optional
TLS 1.2+ transport with operator-provisioned certificate/private key.
A new fail-closed HTTPS monitor and operator CLI independently pin
**each** TLS leaf DER SHA256, CA trust chain, the Ed25519 log signer,
and an earlier Merkle tree size/root. It checks real server
certificates/hostnames, verifies both signed RFC6962 heads and compact
prefix proofs, and blocks same-size forks, replay/rollback, offline
servers and lagging replicas. Bearers are read from private environment
variables; no automatic pin discovery or HTTP downgrade is permitted.

Linux, Windows-native and disposable Docker-operator CI exercise
**two real TLS processes** with different certificates and journals,
including malicious same-signer fork and rollback after restart.
**Both processes run on one CI host.** This is not an externally
operated or independently witnessed transparency service, mTLS,
tamper-proof WORM storage, external freshness or production approval.
The owner-run monitor is not wired to preview manager admission
without real independent operator trust.

- [Phase 18 bounded REA](docs/REA_PHASE18.md)
- [Phase 18 private Windows/Linux TLS + gossip runbook](docs/PHASE18_RUNTIME_RUNBOOK.md)
- [Phase 19 accelerated next prompt](docs/NEXT_PHASE19_PROMPT.md)

OS-immutable builder isolation, fully signed offline supply chain,
real external DNS/host firewall, generated-source QA, tenant HTTPS
production previews and billed AI provider activation remain blocked.


## Phase 19 — Linux kernel-sealed, reviewed Docker build input

A real Linux BuildKit proof now constructs an allowlisted `Dockerfile.api`
and `api.py` tar **only from the already signed and independently
reviewed operator snapshot**. The operator rehashes exact source file
bytes and freezes the tar using kernel `memfd` write/grow/shrink/seal
operations before streaming the tar directly into `docker build`.
A separate same-UID process is unable to overwrite the sealed file
descriptor. The disposable Docker CI integration then actively changes
the staging source while building and verifies the resulting image still
contains the original reviewed API SHA256.

**Limitation:** this is currently an *additional tested build pathway*;
the normal Compose preview still rebuilds from its mutable staged
directory. A privileged Docker daemon, independently authorized
rootless builder principal, actual Windows Docker Desktop/WSL2 mount
semantics, offline OCI image provenance, and cross-host external
review authority remain unproven. Windows explicitly rejects unsealed
fallback rather than claiming equivalent Linux protection.

- [Phase 19 narrowly scoped REA](docs/REA_PHASE19.md)
- [Phase 19 Linux/Windows operator runbook](docs/PHASE19_RUNTIME_RUNBOOK.md)
- [Phase 20 next integration prompt](docs/NEXT_PHASE20_PROMPT.md)

No production deployment, private organizational keys, generic
generated Dockerfiles or billable AI execution are activated.


## Phase 20 — image-only sealed Docker Compose operator

The real operator CLI now prepares the fixed, **signed and reviewed**
disposable API image using the Linux kernel-sealed BuildKit tar from
Phase19, records its exact **local engine image ID** (sha256:...), and
derives a fixed image-only runtime Compose config from the signed source.
A second kernel-sealed memfd streams the runtime YAML to docker compose
stdin. The operator starts only with **--no-build --pull never**, never
by asking Compose to rebuild API from a writable staging directory.

Real CI deliberately modifies both original and staged API source
during startup and inspects the **actual launched Docker container**
image ID across two tenants. Windows refuses Linux-sealing fallback.
Legacy injected unit-test runners preserve historical mock behavior;
they are not a production security mode.

Critical: local Docker image ID is NOT an independently signed OCI
registry digest; Docker daemon and SQLite remain trusted. Existing
ingress.py and frontend dist host bind mounts are still writable
by a hostile same-UID host actor. Rootless/UID-separated builder,
Windows Docker Desktop/WSL2 validation, registry provenance,
full offline transitive locks, external log independence and production
authorization remain unfinished.

- [Phase 20 scoped REA](docs/REA_PHASE20.md)
- [Phase 20 Windows/Linux runtime runbook](docs/PHASE20_RUNTIME_RUNBOOK.md)
- [Next Phase 21 execution prompt](docs/NEXT_PHASE21_PROMPT.md)


## Phase 21 — ingress image sealed and no host ingress bind (bounded)

The hardened operator now generates a **fixed** Dockerfile from the
previously reviewed digest-pinned Python base and the SHA256-reviewed
`ingress.py`, freezes both inside a Linux kernel-sealed BuildKit tar,
and resolves the built ingress to its exact local engine image ID.
Runtime Compose is derived from signed bytes, pins both API **and**
ingress local image IDs with `pull_policy: never`, and removes the
ingress source host bind. Two-tenant CI inspects real ingress image IDs,
confirms no `/app/ingress.py` bind mount, and requests authenticated
HTTP during hostile changes to live and staged ingress.py.

**Security boundary still open:** the frontend dist remains host-bound,
the Docker daemon and SQLite are trusted, local engine IDs are **not**
signed OCI registry manifest digests, and true rootless separate-UID
host / external WORM / Windows Docker Desktop tests are missing. No
public preview, production approval or paid AI is introduced.

- [Phase 21 scoped gate](docs/REA_PHASE21.md)
- [Phase 21 operator runbook](docs/PHASE21_RUNTIME_RUNBOOK.md)
- [Next Phase 22 implementation prompt](docs/NEXT_PHASE22_PROMPT.md)
