"""
dibantuin — AI CS SaaS multi-tenant
app/models/__init__.py

Model PostgreSQL (SQLAlchemy 2.0 async: Mapped/mapped_column).
Semua entity business mewarisi TenantMixin -> kolom tenant_id (FK tenants.id)
+ composite index per-model, sehingga row-level filtering multi-tenant
dilakukan tenant middleware (app/core/tenant.py) yang meng-inject
request.state.tenant_id lalu menscope semua query.

Peta skeleton lengkap project:
    app/
      api/          -> routers: health.py, auth.py (register/login/refresh),
                       conversations.py, knowledge.py, orders.py
      core/         -> config.py (pydantic-settings), security.py (JWT + passlib),
                       tenant.py (TenantMiddleware: subdomain / X-Tenant-ID),
                       deps.py (get_db, get_current_user, require_roles)
      models/       -> file ini (Base + semua model)
      services/     -> auth_service.py, conversation_service.py, rag_service.py, ...
      main.py       -> create_app(): FastAPI + CORS + TenantMiddleware + routers
    alembic/        -> migrasi async (alembic init -t async; target_metadata = Base.metadata)
    scripts/seed.py -> wrapper: `python -m app.models` (seed 2 tenant dummy)
    Dockerfile, docker-compose.yml (api + postgres:16 + redis:7)

Quick start:
    docker compose up -d postgres redis
    alembic upgrade head          # atau biarkan seed membuat tabel
    python -m app.models          # seed 2 tenant dummy + data contoh
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

__all__ = [
    "Base",
    "TimestampMixin",
    "TenantMixin",
    "Tenant",
    "User",
    "Conversation",
    "Message",
    "KnowledgeDocument",
    "OrderRecord",
    "UserRole",
    "TenantPlan",
    "ConversationStatus",
    "MessageSender",
    "KnowledgeDocStatus",
    "OrderStatus",
    "tenant_scoped",
]


# --------------------------------------------------------------------------- #
# Base & mixin
# --------------------------------------------------------------------------- #


class Base(DeclarativeBase):
    """Declarative base untuk async engine (asyncpg). Alembic: target_metadata = Base.metadata."""


def gen_uuid() -> uuid.UUID:
    return uuid.uuid4()


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class TenantMixin:
    """
    WAJIB untuk semua entity business (row-level multi-tenant).

    - Kolom `tenant_id` FK -> tenants.id (ON DELETE CASCADE).
    - TIDAK diberi index tunggal; setiap model mendefinisikan composite index
      berawalan tenant_id di __table_args__ (lihat masing-masing model).
    - Filtering dilakukan middleware/deps: setiap query bisnis menyertakan
      `tenant_scoped(Model, request.state.tenant_id)`, atau otomatis via
      session event `do_orm_execute` di app/core/tenant.py.
    """

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )


def tenant_scoped(model: type[TenantMixin], tenant_id: uuid.UUID):
    """Kondisi WHERE tenant_id = :tenant_id untuk row-level filtering."""
    return model.tenant_id == tenant_id


# --------------------------------------------------------------------------- #
# Enumerasi
# --------------------------------------------------------------------------- #


class UserRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    AGENT = "agent"


class TenantPlan(str, enum.Enum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class ConversationStatus(str, enum.Enum):
    OPEN = "open"
    PENDING = "pending"
    RESOLVED = "resolved"
    CLOSED = "closed"


class MessageSender(str, enum.Enum):
    CUSTOMER = "customer"
    AI = "ai"
    AGENT = "agent"
    SYSTEM = "system"


class KnowledgeDocStatus(str, enum.Enum):
    PENDING = "pending"
    INDEXED = "indexed"
    FAILED = "failed"


class OrderStatus(str, enum.Enum):
    NEW = "new"
    PAID = "paid"
    SHIPPED = "shipped"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


# --------------------------------------------------------------------------- #
# Model
# --------------------------------------------------------------------------- #


class Tenant(Base, TimestampMixin):
    """Tenant = customer SaaS. Diakses via subdomain (slug) atau header X-Tenant-ID."""

    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(63), unique=True, nullable=False, index=True)
    plan: Mapped[TenantPlan] = mapped_column(
        SAEnum(TenantPlan, name="tenant_plan"), nullable=False, default=TenantPlan.FREE
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    users: Mapped[list["User"]] = relationship(
        back_populates="tenant", cascade="all, delete-orphan", passive_deletes=True
    )


class User(Base, TimestampMixin, TenantMixin):
    """User internal tenant (owner/admin/agent). Email unik PER tenant."""

    __tablename__ = "users"
    __table_args__ = (
        Index("uq_users_tenant_email", "tenant_id", "email", unique=True),
        Index("ix_users_tenant_role", "tenant_id", "role"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role"), nullable=False, default=UserRole.AGENT
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    tenant: Mapped["Tenant"] = relationship(back_populates="users")


class Conversation(Base, TimestampMixin, TenantMixin):
    __tablename__ = "conversations"
    __table_args__ = (
        Index("ix_conversations_tenant_status_created", "tenant_id", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    customer_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    channel: Mapped[str] = mapped_column(String(32), nullable=False, default="webchat")
    status: Mapped[ConversationStatus] = mapped_column(
        SAEnum(ConversationStatus, name="conversation_status"),
        nullable=False,
        default=ConversationStatus.OPEN,
    )
    assigned_agent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    assigned_agent: Mapped[Optional["User"]] = relationship()
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", passive_deletes=True
    )


class Message(Base, TimestampMixin, TenantMixin):
    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_tenant_conv_created", "tenant_id", "conversation_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    sender: Mapped[MessageSender] = mapped_column(
        SAEnum(MessageSender, name="message_sender"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tokens_used: Mapped[int] = mapped_column(nullable=False, default=0)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")


class KnowledgeDocument(Base, TimestampMixin, TenantMixin):
    """Dokumen knowledge base per tenant (dasar RAG untuk AI CS)."""

    __tablename__ = "knowledge_documents"
    __table_args__ = (
        Index("ix_knowledge_docs_tenant_status", "tenant_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    source_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[KnowledgeDocStatus] = mapped_column(
        SAEnum(KnowledgeDocStatus, name="knowledge_doc_status"),
        nullable=False,
        default=KnowledgeDocStatus.PENDING,
    )
    embedding_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)


class OrderRecord(Base, TimestampMixin, TenantMixin):
    """Snapshot order per tenant (konteks AI CS: cek status pesanan, dll)."""

    __tablename__ = "order_records"
    __table_args__ = (
        Index("uq_orders_tenant_external_id", "tenant_id", "external_order_id", unique=True),
        Index("ix_orders_tenant_status_created", "tenant_id", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    external_order_id: Mapped[str] = mapped_column(String(64), nullable=False)
    customer_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="IDR")
    status: Mapped[OrderStatus] = mapped_column(
        SAEnum(OrderStatus, name="order_status"), nullable=False, default=OrderStatus.NEW
    )
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)


# --------------------------------------------------------------------------- #
# Seeding 2 tenant dummy: `python -m app.models`
# (create_all sebagai fallback; workflow normal: `alembic upgrade head` dulu)
# --------------------------------------------------------------------------- #


async def seed_dummy_tenants() -> None:
    import os

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    url = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://dibantuin:dibantuin@localhost:5432/dibantuin",
    )
    engine = create_async_engine(url)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        Session = async_sessionmaker(engine, expire_on_commit=False)
        async with Session() as session:
            for slug, name in (("tokokita", "Toko Kita"), ("fashionhub", "FashionHub")):
                if await session.scalar(select(Tenant).where(Tenant.slug == slug)):
                    continue
                tenant = Tenant(name=name, slug=slug, plan=TenantPlan.PRO)
                session.add(tenant)
                await session.flush()
                session.add(
                    User(
                        tenant_id=tenant.id,
                        email=f"owner@{slug}.id",
                        hashed_password="seed-only-hash",  # produksi: hash dari app.core.security
                        full_name=f"Owner {name}",
                        role=UserRole.OWNER,
                    )
                )
                conv = Conversation(tenant_id=tenant.id, customer_email="pelanggan@example.com")
                session.add(conv)
                await session.flush()
                session.add(
                    Message(
                        tenant_id=tenant.id,
                        conversation_id=conv.id,
                        sender=MessageSender.CUSTOMER,
                        content="Halo, pesanan saya kapan dikirim?",
                    )
                )
                session.add(
                    KnowledgeDocument(
                        tenant_id=tenant.id,
                        title=f"FAQ {name}",
                        content="Pengiriman 2-4 hari kerja; retur 7 hari.",
                        status=KnowledgeDocStatus.INDEXED,
                    )
                )
                session.add(
                    OrderRecord(
                        tenant_id=tenant.id,
                        external_order_id=f"{slug}-0001",
                        customer_email="pelanggan@example.com",
                        amount=Decimal("249000.00"),
                        status=OrderStatus.PAID,
                    )
                )
            await session.commit()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    import asyncio

    asyncio.run(seed_dummy_tenants())
