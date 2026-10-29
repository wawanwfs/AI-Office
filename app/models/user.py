'''
app/models/user.py

Sistem autentikasi lengkap berbasis FastAPI:
- Registrasi & login (JWT access + refresh token)
- Logout (pencabutan refresh token) & refresh token dengan rotasi
- Hashing password Argon2id
- Verifikasi email dasar (token sekali pakai; pengiriman email di-stub ke log)
- RBAC sederhana (admin/user)
- Middleware proteksi route (/me, /admin/*)
- Rate limiting in-memory pada endpoint /auth/*
- Endpoint /me untuk profil user

Instalasi & menjalankan:
    pip install fastapi uvicorn sqlalchemy pyjwt argon2-cffi pydantic email-validator
    uvicorn app.models.user:app --reload

Akun admin seed (dibuat otomatis saat start):
    admin@example.com / admin12345  (override via env ADMIN_EMAIL / ADMIN_PASSWORD)
'''

from __future__ import annotations

import hashlib
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import Boolean, DateTime, Integer, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

# ---------------------------------------------------------------------------
# Konfigurasi
# ---------------------------------------------------------------------------

SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-change-me')
JWT_ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7
EMAIL_TOKEN_EXPIRE_HOURS = 24
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./auth.db')

# Prefix route yang wajib membawa Bearer token (dijaga oleh middleware).
PROTECTED_PREFIXES = ('/me', '/admin')

# ---------------------------------------------------------------------------
# Utilitas: waktu & hashing password (Argon2id)
# ---------------------------------------------------------------------------


def utcnow() -> datetime:
    '''UTC naive agar konsisten disimpan dan dibandingkan di SQLite.'''
    return datetime.now(timezone.utc).replace(tzinfo=None)


_password_hasher = PasswordHasher()  # default: argon2id
_DUMMY_HASH = _password_hasher.hash('dummy-password-for-timing-equality')


def hash_password(plain: str) -> str:
    return _password_hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _password_hasher.verify(hashed, plain)
    except (VerifyMismatchError, InvalidHashError):
        return False

# ---------------------------------------------------------------------------
# Database (SQLAlchemy)
# ---------------------------------------------------------------------------

engine = create_engine(
    DATABASE_URL,
    connect_args={'check_same_thread': False} if DATABASE_URL.startswith('sqlite') else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), default='', nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default='user', nullable=False)  # admin | user
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class RefreshTokenRecord(Base):
    '''Catatan refresh token agar bisa dicabut (logout) dan dirotasi.'''
    __tablename__ = 'refresh_tokens'

    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class EmailVerificationToken(Base):
    '''Token verifikasi email sekali pakai (disimpan sebagai hash SHA-256).'''
    __tablename__ = 'email_verification_tokens'

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

# ---------------------------------------------------------------------------
# Skema Pydantic
# ---------------------------------------------------------------------------


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(default='', max_length=255)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class RoleUpdate(BaseModel):
    role: Literal['admin', 'user']


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = 'bearer'
    expires_in: int  # detik


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    is_verified: bool
    created_at: datetime

# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------


def _encode_token(subject: str, token_type: str, expires_delta: timedelta, extra: dict | None = None) -> tuple[str, str]:
    jti = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    payload = {
        'sub': subject,
        'type': token_type,
        'iat': int(now.timestamp()),
        'exp': int((now + expires_delta).timestamp()),
        'jti': jti,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM), jti


def create_access_token(user_id: int, role: str) -> str:
    token, _ = _encode_token(str(user_id), 'access', timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES), {'role': role})
    return token


def create_refresh_token(user_id: int) -> tuple[str, str, datetime]:
    token, jti = _encode_token(str(user_id), 'refresh', timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
    return token, jti, utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)


def decode_token(token: str, expected_type: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Token kedaluwarsa')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Token tidak valid')
    if payload.get('type') != expected_type:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Tipe token tidak sesuai')
    return payload

# ---------------------------------------------------------------------------
# Rate limiter (sliding window, in-memory per proses)
# ---------------------------------------------------------------------------


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: int) -> None:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > window_seconds:
                hits.popleft()
            if len(hits) >= limit:
                retry_after = max(1, int(window_seconds - (now - hits[0])) + 1)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f'Terlalu banyak permintaan. Coba lagi dalam {retry_after} detik.',
                    headers={'Retry-After': str(retry_after)},
                )
            hits.append(now)


rate_limiter = RateLimiter()


def rate_limit(bucket: str, limit: int, window_seconds: int):
    '''Dependency rate limit per IP untuk endpoint auth.'''
    def dependency(request: Request) -> None:
        client_ip = request.client.host if request.client else 'unknown'
        rate_limiter.check(f'{bucket}:{client_ip}', limit, window_seconds)
    return dependency

# ---------------------------------------------------------------------------
# Email (stub)
# ---------------------------------------------------------------------------


def send_verification_email(to_email: str, raw_token: str) -> None:
    '''Stub pengiriman email. Ganti dengan SMTP/provider sungguhan di produksi.'''
    link = f'http://localhost:8000/auth/verify-email?token={raw_token}'
    print(f'[EMAIL] Tautan verifikasi untuk {to_email}: {link}')

# ---------------------------------------------------------------------------
# Dependencies: DB, user saat ini, RBAC
# ---------------------------------------------------------------------------


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


_bearer = HTTPBearer(auto_error=False)


def get_current_user(request: Request, credentials=Depends(_bearer), db: Session = Depends(get_db)) -> User:
    token = credentials.credentials if credentials else getattr(request.state, 'access_token', None)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Belum terautentikasi',
            headers={'WWW-Authenticate': 'Bearer'},
        )
    payload = decode_token(token, 'access')
    user = db.get(User, int(payload['sub']))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='User tidak ditemukan atau nonaktif')
    return user


def require_roles(*roles: str):
    '''Dependency RBAC: batasi endpoint untuk peran tertentu.'''
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Akses ditolak: peran tidak memadai')
        return user
    return dependency

# ---------------------------------------------------------------------------
# Lifespan: buat tabel + seed admin
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        admin_email = os.getenv('ADMIN_EMAIL', 'admin@example.com')
        admin_password = os.getenv('ADMIN_PASSWORD', 'admin12345')
        if db.scalar(select(User).where(User.email == admin_email)) is None:
            db.add(User(
                email=admin_email,
                full_name='Administrator',
                hashed_password=hash_password(admin_password),
                role='admin',
                is_active=True,
                is_verified=True,
            ))
            db.commit()
            print(f'[SEED] Akun admin dibuat: {admin_email} / {admin_password}')
    yield


app = FastAPI(title='Auth API', version='1.0.0', lifespan=lifespan)


# ---------------------------------------------------------------------------
# Middleware proteksi route (/me, /admin/*)
# ---------------------------------------------------------------------------


@app.middleware('http')
async def route_protection_middleware(request: Request, call_next):
    path = request.url.path
    if any(path == p or path.startswith(p + '/') for p in PROTECTED_PREFIXES):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={'detail': 'Belum terautentikasi'},
                headers={'WWW-Authenticate': 'Bearer'},
            )
        token = auth_header[len('Bearer '):].strip()
        try:
            jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])  # validasi tanda tangan + exp
        except jwt.ExpiredSignatureError:
            return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={'detail': 'Token kedaluwarsa'})
        except jwt.InvalidTokenError:
            return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={'detail': 'Token tidak valid'})
        request.state.access_token = token
    return await call_next(request)

# ---------------------------------------------------------------------------
# Endpoint meta
# ---------------------------------------------------------------------------


@app.get('/', tags=['meta'])
def root():
    return {'service': 'auth-api', 'status': 'ok'}

# ---------------------------------------------------------------------------
# Endpoint auth
# ---------------------------------------------------------------------------


@app.post('/auth/register', response_model=UserOut, status_code=status.HTTP_201_CREATED, tags=['auth'],
          dependencies=[Depends(rate_limit('register', limit=5, window_seconds=60))])
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Email sudah terdaftar')

    user = User(email=email, full_name=body.full_name, hashed_password=hash_password(body.password), role='user')
    db.add(user)
    db.flush()  # dapatkan user.id

    raw_token = secrets.token_urlsafe(32)
    db.add(EmailVerificationToken(
        token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
        user_id=user.id,
        expires_at=utcnow() + timedelta(hours=EMAIL_TOKEN_EXPIRE_HOURS),
    ))
    db.commit()
    db.refresh(user)

    send_verification_email(user.email, raw_token)
    return user


@app.get('/auth/verify-email', tags=['auth'],
         dependencies=[Depends(rate_limit('verify', limit=10, window_seconds=60))])
def verify_email(token: str, db: Session = Depends(get_db)):
    record = db.get(EmailVerificationToken, hashlib.sha256(token.encode()).hexdigest())
    if record is None or record.used or record.expires_at < utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Token verifikasi tidak valid atau kedaluwarsa')
    user = db.get(User, record.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='User tidak ditemukan')

    user.is_verified = True
    record.used = True
    db.commit()
    return {'detail': 'Email berhasil diverifikasi. Silakan login.'}


@app.post('/auth/login', response_model=TokenResponse, tags=['auth'],
          dependencies=[Depends(rate_limit('login', limit=5, window_seconds=60))])
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    # Password selalu diverifikasi (dummy hash bila user tidak ada) untuk menyetarakan
    # waktu respons dan mencegah user enumeration.
    password_ok = verify_password(body.password, user.hashed_password if user else _DUMMY_HASH)
    if user is None or not password_ok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Email atau password salah')
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Akun dinonaktifkan')
    if not user.is_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Email belum diverifikasi. Cek email Anda untuk tautan verifikasi.')

    access_token = create_access_token(user.id, user.role)
    refresh_token, jti, expires_at = create_refresh_token(user.id)
    db.add(RefreshTokenRecord(jti=jti, user_id=user.id, expires_at=expires_at))
    db.commit()
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60)


@app.post('/auth/refresh', response_model=TokenResponse, tags=['auth'],
          dependencies=[Depends(rate_limit('refresh', limit=10, window_seconds=60))])
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    payload = decode_token(body.refresh_token, 'refresh')
    record = db.get(RefreshTokenRecord, payload['jti'])
    if record is None or record.revoked or record.expires_at < utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Refresh token tidak valid atau sudah dicabut')

    user = db.get(User, int(payload['sub']))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='User tidak ditemukan atau nonaktif')

    # Rotasi refresh token: cabut yang lama, terbitkan yang baru.
    record.revoked = True
    access_token = create_access_token(user.id, user.role)
    new_refresh, new_jti, new_exp = create_refresh_token(user.id)
    db.add(RefreshTokenRecord(jti=new_jti, user_id=user.id, expires_at=new_exp))
    db.commit()
    return TokenResponse(access_token=access_token, refresh_token=new_refresh, expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60)


@app.post('/auth/logout', tags=['auth'],
          dependencies=[Depends(rate_limit('logout', limit=10, window_seconds=60))])
def logout(body: LogoutRequest, db: Session = Depends(get_db)):
    '''Cabut refresh token. Access token tersisa akan kedaluwarsa sendiri (masa hidup singkat).'''
    try:
        payload = decode_token(body.refresh_token, 'refresh')
    except HTTPException:
        # Jangan bocorkan validitas token; logout tetap dianggap sukses.
        return {'detail': 'Logout berhasil'}
    record = db.get(RefreshTokenRecord, payload['jti'])
    if record is not None and not record.revoked:
        record.revoked = True
        db.commit()
    return {'detail': 'Logout berhasil'}

# ---------------------------------------------------------------------------
# Profil user (dilindungi middleware + dependency)
# ---------------------------------------------------------------------------


@app.get('/me', response_model=UserOut, tags=['users'])
def me(user: User = Depends(get_current_user)):
    return user

# ---------------------------------------------------------------------------
# Endpoint admin (RBAC: role=admin)
# ---------------------------------------------------------------------------


@app.get('/admin/users', response_model=list[UserOut], tags=['admin'])
def list_users(_: User = Depends(require_roles('admin')), db: Session = Depends(get_db)):
    return list(db.scalars(select(User).order_by(User.id)).all())


@app.patch('/admin/users/{user_id}/role', response_model=UserOut, tags=['admin'])
def set_role(user_id: int, body: RoleUpdate, admin: User = Depends(require_roles('admin')), db: Session = Depends(get_db)):
    if user_id == admin.id and body.role != 'admin':
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Tidak dapat menurunkan peran akun sendiri')
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='User tidak ditemukan')
    user.role = body.role
    db.commit()
    db.refresh(user)
    return user


if __name__ == '__main__':
    import uvicorn

    uvicorn.run(app, host='0.0.0.0', port=8000)
