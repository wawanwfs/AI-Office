from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.core.database import Base


class KnowledgeEntry(Base):
    """Entri knowledge base per tenant: menu, FAQ, info penting."""
    __tablename__ = "knowledge_entries"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    key = Column(String(100), nullable=False)       # mis: menu, faq_1, jam_buka
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
