from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import Base, engine
from app.api.routes_admin import router as admin_router
from app.api.routes_auth import router as auth_router, require_auth
from app.api.routes_knowledge import router as knowledge_router
from app.models.knowledge import KnowledgeEntry  # noqa: F401 — pastikan tabel dibuat
from fastapi import Depends

Base.metadata.create_all(bind=engine)

app = FastAPI(title="dibantuin API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "dibantuin", "version": "0.1.0"}


@app.get("/api/admin/stats", dependencies=[Depends(require_auth)])
def admin_stats():
    """Ringkasan untuk dashboard admin: jumlah tenant, conversation, pesan."""
    from app.core.database import SessionLocal
    from app.models.models import Conversation, Message, Tenant
    s = SessionLocal()
    try:
        return {
            "tenants": s.query(Tenant).count(),
            "conversations": s.query(Conversation).count(),
            "messages": s.query(Message).count(),
        }
    finally:
        s.close()


app.include_router(auth_router, prefix="/api/auth", tags=["auth"])

# /api/admin/* → butuh token admin, KECUALI /widget/chat (publik utk iframe AI CS).
# Trik: buang route /widget/chat dari admin_router SEBELUM include, lalu daftarkan
# ulang sebagai route publik terpisah (tanpa dependency require_auth).
_widget_path = "/widget/chat"
admin_router.routes = [r for r in admin_router.routes if getattr(r, "path", "") != _widget_path]
app.include_router(admin_router, prefix="/api/admin", tags=["admin"],
                   dependencies=[Depends(require_auth)])
from fastapi import APIRouter as _AR
_widget_pub = _AR()
from app.api.routes_admin import widget_chat_public as _wcp
_widget_pub.add_api_route(_widget_path, _wcp, methods=["POST"], include_in_schema=False)
app.include_router(_widget_pub, prefix="/api/admin", tags=["widget"])

app.include_router(knowledge_router, prefix="/api/admin", tags=["knowledge"],
                   dependencies=[Depends(require_auth)])
