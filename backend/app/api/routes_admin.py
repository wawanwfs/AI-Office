import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Conversation, Message, Tenant

router = APIRouter()


class TenantIn(BaseModel):
    name: str
    slug: str


@router.get("/tenants")
def list_tenants(db: Session = Depends(get_db)):
    return [
        {"id": t.id, "name": t.name, "slug": t.slug, "created_at": str(t.created_at)}
        for t in db.query(Tenant).all()
    ]


@router.post("/tenants")
def create_tenant(body: TenantIn, db: Session = Depends(get_db)):
    if db.query(Tenant).filter(Tenant.slug == body.slug).first():
        raise HTTPException(400, "slug sudah dipakai")
    t = Tenant(name=body.name, slug=body.slug, api_key=secrets.token_hex(24))
    db.add(t)
    db.commit()
    return {"id": t.id, "slug": t.slug, "api_key": t.api_key}


@router.get("/conversations")
def list_conversations(tenant_id: int, db: Session = Depends(get_db)):
    return [
        {"id": c.id, "customer_email": c.customer_email, "status": c.status}
        for c in db.query(Conversation).filter(Conversation.tenant_id == tenant_id).all()
    ]


@router.get("/conversations/{cid}/messages")
def get_messages(cid: int, db: Session = Depends(get_db)):
    return [
        {"id": m.id, "role": m.role, "content": m.content, "created_at": str(m.created_at)}
        for m in db.query(Message).filter(Message.conversation_id == cid).order_by(Message.id).all()
    ]


import os, httpx


class ChatIn(BaseModel):
    tenant_id: int
    message: str
    customer_email: str = "anon"


@router.post("/widget/chat")
async def widget_chat_public(_request: Request, body: ChatIn, db: Session = Depends(get_db)):
    """Chat publik untuk widget embed AI CS (tanpa auth admin; ratelimit tetap jalan)."""
    return await _chat_impl(_request, body, db)


@router.post("/chat")
async def chat(_request: Request, body: ChatIn, db: Session = Depends(get_db)):
    return await _chat_impl(_request, body, db)


async def _chat_impl(_request: Request, body: ChatIn, db: Session):
    """AI CS: simpan percakapan + proxy ke LLM (gateway WFS / default)."""
    from app.core.ratelimit import rate_limit
    rate_limit(_request)
    conv = Conversation(tenant_id=body.tenant_id, customer_email=body.customer_email)
    db.add(conv)
    db.commit()
    db.add(Message(conversation_id=conv.id, role="customer", content=body.message))
    db.commit()

    base = os.environ.get("LLM_BASE_URL", "https://token.lightvela.ai/v1")
    key = os.environ.get("LLM_API_KEY", "")
    model = os.environ.get("LLM_MODEL", "auto")

    # Konteks menu/harga + order dari modul cs_context
    from app.core.cs_context import build_system_prompt
    sys_prompt = build_system_prompt(body.tenant_id, body.message)
    reply = "Maaf, AI sedang tidak tersedia."
    try:
        async with httpx.AsyncClient(timeout=120) as cl:
            r = await cl.post(base.rstrip("/") + "/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={"model": model, "max_tokens": 2000,
                      "messages": [{"role": "system", "content": sys_prompt},
                                   {"role": "user", "content": body.message}]})
            d = r.json()
            msg = d.get("choices", [{}])[0].get("message", {})
            reply = msg.get("content") or msg.get("reasoning_content") or reply
    except Exception as e:
        reply = f"Error: {e}"

    db.add(Message(conversation_id=conv.id, role="ai", content=reply))
    db.commit()
    return {"conversation_id": conv.id, "reply": reply}
