'''
app/api/dependencies.py — Sistem autentikasi lengkap (FastAPI).

Fitur:
  • Registrasi & login (JWT access + refresh, rotasi refresh token)
  • Logout (pencabutan access & refresh token)
  • Hashing password Argon2id
  • Verifikasi email dasar (link tercetak ke log/console — ganti dengan SMTP di produksi)
  • RBAC sederhana: role 'admin' & 'user' (user pertama otomatis admin terverifikasi)
  • Middleware proteksi route (semua path non-publik wajib Bearer token)
  • Rate limiting in-memory pada endpoint auth
  • Endpoint /me untuk profil user

Dependensi (Python 3.10+):
  pip install fastapi 'uvicorn[standard]' pyjwt argon2-cffi aiosqlite 'pydantic[email]'

Jalankan (buat app/__init__.py dan app/api/__init__.py kosong):
  uvicorn app.api.dependencies:app --reload

Alur cepat:
  1. POST /auth/register              {"email": "a@b.c", "password": "rahasia123"}
  2. GET  /auth/verify-email?token=.. (salin link verifikasi dari log console)
  3. POST /auth/login                 -> {"access_token", "refresh_token"}
  4. GET  /me                         header: Authorization: Bearer <access_token>
  5. POST /auth/refresh               {"refresh_token": "<refresh_token>"}
  6. POST /auth/logout                header Bearer; body opsional {"refresh_token": "..."}

Env opsional: SECRET_KEY, AUTH_DB_PATH, ACCESS_TOKEN_EXPIRE_MINUTES,
REFRESH_TOKEN_EXPIRE_DAYS, EMAIL_TOKEN_EXPIRE_HOURS
'''

from __future__ import annotations

import logging
import os
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator, Callable, Literal

import aiosqlite
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError, VerificationError
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.base import BaseHTTPMiddleware

# --------------------------------------------------------------------------- #
# Konfigurasi
# --------------------------------------------------------------------------- #

SECRET_KEY = os.getenv('SECRET_KEY', 'dev-only-ganti-di-produksi')
ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', '30'))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv('REFRESH_TOKEN_EXPIRE_DAYS', '7'))
EMAIL_TOKEN_EXPIRE_HOURS = int(os.getenv('EMAIL_TOKEN_EXPIRE_HOURS', '24'))
DB_PATH = os.getenv('AUTH_DB_PATH', 'auth.db')

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger('auth')

pwd_hasher = PasswordHasher()
bearer_scheme = HTTPBearer(auto_error=False)

# --------------------------------------------------------------------------- #
# Database (SQLite + aiosqlite)
# --------------------------------------------------------------------------- #

_SCHEMA = '''
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',
    is_verified   INTEGER NOT NULL DEFAULT 0,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS refresh_tokens (
    jti        TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    expires_at REAL NOT NULL,
    revoked    INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS email_tokens (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    expires_at REAL NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS revoked_access (
    jti TEXT PRIMARY KEY,
    exp REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
'''


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(_SCHEMA)
        await db.commit()


async def fetch_one(query: str, params: tuple = ()) -> aiosqlite.Row | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(query, params) as cur:
            return await cur.fetchone()


async def fetch_all(query: str, params: tuple = ()) -> list[aiosqlite.Row]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(query, params) as cur:
            return list(await cur.fetchall())


async def execute(query: str, params: tuple = ()) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(query, params)
        await db.commit()

# --------------------------------------------------------------------------- #
# Hashing password (Argon2id)
# --------------------------------------------------------------------------- #


def hash_password(password: str) -> str:
    return pwd_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return pwd_hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False

# --------------------------------------------------------------------------- #
# JWT (access + refresh)
# --------------------------------------------------------------------------- #


def _create_token(user_id: str, token_type: str, lifetime: timedelta) -> tuple[str, str, float]:
    now = datetime.now(timezone.utc)
    exp = now + lifetime
    jti = uuid.uuid4().hex
    payload = {'sub': user_id, 'type': token_type, 'iat': now, 'exp': exp, 'jti': jti}
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return token, jti, exp.timestamp()


def create_access_token(user_id: str) -> str:
    token, _, _ = _create_token(user_id, 'access', timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    return token


async def create_refresh_token(user_id: str) -> str:
    token, jti, exp = _create_token(user_id, 'refresh', timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
    await execute(
        'INSERT INTO refresh_tokens (jti, user_id, expires_at) VALUES (?, ?, ?)',
        (jti, user_id, exp),
    )
    return token


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'Token kedaluwarsa') from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'Token tidak valid') from exc
    if payload.get('type') != expected_type:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'Tipe token salah')
    return payload


async def revoke_refresh_token(token: str) -> bool:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError:
        return False
    if payload.get('type') != 'refresh':
        return False
    await execute('UPDATE refresh_tokens SET revoked = 1 WHERE jti = ?', (payload['jti'],))
    return True


async def revoke_access_token(payload: dict[str, Any]) -> None:
    await execute(
        'INSERT OR REPLACE INTO revoked_access (jti, exp) VALUES (?, ?)',
        (payload['jti'], float(payload['exp'])),
    )


async def is_access_revoked(jti: str) -> bool:
    return await fetch_one('SELECT 1 FROM revoked_access WHERE jti = ?', (jti,)) is not None

# --------------------------------------------------------------------------- #
# Rate limiting (sliding window in-memory, per-IP per-path)
# --------------------------------------------------------------------------- #

_hits: dict[str, list[float]] = {}


def rate_limit(times: int, window_seconds: int) -> Callable:
    '''Dependency FastAPI: batasi jumlah permintaan per-IP per-path.'''

    async def dependency(request: Request) -> None:
        client = request.client.host if request.client else 'unknown'
        key = f'{client}:{request.url.path}'
        now = time.monotonic()
        recent = [t for t in _hits.get(key, []) if now - t < window_seconds]
        if len(recent) >= times:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                'Terlalu banyak permintaan. Coba lagi nanti.',
                headers={'Retry-After': str(window_seconds)},
            )
        recent.append(now)
        _hits[key] = recent

    return dependency

# --------------------------------------------------------------------------- #
# Skema Pydantic
# --------------------------------------------------------------------------- #


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128, description='Minimal 8 karakter')


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class LogoutIn(BaseModel):
    refresh_token: str | None = None


class ResendVerificationIn(BaseModel):
    email: EmailStr


class RoleIn(BaseModel):
    role: Literal['admin', 'user']


class TokenPairOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = 'bearer'


class UserOut(BaseModel):
    id: str
    email: EmailStr
    role: str
    is_verified: bool
    created_at: datetime

# --------------------------------------------------------------------------- #
# Verifikasi email (demo: link dicetak ke log; ganti dengan SMTP di produksi)
# --------------------------------------------------------------------------- #


async def issue_email_token(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    exp = (datetime.now(timezone.utc) + timedelta(hours=EMAIL_TOKEN_EXPIRE_HOURS)).timestamp()
    await execute(
        'INSERT INTO email_tokens (token, user_id, expires_at) VALUES (?, ?, ?)',
        (token, user_id, exp),
    )
    return token


async def send_verification_email(email: str, token: str) -> None:
    logger.info('[EMAIL] Link verifikasi untuk %s: /auth/verify-email?token=%s', email, token)

# --------------------------------------------------------------------------- #
# Dependencies keamanan: get_current_user & RBAC
# --------------------------------------------------------------------------- #


async def get_current_user(request: Request) -> aiosqlite.Row:
    '''Ambil user dari payload JWT (diisi middleware) atau header Authorization.'''
    payload: dict[str, Any] | None = getattr(request.state, 'jwt_payload', None)
    if payload is None:
        creds: HTTPAuthorizationCredentials | None = await bearer_scheme(request)
        if creds is None:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                'Belum terautentikasi',
                headers={'WWW-Authenticate': 'Bearer'},
            )
        payload = decode_token(creds.credentials, 'access')
        if await is_access_revoked(payload['jti']):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'Token telah dicabut')

    user = await fetch_one('SELECT * FROM users WHERE id = ?', (payload['sub'],))
    if user is None or not user['is_active']:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'User tidak ditemukan atau nonaktif')
    return user


def require_roles(*roles: str) -> Callable:
    '''Dependency RBAC: batasi endpoint hanya untuk role tertentu.'''

    async def dependency(user: aiosqlite.Row = Depends(get_current_user)) -> aiosqlite.Row:
        if user['role'] not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, 'Akses ditolak: role tidak memadai')
        return user

    return dependency


require_admin = require_roles('admin')

# --------------------------------------------------------------------------- #
# Middleware proteksi route
# --------------------------------------------------------------------------- #

PUBLIC_PATHS = {
    '/',
    '/health',
    '/auth/register',
    '/auth/login',
    '/auth/refresh',
    '/auth/verify-email',
    '/auth/resend-verification',
}
PUBLIC_PREFIXES = ('/docs', '/redoc', '/openapi.json', '/assets')


class AuthMiddleware(BaseHTTPMiddleware):
    '''Semua path di luar PUBLIC_* wajib membawa access token (Bearer) yang valid.'''

    async def dispatch(self, request: Request, call_next: Callable):
        if request.method == 'OPTIONS':
            return await call_next(request)

        path = request.url.path
        if path in PUBLIC_PATHS or any(path.startswith(p) for p in PUBLIC_PREFIXES):
            return await call_next(request)

        header = request.headers.get('Authorization', '')
        if not header.startswith('Bearer '):
            return self._deny("Header Authorization wajib: 'Bearer <access_token>'")
        try:
            payload = decode_token(header[7:], 'access')
            if await is_access_revoked(payload['jti']):
                return self._deny('Token telah dicabut (logout)')
        except HTTPException as exc:
            return self._deny(str(exc.detail), status_code=exc.status_code, headers=exc.headers)

        request.state.jwt_payload = payload
        return await call_next(request)

    @staticmethod
    def _deny(detail: str, status_code: int = 401, headers: dict | None = None) -> JSONResponse:
        return JSONResponse(
            status_code=status_code,
            content={'detail': detail},
            headers={'WWW-Authenticate': 'Bearer', **(headers or {})},
        )

# --------------------------------------------------------------------------- #
# Aplikasi
# --------------------------------------------------------------------------- #


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await init_db()
    logger.info('Database auth siap di %s', DB_PATH)
    yield


app = FastAPI(title='Auth API', version='1.0.0', lifespan=lifespan)
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

# --------------------------------------------------------------------------- #
# Endpoint umum
# --------------------------------------------------------------------------- #


@app.get('/', include_in_schema=False)
async def root() -> dict:
    return {'service': 'Auth API', 'docs': '/docs'}


@app.get('/health', include_in_schema=False)
async def health() -> dict:
    return {'status': 'ok'}

# --------------------------------------------------------------------------- #
# Endpoint auth (dengan rate limiting)
# --------------------------------------------------------------------------- #


@app.post(
    '/auth/register',
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit(times=5, window_seconds=60))],
)
async def register(body: RegisterIn) -> dict:
    email = body.email.lower()
    if await fetch_one('SELECT id FROM users WHERE email = ?', (email,)):
        raise HTTPException(status.HTTP_409_CONFLICT, 'Email sudah terdaftar')

    is_first = (await fetch_one('SELECT COUNT(*) AS n FROM users'))['n'] == 0
    user_id = uuid.uuid4().hex
    role = 'admin' if is_first else 'user'
    await execute(
        'INSERT INTO users (id, email, password_hash, role, is_verified, created_at) '
        'VALUES (?, ?, ?, ?, ?, ?)',
        (user_id, email, hash_password(body.password), role, 1 if is_first else 0, time.time()),
    )

    message = 'Registrasi berhasil.'
    if is_first:
        message += ' User pertama otomatis menjadi admin terverifikasi.'
    else:
        token = await issue_email_token(user_id)
        await send_verification_email(email, token)
        message += ' Cek log/console untuk link verifikasi email.'
    return {'id': user_id, 'email': email, 'role': role, 'message': message}


@app.post(
    '/auth/login',
    response_model=TokenPairOut,
    dependencies=[Depends(rate_limit(times=10, window_seconds=60))],
)
async def login(body: LoginIn) -> TokenPairOut:
    user = await fetch_one('SELECT * FROM users WHERE email = ?', (body.email.lower(),))
    if user is None or not verify_password(body.password, user['password_hash']):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'Email atau password salah')
    if not user['is_active']:
        raise HTTPException(status.HTTP_403_FORBIDDEN, 'Akun dinonaktifkan')
    if not user['is_verified']:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            'Email belum diverifikasi. Cek log/console untuk link verifikasi.',
        )

    access = create_access_token(user['id'])
    refresh = await create_refresh_token(user['id'])
    return TokenPairOut(access_token=access, refresh_token=refresh)


@app.post(
    '/auth/refresh',
    response_model=TokenPairOut,
    dependencies=[Depends(rate_limit(times=20, window_seconds=60))],
)
async def refresh(body: RefreshIn) -> TokenPairOut:
    payload = decode_token(body.refresh_token, 'refresh')
    row = await fetch_one('SELECT * FROM refresh_tokens WHERE jti = ?', (payload['jti'],))
    if row is None or row['revoked']:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'Refresh token tidak dikenal atau sudah dicabut')

    user = await fetch_one('SELECT * FROM users WHERE id = ?', (payload['sub'],))
    if user is None or not user['is_active']:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'User tidak valid')

    # Rotasi token: cabut refresh lama, terbitkan pasangan baru.
    await execute('UPDATE refresh_tokens SET revoked = 1 WHERE jti = ?', (payload['jti'],))
    access = create_access_token(user['id'])
    new_refresh = await create_refresh_token(user['id'])
    return TokenPairOut(access_token=access, refresh_token=new_refresh)


@app.post('/auth/logout')
async def logout(
    request: Request,
    body: LogoutIn | None = None,
    _: aiosqlite.Row = Depends(get_current_user),
) -> dict:
    payload = getattr(request.state, 'jwt_payload', None)
    if payload:
        await revoke_access_token(payload)
        await execute('DELETE FROM revoked_access WHERE exp < ?', (time.time(),))
    if body and body.refresh_token:
        await revoke_refresh_token(body.refresh_token)
    return {'detail': 'Logout berhasil. Token telah dicabut.'}


@app.get('/auth/verify-email')
async def verify_email(token: str) -> dict:
    row = await fetch_one('SELECT * FROM email_tokens WHERE token = ?', (token,))
    if row is None or row['used']:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, 'Token verifikasi tidak valid')
    if row['expires_at'] < time.time():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, 'Token verifikasi kedaluwarsa')

    await execute('UPDATE email_tokens SET used = 1 WHERE token = ?', (token,))
    await execute('UPDATE users SET is_verified = 1 WHERE id = ?', (row['user_id'],))
    return {'detail': 'Email berhasil diverifikasi. Silakan login.'}


@app.post(
    '/auth/resend-verification',
    dependencies=[Depends(rate_limit(times=3, window_seconds=300))],
)
async def resend_verification(body: ResendVerificationIn) -> dict:
    user = await fetch_one('SELECT * FROM users WHERE email = ?', (body.email.lower(),))
    if user and not user['is_verified']:
        token = await issue_email_token(user['id'])
        await send_verification_email(user['email'], token)
    # Respons seragam agar tidak membocorkan keberadaan email.
    return {'detail': 'Jika email terdaftar dan belum terverifikasi, link verifikasi telah dikirim.'}

# --------------------------------------------------------------------------- #
# Profil /me
# --------------------------------------------------------------------------- #


@app.get('/me', response_model=UserOut)
async def me(user: aiosqlite.Row = Depends(get_current_user)) -> UserOut:
    return UserOut(
        id=user['id'],
        email=user['email'],
        role=user['role'],
        is_verified=bool(user['is_verified']),
        created_at=datetime.fromtimestamp(user['created_at'], tz=timezone.utc),
    )

# --------------------------------------------------------------------------- #
# RBAC: khusus admin
# --------------------------------------------------------------------------- #


@app.get('/admin/users', dependencies=[Depends(require_admin)])
async def list_users() -> list[dict]:
    rows = await fetch_all(
        'SELECT id, email, role, is_verified, created_at FROM users ORDER BY created_at'
    )
    return [
        {
            'id': r['id'],
            'email': r['email'],
            'role': r['role'],
            'is_verified': bool(r['is_verified']),
            'created_at': datetime.fromtimestamp(r['created_at'], tz=timezone.utc).isoformat(),
        }
        for r in rows
    ]


@app.patch('/admin/users/{user_id}/role')
async def change_role(
    user_id: str,
    body: RoleIn,
    admin: aiosqlite.Row = Depends(require_admin),
) -> dict:
    target = await fetch_one('SELECT id, role FROM users WHERE id = ?', (user_id,))
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'User tidak ditemukan')
    if target['id'] == admin['id'] and body.role != 'admin':
        raise HTTPException(status.HTTP_400_BAD_REQUEST, 'Admin tidak dapat menurunkan role-nya sendiri')
    await execute('UPDATE users SET role = ? WHERE id = ?', (body.role, user_id))
    return {'id': user_id, 'role': body.role, 'detail': 'Role diperbarui'}


if __name__ == '__main__':
    import uvicorn

    uvicorn.run(app, host='0.0.0.0', port=8000)
