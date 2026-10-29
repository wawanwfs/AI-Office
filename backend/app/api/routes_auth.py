"""Auth admin: login JWT + dependency protect."""
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter()

ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASSWORD", "wfs-admin-2026")
bearer = HTTPBearer(auto_error=False)


class LoginIn(BaseModel):
    username: str
    password: str


def _token(username: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=12)
    return jwt.encode({"sub": username, "exp": exp}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


@router.post("/login")
def login(body: LoginIn):
    if body.username != ADMIN_USER or body.password != ADMIN_PASS:
        raise HTTPException(401, "username/password salah")
    return {"access_token": _token(body.username), "token_type": "bearer", "expires_in": 43200}


def require_auth(cred: HTTPAuthorizationCredentials = Depends(bearer)) -> str:
    if cred is None:
        raise HTTPException(401, "token hilang")
    try:
        payload = jwt.decode(cred.credentials, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload.get("sub", "")
    except JWTError:
        raise HTTPException(401, "token tidak valid / expired")
