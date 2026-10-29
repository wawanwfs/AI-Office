"""Endpoints knowledge base per-tenant (admin)."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.knowledge import KnowledgeEntry

router = APIRouter()


class KBIn(BaseModel):
    tenant_id: int
    key: str
    value: str


@router.get("/knowledge")
def list_kb(tenant_id: int, db: Session = Depends(get_db)):
    return [
        {"id": e.id, "key": e.key, "value": e.value, "updated_at": str(e.updated_at)}
        for e in db.query(KnowledgeEntry).filter(KnowledgeEntry.tenant_id == tenant_id).all()
    ]


@router.post("/knowledge")
def upsert_kb(body: KBIn, db: Session = Depends(get_db)):
    e = db.query(KnowledgeEntry).filter(
        KnowledgeEntry.tenant_id == body.tenant_id, KnowledgeEntry.key == body.key).first()
    if e:
        e.value = body.value
    else:
        e = KnowledgeEntry(tenant_id=body.tenant_id, key=body.key, value=body.value)
        db.add(e)
    db.commit()
    return {"id": e.id, "key": e.key, "value": e.value}


@router.delete("/knowledge/{kid}")
def delete_kb(kid: int, db: Session = Depends(get_db)):
    e = db.query(KnowledgeEntry).get(kid)
    if not e:
        raise HTTPException(404, "tidak ada")
    db.delete(e)
    db.commit()
    return {"deleted": kid}
