# Disposable WFS Phase 5 full-stack preview proof

This is an **independent demonstration stack**, not an authenticated
multi-tenant project preview manager and NOT a production deployment.

- Frontend: React 19 + Vite built using the repository's pinned npm lockfile.
- Backend: FastAPI in non-root read-only Docker with ephemeral bearer auth.
- Database: real PostgreSQL container connected through private Docker network.
- Streaming: bearer-protected SSE and one-use WebSocket subprotocol ticket.
- Artifacts: authenticated test JSON download; no LLM model credentials.
- Published port: **127.0.0.1:18765** on disposable CI host only.

Execute through GitHub Actions `fullstack-preview-proof` job, which
builds the frontend, starts Compose, verifies real database, HTTP, SSE,
WebSocket, browser screenshot, and always runs `down --volumes`.

The single test bearer is generated in the ephemeral runner; never commit
it, log it or use it on production. Database credentials are disposable,
hardcoded for CI example ONLY. This is not yet an automated arbitrary
React/FastAPI/PostgreSQL project runner or production-safe preview proxy.

Network caveat: PostgreSQL is connected to an internal-only Docker network.
The test FastAPI service additionally joins a loopback-published edge bridge
so the CI host can reach preview HTTP/WS/SSE. The edge bridge is not an
outbound internet firewall. Production preview must have a verified egress
policy and independently authenticated network proxy before exposure.
