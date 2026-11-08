"""Read-only, project-scoped inspection proxy for approved loopback previews.

No Docker import, no arbitrary upstream URL, DNS lookup, user-controlled
port or insecure redirect. Deliberately forbids WebSocket, write methods
and live SSE until separately verified.
"""
from contextlib import closing
from pathlib import Path
import re
import sqlite3

import httpx
from project_rbac import ident


class PreviewProxyUnavailable(PermissionError):
    pass


_SAFE_ASSET = re.compile(r"[A-Za-z0-9_./-]{1,180}\Z")
_SAFE_TOKEN = re.compile(r"[A-Za-z0-9_-]{32,128}\Z")
_CONTENT_TYPES = {
    "text/html", "text/plain", "text/css", "application/javascript",
    "text/javascript", "application/json", "image/png", "image/jpeg",
    "image/webp", "image/gif", "font/woff2",
}
_MAX_RESPONSE = 2 * 1024 * 1024


class PreviewRegistryReader:
    """Read-only SQLite lookup: no Docker privileges and no DB writes."""

    def __init__(self, registry_path):
        path = Path(registry_path).absolute()
        if path.is_symlink() or not path.is_file() or path.resolve() != path:
            raise PreviewProxyUnavailable("operator preview registry unavailable")
        self.uri = path.as_uri() + "?mode=ro"

    def port(self, project_id):
        project_id = ident(project_id)
        try:
            with closing(sqlite3.connect(self.uri, uri=True, timeout=2)) as db:
                db.execute("PRAGMA query_only=ON")
                row = db.execute(
                    "SELECT port, phase FROM wfs_preview_instances WHERE project_id=?",
                    (project_id,),
                ).fetchone()
        except sqlite3.Error as exc:
            raise PreviewProxyUnavailable("operator registry not readable") from exc
        if not row or row[1] != "running":
            raise PreviewProxyUnavailable("preview not running or not approved")
        port = row[0]
        if isinstance(port, bool) or not isinstance(port, int) or not 19000 <= port <= 22000:
            raise PreviewProxyUnavailable("operator registry port out of range")
        return port


class AuthenticatedPreviewRead:
    """Bounded inspected response, not a full interactive browser proxy."""

    def __init__(self, registry, *, token_for_project=None, client_factory=None):
        if not isinstance(registry, PreviewRegistryReader):
            raise TypeError("read-only approved registry required")
        self.registry = registry
        self.token_for_project = token_for_project
        self.client_factory = client_factory or (
            lambda: httpx.AsyncClient(timeout=10, trust_env=False, follow_redirects=False)
        )

    @staticmethod
    def _asset_path(path):
        if path in ("", "index.html"):
            return ""
        if (not isinstance(path, str) or not _SAFE_ASSET.fullmatch(path) or
                "\\" in path or "//" in path or
                any(part in ("", ".", "..") or part.startswith(".")
                    for part in path.split("/"))):
            raise PreviewProxyUnavailable("unsafe preview asset path")
        if path in ("api/health", "api/db"):
            return path
        if path.startswith("assets/") and len(path.split("/")) <= 4:
            return path
        raise PreviewProxyUnavailable("unapproved preview endpoint")

    async def fetch(self, project_id, path):
        asset = self._asset_path(path)
        port = self.registry.port(project_id)
        headers = {"Accept": "*/*"}
        if asset == "api/db":
            if not callable(self.token_for_project):
                raise PreviewProxyUnavailable("project upstream credential not provisioned")
            secret = self.token_for_project(project_id)
            if not isinstance(secret, str) or not _SAFE_TOKEN.fullmatch(secret):
                raise PreviewProxyUnavailable("invalid project upstream credential")
            headers["Authorization"] = "Bearer " + secret
        # Never forward user browser Authorization, cookies, Host, query or
        # fragments. No caller-controlled upstream host or DNS resolution.
        url = f"http://127.0.0.1:{port}/" + asset
        try:
            async with self.client_factory() as client:
                async with client.stream("GET", url, headers=headers) as response:
                    if response.status_code not in (200, 404):
                        raise PreviewProxyUnavailable("preview upstream rejected request")
                    content_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
                    if content_type not in _CONTENT_TYPES:
                        raise PreviewProxyUnavailable("unapproved preview content type")
                    body = bytearray()
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        body.extend(chunk)
                        if len(body) > _MAX_RESPONSE:
                            raise PreviewProxyUnavailable("preview response exceeds 2MiB")
                    return {
                        "status": response.status_code,
                        "body": bytes(body),
                        "content_type": content_type,
                        "headers": {
                            "Cache-Control": "no-store",
                            "X-Content-Type-Options": "nosniff",
                            "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
                            "Referrer-Policy": "no-referrer",
                            "X-Frame-Options": "DENY",
                        },
                    }
        except (httpx.HTTPError, TimeoutError) as exc:
            raise PreviewProxyUnavailable("preview upstream not reachable") from exc
