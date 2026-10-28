# Runtime layout follow-up

Base: `4309628`, isolated `fix/runtime-layout` worktree. No ShConsole source/tests changed or run.

## Changes and evidence

- Ticker chip inherited marquee span padding/26px line-height, exceeding the fixed 26px strip; absolute positioning let the moving track run behind it. Use a flex chip and a separate overflow-clipped marquee window; scope message styling to track children.
- Mobile toast's 76px bottom offset intersected the wrapped dock (up to 120px high, 18px bottom inset). Reserve separate vertical bands for dock, paused HUD and toast. The paused label is now visible at 390x844.
- Real-browser regression checks failed before fixes: chip containment/track separation failed on both sizes; mobile toast overlapped HUD and dock. After the ticker change, only the toast assertions still failed. Final run passes all checks.
- Production build passed. Vitest excluding sibling-owned `**/shconsole*`: **167 files, 2235 tests passed**; existing environment warnings remain. No backend source changed.
- Adapted `/home/agentuser/.hermes/cache/scratch/runtime_verify.py` into `runtime_layout_verify.py`, retaining actual copied backend, isolated HOME, persisted paused task state and loopback listeners. No API interception. Status HTTP 200, zero recorded JS/HTTP errors at 1440x900 and 390x844. Temporary listeners 18787/19513 were removed after each run.
- Evidence: `/home/agentuser/.hermes/cache/scratch/runtime-layout/{desktop,mobile}.{png,json}`; logs `runtime-layout-{red,header,green,tests,build}.log` in scratch. Both final screenshots inspected with vision: connection chip readable, separate from marquee; mobile toast/HUD/dock no longer overlap. Intentional marquee edge cropping remains. Minor pre-existing desktop floor-selector/ticker crowding and mobile HUD rightmost control clipping remain, outside the two targeted regressions.
- Committed reusable runner: `scripts/test_runtime_layout.py`, with geometry checks in `scripts/check_runtime_layout.py`. Its independent execution passed; evidence directory `runtime-layout-ju9rmwyh` in scratch.

Reproduce after `npm run build` (Python environment needs backend requirements, uvicorn and Playwright):

```sh
CHROMIUM_EXECUTABLE=/home/agentuser/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome \
 /home/agentuser/.hermes/cache/scratch/bvenv/bin/python scripts/test_runtime_layout.py
```

**All successful screenshot evidence deliberately disables WebGL. It verifies fallback layout, not 3D rendering.** Prior software-WebGL compositor hangs remain unresolved; actual GPU/browser 3D acceptance remains required.

## Private, supervised deployment proposal — NOT APPLIED

Read-only host observations: `VM-1-133-ubuntu`, user `agentuser` (uid 1002), user linger enabled. No 8787/9503 listeners; static-only 127.0.0.1:9510 PID 2158852, cwd `/home/agentuser/AI-Office`. No AI Office user service found; system unit names matching `*office*`/`*hq*` absent (not an exhaustive service-content audit). Tailscale interface address observed: 100.107.132.63. No service, firewall, live state, listener or worker changes were made.

Recommended access is **loopback only plus SSH forwarding**, not wildcard or unauthenticated public/Tailscale binding. Explicitly approve the release and state migration before proceeding:

1. Prepare a pinned release under `/home/agentuser/ai-office-releases/<approved-commit>` and a dedicated venv at `/home/agentuser/.venvs/ai-office`. Install backend runtime dependencies including uvicorn; build assets into that release's `backend/static`. Do not use the mismatched hardcoded `scripts/deploy.py` destination. Never reuse the scratch test HOME as production.
2. Back up and inventory existing `backend/tasks.db`, `backend/orders.db`, `~/wfs-projects/wfs_software_house.db`, config and project paths. Decide explicitly whether to migrate them or provision fresh state. Tasks/orders DBs are module-relative; they are not redirected just by HOME. Importing tasks to set paused is a state write requiring approval. Ensure the approved release's task DB is paused **before** server startup, and check it again via API before enabling access. Do not call resume endpoints.
3. After approval, create two **user systemd units**, with the following service properties (substitute the same approved release path everywhere):

```ini
# ai-office-api.service
[Unit]
Description=AI Office API (loopback)
[Service]
Type=simple
WorkingDirectory=/home/agentuser/ai-office-releases/<approved-commit>/backend
Environment=HOME=/home/agentuser
ExecStart=/home/agentuser/.venvs/ai-office/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8787
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
[Install]
WantedBy=default.target
```

```ini
# ai-office-ui.service
[Unit]
Description=AI Office same-origin UI (loopback)
Requires=ai-office-api.service
After=ai-office-api.service
[Service]
Type=simple
WorkingDirectory=/home/agentuser/ai-office-releases/<approved-commit>/backend
Environment=HOME=/home/agentuser
ExecStart=/home/agentuser/.venvs/ai-office/bin/python -c "import hq_proxy,os,socketserver; hq_proxy.GATEWAY='http://127.0.0.1:8787/api/'; os.chdir('static'); socketserver.ThreadingTCPServer.allow_reuse_address=True; socketserver.ThreadingTCPServer(('127.0.0.1',9503),hq_proxy.H).serve_forever()"
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
[Install]
WantedBy=default.target
```

The proxy command deliberately avoids the script entrypoint's wildcard bind/backend cwd. Both processes need a writable backend directory for current module-relative DB/token behavior; do not add `ProtectSystem=strict` without designing explicit state directories first. Do not grant Docker group access merely to make startup pass. Worker/Docker execution is a separate authorization step.

4. After authorization only: daemon-reload, start units, inspect journal and exact bindings, verify `/wfs-api/status`, `/wfs-api/tasks/paused`, static asset responses and fresh paused state. If any listener is wildcard-bound, stop only these new units and investigate. Keep 9510 untouched until an explicitly approved retirement.
5. Client access: `ssh -N -L 9503:127.0.0.1:9503 agentuser@100.107.132.63`, then `http://127.0.0.1:9503`. Restrict SSH/Tailscale ACLs to authorized operators; loopback binding is network containment, not application authentication.
6. Verify desktop/mobile interactions and actual 3D on a GPU-capable client. Only after acceptance enable units for login-independent startup (linger already enabled). Rollback: stop the two new units, restore the previous approved release/state backup if migrated; never resume workers automatically.

These unit definitions are a reviewed proposal, **not installed or service-tested**. Production credentials/providers, database migrations, task execution and real 3D remain unverified.
