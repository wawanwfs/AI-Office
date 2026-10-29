'''
dbg-project — FastAPI service siap staging.

Jalankan lokal:
    pip install fastapi 'uvicorn[standard]'
    uvicorn app.main:app --host 0.0.0.0 --port 8000

Environment variables (secrets di-inject GitHub Actions -> environment staging):
    APP_NAME, APP_ENV, APP_VERSION, GIT_SHA, BUILD_TIME, LOG_LEVEL
    DATABASE_URL (secret, opsional; dicek via TCP di /health)
    API_KEY      (secret, opsional; dipakai endpoint /secure)

Pipeline CI/CD, Dockerfile, dan strategi rollback: lihat komentar di akhir file.
'''

import asyncio
import json
import logging
import os
import socket
import sys
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Konfigurasi & secrets (nilai secret tidak pernah di-log)
# ---------------------------------------------------------------------------
APP_NAME = os.getenv('APP_NAME', 'dbg-project')
APP_ENV = os.getenv('APP_ENV', 'staging')
APP_VERSION = os.getenv('APP_VERSION', '0.1.0')
GIT_SHA = os.getenv('GIT_SHA') or os.getenv('GITHUB_SHA') or 'local'
BUILD_TIME = os.getenv('BUILD_TIME', datetime.now(timezone.utc).isoformat())
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()
DATABASE_URL = os.getenv('DATABASE_URL', '')
API_KEY = os.getenv('API_KEY', '')
START_TIME = time.time()

_RESERVED = {
    'name', 'msg', 'args', 'levelname', 'levelno', 'pathname', 'filename',
    'module', 'exc_info', 'exc_text', 'stack_info', 'lineno', 'funcName',
    'created', 'msecs', 'relativeCreated', 'thread', 'threadName',
    'processName', 'process', 'taskName', 'message', 'asctime',
}


class JsonFormatter(logging.Formatter):
    '''Logging terstruktur: satu event = satu baris JSON ke stdout.'''

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            'ts': datetime.now(timezone.utc).isoformat(timespec='milliseconds'),
            'level': record.levelname,
            'logger': record.name,
            'msg': record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith('_'):
                payload[key] = value
        if record.exc_info:
            payload['exc_info'] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def _setup_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(LOG_LEVEL)
    for name in ('uvicorn', 'uvicorn.error', 'uvicorn.access', 'fastapi'):
        lg = logging.getLogger(name)
        lg.handlers = []
        lg.propagate = True


_setup_logging()
logger = logging.getLogger(APP_NAME)


def _validate_secrets() -> None:
    '''Fail-fast di production, warning di staging.'''
    missing = [n for n, v in (('DATABASE_URL', DATABASE_URL), ('API_KEY', API_KEY)) if not v]
    if not missing:
        return
    if APP_ENV == 'production':
        raise RuntimeError(f'Secrets wajib hilang: {missing}')
    logger.warning('secrets_missing', extra={'event': 'secrets_missing', 'missing': missing})


_validate_secrets()

# ---------------------------------------------------------------------------
# Aplikasi
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info('service_started', extra={
        'event': 'service_started', 'env': APP_ENV,
        'version': APP_VERSION, 'git_sha': GIT_SHA,
    })
    yield
    logger.info('service_stopped', extra={'event': 'service_stopped'})


app = FastAPI(title=APP_NAME, version=APP_VERSION, lifespan=lifespan)


@app.middleware('http')
async def observability_middleware(request: Request, call_next):
    request_id = request.headers.get('x-request-id') or uuid.uuid4().hex
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.error('request_error', extra={
            'event': 'request_error', 'request_id': request_id,
            'method': request.method, 'path': request.url.path,
            'duration_ms': duration_ms,
        }, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={'error': 'internal_server_error', 'request_id': request_id},
        )
    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    response.headers['x-request-id'] = request_id
    logger.info('request_completed', extra={
        'event': 'request_completed', 'request_id': request_id,
        'method': request.method, 'path': request.url.path,
        'status_code': response.status_code, 'duration_ms': duration_ms,
    })
    return response


async def _check_database() -> dict[str, str]:
    if not DATABASE_URL:
        return {'status': 'skipped', 'detail': 'DATABASE_URL not set'}
    parsed = urlparse(DATABASE_URL)
    host = parsed.hostname or 'localhost'
    port = parsed.port or 5432

    def _tcp_ping() -> None:
        with socket.create_connection((host, port), timeout=2.0):
            pass

    try:
        await asyncio.get_running_loop().run_in_executor(None, _tcp_ping)
        return {'status': 'ok', 'host': host}
    except OSError as exc:
        logger.warning('db_check_failed', extra={'event': 'db_check_failed', 'error': str(exc)})
        return {'status': 'error', 'detail': str(exc)}


@app.get('/', tags=['public'])
async def root() -> dict[str, str]:
    return {'service': APP_NAME, 'status': 'running', 'docs': '/docs', 'health': '/health'}


@app.get('/health', tags=['ops'])
async def health() -> JSONResponse:
    '''Health check untuk Docker HEALTHCHECK & deploy gate CI/CD.'''
    db = await _check_database()
    healthy = db['status'] in ('ok', 'skipped')
    body = {
        'status': 'healthy' if healthy else 'unhealthy',
        'app': APP_NAME,
        'env': APP_ENV,
        'version': APP_VERSION,
        'git_sha': GIT_SHA,
        'uptime_seconds': round(time.time() - START_TIME, 1),
        'checks': {'database': db},
    }
    return JSONResponse(status_code=200 if healthy else 503, content=body)


@app.get('/version', tags=['ops'])
async def version() -> dict[str, str]:
    return {
        'app': APP_NAME, 'version': APP_VERSION, 'git_sha': GIT_SHA,
        'build_time': BUILD_TIME, 'env': APP_ENV,
    }


@app.get('/secure', tags=['ops'])
async def secure(x_api_key: str = Header(default='')) -> dict[str, bool]:
    if not API_KEY or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail='invalid or missing API key')
    return {'ok': True}


@app.post('/api/echo', tags=['public'])
async def echo(request: Request) -> dict[str, Any]:
    try:
        payload: Any = await request.json()
    except Exception:
        payload = None
    logger.info('echo_called', extra={'event': 'echo_called', 'payload_type': type(payload).__name__})
    return {'received': payload, 'request_id': request.headers.get('x-request-id', '')}


if __name__ == '__main__':
    import uvicorn

    uvicorn.run('app.main:app', host='0.0.0.0', port=int(os.getenv('PORT', '8000')), log_config=None)

# ===========================================================================
# DELIVERABLE CI/CD — file pendukung (referensi)
# ===========================================================================
#
# requirements.txt:
#     fastapi==0.115.*
#     uvicorn[standard]==0.32.*
#
# requirements-dev.txt:
#     pytest==8.*
#     httpx==0.28.*
#
# tests/test_health.py:
#     from fastapi.testclient import TestClient
#     from app.main import app
#
#     def test_health_ok():
#         with TestClient(app) as client:
#             res = client.get('/health')
#         assert res.status_code == 200
#         assert res.json()['status'] == 'healthy'
#
# Dockerfile:
#     FROM python:3.12-slim
#     WORKDIR /app
#     RUN apt-get update && apt-get install -y --no-install-recommends curl \
#         && rm -rf /var/lib/apt/lists/*
#     COPY requirements.txt .
#     RUN pip install --no-cache-dir -r requirements.txt
#     COPY app ./app
#     ARG APP_VERSION=dev
#     ARG GIT_SHA=local
#     ENV APP_ENV=staging LOG_LEVEL=INFO PORT=8000 APP_VERSION=${APP_VERSION} GIT_SHA=${GIT_SHA}
#     EXPOSE 8000
#     HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
#         CMD curl -fsS http://localhost:8000/health || exit 1
#     CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
#
# docker-compose.yml (di server staging, /srv/dbg):
#     services:
#       app:
#         image: ghcr.io/OWNER/dbg-project:${GIT_SHA:-latest}
#         ports:
#           - '8000:8000'
#         environment:
#           APP_ENV: staging
#           GIT_SHA: ${GIT_SHA}
#           DATABASE_URL: ${DATABASE_URL}
#           API_KEY: ${API_KEY}
#         restart: unless-stopped
#
# .github/workflows/deploy-staging.yml:
#     name: ci-cd-staging
#     on:
#       push:
#         branches: [main]
#     permissions:
#       contents: read
#       packages: write
#     env:
#       IMAGE: ghcr.io/${{ github.repository }}
#     jobs:
#       test:
#         runs-on: ubuntu-latest
#         steps:
#           - uses: actions/checkout@v4
#           - uses: actions/setup-python@v5
#             with:
#               python-version: '3.12'
#           - run: pip install -r requirements.txt -r requirements-dev.txt
#           - run: pytest -q
#       build:
#         needs: test
#         runs-on: ubuntu-latest
#         steps:
#           - uses: actions/checkout@v4
#           - uses: docker/login-action@v3
#             with:
#               registry: ghcr.io
#               username: ${{ github.actor }}
#               password: ${{ secrets.GITHUB_TOKEN }}
#           - uses: docker/build-push-action@v6
#             with:
#               context: .
#               push: true
#               tags: ${{ env.IMAGE }}:${{ github.sha }}
#               build-args: |
#                 APP_VERSION=${{ github.ref_name }}
#                 GIT_SHA=${{ github.sha }}
#       deploy:
#         needs: build
#         runs-on: ubuntu-latest
#         environment: staging
#         steps:
#           - name: deploy + health gate + auto-rollback
#             uses: appleboy/ssh-action@v1
#             with:
#               host: ${{ secrets.STAGING_HOST }}
#               username: ${{ secrets.STAGING_USER }}
#               key: ${{ secrets.STAGING_SSH_KEY }}
#               script: |
#                 set -euo pipefail
#                 cd /srv/dbg
#                 PREV=$(cat current_sha 2>/dev/null || echo unknown)
#                 echo ${{ github.sha }} > next_sha
#                 export GIT_SHA=${{ github.sha }}
#                 export IMAGE=ghcr.io/${{ github.repository }}:${{ github.sha }}
#                 docker compose pull app
#                 docker compose up -d --no-deps app
#                 for i in $(seq 1 30); do
#                   curl -fsS http://localhost:8000/health >/dev/null 2>&1 && break
#                   sleep 2
#                 done
#                 if curl -fsS http://localhost:8000/health | grep -q healthy; then
#                   mv next_sha current_sha
#                   echo deploy_ok sha=${{ github.sha }} prev=$PREV
#                 else
#                   echo health_gate_failed_rolling_back
#                   export GIT_SHA=$PREV
#                   export IMAGE=ghcr.io/${{ github.repository }}:$PREV
#                   docker compose up -d --no-deps app
#                   exit 1
#                 fi
#
# Secrets GitHub (Settings -> Environments -> staging):
#     STAGING_HOST, STAGING_USER, STAGING_SSH_KEY  -> akses server staging
#     DATABASE_URL, API_KEY                        -> runtime secrets container
#     GITHUB_TOKEN                                 -> otomatis (push image ke GHCR)
#
# Strategi rollback:
#     1. Image immutable per GIT_SHA; file current_sha mencatat versi aktif.
#     2. Health gate: deploy sukses hanya jika /health 200 + status healthy.
#     3. Auto-rollback: jika gate gagal, script deploy ulang image $PREV lalu job merah.
#     4. Manual: GIT_SHA=<sha_lama> docker compose up -d app (simpan >= 5 image terakhir di GHCR).
# ===========================================================================
