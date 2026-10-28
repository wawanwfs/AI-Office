# Runtime investigation (2026-10-28)

## Verified deployment state

- Initial read-only `ss -ltnp` showed no listeners on 8787 (gateway) or 9503 (HQ proxy). HTTP probes to both were refused.
- PID 2158852 serves `dist` using Python's static-only HTTP server on **127.0.0.1:9510**, cwd `/home/agentuser/AI-Office`.
- Browser requests to `/wfs-api/status`, `/wfs-api/tasks`, `/wfs-api/tasks/paused`, `/wfs-api/agents`, and `/wfs-api/system/resources` all return 404 there. This is not a functioning full-stack deployment.
- No AI Office user service appeared in `systemctl --user list-unit-files`; no failed user units were listed. This does not establish whether a system-level service exists.

## Reproduced and fixed startup failure

A fresh checkout's `import server` raised `RuntimeError: Directory .../backend/static does not exist`. The UI build directory is ignored, so API startup depended on an undocumented manual directory creation.

The gateway now starts without built assets and returns an explicit HTTP 503 UI-build diagnostic for frontend requests. API routes remain available. When `static/index.html` exists, normal static serving is preserved. Regression tests run a copied backend with isolated HOME and SQLite state, exercise real TestClient lifespan, check `/api/status`, missing UI diagnostics, and built UI serving.

This is not a diagnosis of why the former production daemons exited: their exit logs were not available in the inspected state.

## Actual browser evidence and limits

Playwright Chromium visited the existing static server, without API interception or mock responses, at 1440x900 and 390x844. With WebGL explicitly disabled, both rendered the UI-only fallback and accurately showed Gateway offline. Captured DOM/network JSON and screenshots:

- `/home/agentuser/.hermes/cache/scratch/runtime-evidence/desktop.json`
- `/home/agentuser/.hermes/cache/scratch/runtime-evidence/desktop.png`
- `/home/agentuser/.hermes/cache/scratch/runtime-evidence/mobile.json`
- `/home/agentuser/.hermes/cache/scratch/runtime-evidence/mobile.png`
- Probe: `/home/agentuser/.hermes/cache/scratch/runtime_probe.py`

Screenshots were inspected: shell is not blank; status text overlaps/clips, particularly on mobile; bottom mobile toolbar is crowded. These are existing deployed assets, not proof of this branch's full-stack UI.

**3D verification remains incomplete.** Three software-WebGL screenshot attempts timed out (font/compositor waits) despite successful navigation and observed API 404 responses. Disabling WebGL produced reliable desktop/mobile evidence, but cannot establish scene correctness or identify a scene-code fault. No fabricated successful 3D/API claim is justified.

## Remaining deployment blockers

1. Provision/restart a supervised gateway and same-origin proxy through an authorized deployment step. Do not use the static-only 9510 server as proof of API health.
2. Build and deploy frontend assets to the directory actually served by the proxy; `hq_proxy.py` changes cwd to backend, not dist. Existing `scripts/deploy.py` hardcodes a different checkout and destination.
3. Both script entrypoints currently bind 0.0.0.0; use explicit loopback/private binding before any deployment. This investigation did not start them or open ports.
4. Verify actual 3D rendering on a functioning GPU/browser and verify desktop/mobile interactions against real deployed APIs.
5. Keep task execution paused. No worker was resumed and no task/approval write was submitted.

## Test evidence

- `runtime-evidence/startup-red.txt`: original clean-checkout startup regression failure.
- `runtime-evidence/backend-tests.txt`: backend suite (final run includes built/unbuilt variants).
- `runtime-evidence/frontend-tests.txt`: 167 files, 2251 tests passed; existing jsdom canvas/navigation warnings remain.

No changes to ProjectWorkspaceModal, package manifests, live credentials, service configuration, or existing listeners.

## Resumed verification on stage 1/2 main

Rebased only the runtime commit onto `3704396`; rewritten runtime commit is `fdd189f`. The ordinary pull attempted to replay an already-integrated UI commit and conflicted; it was aborted, then the runtime-only range was rebased. No main or sibling worktree edits.

Built this branch successfully and ran its actual backend and HQ proxy from a scratch copy with isolated HOME/database, empty project state, and task engine paused. Temporary listeners were loopback-only (18787/19513), terminated afterward. No API interception or mocked backend: `/wfs-api/status` returned HTTP 200 and actual host resource readings. This is an isolated integration test, **not a live deployment** or validation of configured AI providers/Docker execution.

New evidence: `/home/agentuser/.hermes/cache/scratch/runtime-resumed/{desktop,mobile}.{png,json}`, `api.log`, `proxy.log`; harness: `/home/agentuser/.hermes/cache/scratch/runtime_verify.py`. Chromium screenshots at 1440x900 and 390x844 were visually inspected. Both show the UI-only fallback, synchronized API data, no uncaught page errors, and no HTTP error responses. Desktop visibly shows paused; mobile DOM reports paused but that label is not clearly visible. Header ticker clipping and mobile toast obstruction remain. WebGL was deliberately disabled for these successful captures.

A real software-WebGL attempt initialized one canvas without JS/HTTP errors but screenshot/compositor capture hung until the 180-second outer deadline. **3D rendering remains unverified**, not fixed. Temporary listeners were absent after termination. Existing 9510 static service was untouched.

Validation: backend suite 120 passed plus 4 subtests (one existing warning); expanded startup cases (missing directory, empty directory, built index) separately passed 3/3. Production Vite build passed. Frontend suite: 2266 passed, 2 failed in existing `shconsole.test.jsx` workspace-loader tests after rebase onto stage 1/2. These failures are in sibling-owned UI work and were not edited. Full logs are in `runtime-resumed/*-tests.log`.

Deployment additionally requires installing backend runtime dependencies including `uvicorn` (absent in the test venv before this run), an authorized supervisor configuration with explicit private binding and correct static asset cwd, and real GPU/browser verification. Keep workers paused; do not treat these empty-database integration results as production readiness.
