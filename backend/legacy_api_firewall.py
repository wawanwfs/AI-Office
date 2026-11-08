"""Fail-closed legacy route firewall for secure-control deployments.

A bearer token cannot make old unscoped routes safe. In opt-in strict mode,
only new per-project /api/v4 routes and health checks are allowed. Gateway
static assets may still render, but legacy APIs, terminal, preview, SSE and
WebSocket are closed pending a project-scoped authenticated replacement.
"""
import re


class LegacyAPIFirewall:
    def __init__(self, app):
        self.app=app

    @staticmethod
    def allowed(scope):
        path=scope.get("path","")
        if scope.get("type")=="websocket":
            # Only the new project-scoped, ticket-authenticated stream is
            # reachable. All legacy sockets remain blocked, including
            # unknown WebSocket routes under /api/v4.
            return bool(re.fullmatch(
                r"/api/v4/projects/[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}/events/ws",
                path))
        if path=="/api/health" and scope.get("method") in ("GET","HEAD"):
            return True
        if path=="/api/v4" or path.startswith("/api/v4/"):
            return True
        # Non-sensitive landing page/static assets are passed through; the
        # existing static server must retain its own allowlist controls.
        return not (path=="/api" or path.startswith("/api/") or
                    path=="/preview" or path.startswith("/preview/") or
                    path=="/ws" or path.startswith("/ws/") or
                    path=="/terminal" or path.startswith("/terminal/"))

    async def __call__(self,scope,receive,send):
        if scope.get("type") not in ("http","websocket") or self.allowed(scope):
            await self.app(scope,receive,send)
            return
        if scope["type"]=="websocket":
            await send({"type":"websocket.close","code":1008,
                        "reason":"project-authenticated websocket unavailable"})
            return
        body=b"Route unavailable in secure project mode"
        await send({"type":"http.response.start","status":404,
                    "headers":[(b"content-type",b"text/plain; charset=utf-8"),
                               (b"content-length",str(len(body)).encode()),
                               (b"cache-control",b"no-store")]})
        await send({"type":"http.response.body","body":body})
