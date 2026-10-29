"""Schemas Pydantic untuk Knowledge Base API multi-tenant — project `dibantuin`.

Modul ini adalah kontrak data bersama untuk:

- ``app/kb/router.py``  : validasi request & serialisasi response
- ``app/kb/service.py`` : ekstraksi teks (pypdf/python-docx), chunking, orkestrasi upload
- ``app/kb/tasks.py``   : payload background task embedding (Celery / BackgroundTasks)
- unit test chunking & isolasi tenant

Aturan keamanan anti-IDOR yang dipaksa di level schema:

1. TIDAK ADA schema input yang memiliki field ``tenant_id``. Tenant selalu
   diambil server-side dari ``request.state`` (lihat :class:`TenantContext`).
   ``tenant_id`` hanya muncul pada schema output dan bersifat read-only.
2. Schema update/toggle memakai ``extra="forbid"`` sehingga payload yang
   mencoba menyelipkan ``tenant_id``/``id`` ditolak dengan HTTP 422.
3. Vektor embedding tidak pernah diekspos melalui schema output.

Modul ini bebas I/O sehingga aman diimpor oleh worker Celery dan unit test.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any, Final, Optional
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

__all__ = [
    "MAX_FILE_SIZE_BYTES",
    "ALLOWED_EXTENSIONS",
    "ALLOWED_MIME_TYPES",
    "DocumentStatus",
    "ProcessingStatus",
    "KBValidationError",
    "TenantContext",
    "ChunkingConfig",
    "ChunkDraft",
    "EmbeddingTaskPayload",
    "KBDocumentUploadMeta",
    "KBDocumentUpdate",
    "KBDocumentStatusUpdate",
    "KBDocumentListQuery",
    "KBChunkOut",
    "KBDocumentOut",
    "KBDocumentDetail",
    "KBDocumentUploadOut",
    "KBDocumentListOut",
    "KBDocumentDeleteOut",
    "KBErrorOut",
    "validate_upload",
]

# ---------------------------------------------------------------------------
# Konstanta upload (dipakai router & service)
# ---------------------------------------------------------------------------

MAX_FILE_SIZE_BYTES: Final[int] = 10 * 1024 * 1024  # 10 MB

ALLOWED_EXTENSIONS: Final[frozenset[str]] = frozenset({".pdf", ".docx", ".txt", ".md"})

# Validasi utama memakai ekstensi; MIME adalah lapis kedua.
# ``application/octet-stream`` diizinkan karena sebagian client mengunggah
# .txt/.md tanpa MIME yang benar — ekstensi tetap wajib valid.
ALLOWED_MIME_TYPES: Final[frozenset[str]] = frozenset(
    {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "text/markdown",
        "application/octet-stream",
    }
)


# ---------------------------------------------------------------------------
# Exception domain
# ---------------------------------------------------------------------------


class KBValidationError(ValueError):
    """Upload tidak memenuhi ketentuan (ekstensi/MIME/ukuran).

    Router menangkap exception ini dan menerjemahkannya menjadi response HTTP
    memakai ``status_code``: 415 (tipe tidak didukung), 413 (lebih dari 10 MB),
    atau 400 (payload tidak valid).
    """

    def __init__(self, message: str, *, status_code: int = 415) -> None:
        super().__init__(message)
        self.status_code = status_code


# ---------------------------------------------------------------------------
# Enum status
# ---------------------------------------------------------------------------


class DocumentStatus(str, enum.Enum):
    """Status lifecycle dokumen yang dikendalikan user (toggle active/archived)."""

    ACTIVE = "active"
    ARCHIVED = "archived"


class ProcessingStatus(str, enum.Enum):
    """Status pipeline background: ekstraksi -> chunking -> embedding."""

    PENDING = "pending"        # upload diterima, task belum jalan
    PROCESSING = "processing"  # worker sedang mengekstrak/chunking/embedding
    READY = "ready"            # chunks + embedding siap dipakai RAG
    FAILED = "failed"          # gagal (lihat error_message pada detail)


# ---------------------------------------------------------------------------
# Konteks tenant (anti-IDOR)
# ---------------------------------------------------------------------------


class TenantContext(BaseModel):
    """Identitas tenant yang di-inject auth/tenant middleware ke ``request.state``.

    Router KB WAJIB membangun scope query dari context ini dan TIDAK PERNAH
    menerima ``tenant_id`` dari body, query, maupun path.
    """

    model_config = ConfigDict(frozen=True, from_attributes=True)

    tenant_id: UUID
    user_id: Optional[UUID] = None
    roles: tuple[str, ...] = ()

    @classmethod
    def from_request_state(cls, state: Any) -> "TenantContext":
        """Ambil context dari ``request.state``; gagal keras jika middleware belum jalan."""
        ctx = getattr(state, "tenant_context", None)
        if ctx is None:
            raw = getattr(state, "tenant_id", None)
            if raw is None:
                raise LookupError(
                    "request.state.tenant_context tidak ditemukan — pastikan "
                    "auth/tenant middleware dieksekusi sebelum router KB."
                )
            return cls(tenant_id=UUID(str(raw)))
        if isinstance(ctx, cls):
            return ctx
        if isinstance(ctx, dict):
            return cls.model_validate(ctx)
        return cls.model_validate(ctx)  # objek pydantic/dataclass dengan atribut


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------


class ChunkingConfig(BaseModel):
    """Konfigurasi chunking dokumen.

    Default mengikuti spesifikasi KB `dibantuin`: potongan 500–800 token
    dengan overlap 100 token. Batas atas/bawah sengaja tidak dikunci keras
    ke 500/800 agar unit test chunking dapat memakai nilai kecil yang cepat.
    """

    min_tokens: int = Field(default=500, ge=1, description="Ukuran minimum potongan (token).")
    max_tokens: int = Field(default=800, ge=1, description="Ukuran maksimum potongan (token).")
    overlap_tokens: int = Field(default=100, ge=0, description="Token overlap antar potongan.")

    @model_validator(mode="after")
    def _validate_bounds(self) -> "ChunkingConfig":
        if self.min_tokens > self.max_tokens:
            raise ValueError("min_tokens tidak boleh lebih besar dari max_tokens")
        if self.overlap_tokens >= self.min_tokens:
            raise ValueError("overlap_tokens harus lebih kecil dari min_tokens")
        return self


class ChunkDraft(BaseModel):
    """Satu potongan hasil chunking sebelum disimpan ke tabel ``knowledge_chunks``.

    Menjadi tipe kembalian ``chunk_text()`` di service sehingga unit test
    dapat memverifikasi indeks, jumlah token, dan overlap antar potongan
    tanpa menyentuh database maupun embedding.
    """

    chunk_index: int = Field(ge=0)
    content: str = Field(min_length=1)
    token_count: int = Field(ge=1)
    # Rentang karakter pada teks sumber [char_start, char_end) — dipakai untuk
    # highlight sumber di UI dan assertion overlap di unit test.
    char_start: int = Field(ge=0)
    char_end: int = Field(gt=0)

    @model_validator(mode="after")
    def _validate_range(self) -> "ChunkDraft":
        if self.char_end <= self.char_start:
            raise ValueError("char_end harus lebih besar dari char_start")
        return self


class EmbeddingTaskPayload(BaseModel):
    """Payload serializable untuk background task embedding.

    Berisi semua yang dibutuhkan worker tanpa harus membaca ulang request.
    Worker wajib memvalidasi ulang bahwa ``document_id`` benar-benar milik
    ``tenant_id`` sebelum memproses (defence-in-depth anti-IDOR di worker).
    """

    document_id: UUID
    tenant_id: UUID
    storage_key: str = Field(min_length=1)
    filename: str = Field(min_length=1)
    mime_type: str = Field(min_length=1)
    chunking: ChunkingConfig = Field(default_factory=ChunkingConfig)


# ---------------------------------------------------------------------------
# Schema input (TANPA tenant_id — anti-IDOR)
# ---------------------------------------------------------------------------


class KBDocumentUploadMeta(BaseModel):
    """Metadata opsional saat upload multipart (form-fields, bukan JSON body).

    CATATAN ANTI-IDOR: sengaja TIDAK memiliki field ``tenant_id``.
    Tenant ditentukan server dari ``request.state.tenant_id``.
    """

    title: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("title", "description")
    @classmethod
    def _strip_optional(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None


class KBDocumentUpdate(BaseModel):
    """Payload PATCH ``/kb/documents/{document_id}``.

    - ``extra="forbid"``: payload yang menyelipkan ``tenant_id``/``id``/field
      asing ditolak 422 (lapisan anti-IDOR pertama di level schema).
    - Field yang tidak dikirim tidak diubah; service memakai
      ``model_fields_set`` untuk membedakan "tidak dikirim" vs "dikirim null"
      (``description=null`` berarti menghapus description).
    - Ganti status TIDAK lewat sini — gunakan endpoint toggle khusus
      (``KBDocumentStatusUpdate``).
    """

    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError("title tidak boleh kosong atau whitespace")
        return value

    @model_validator(mode="after")
    def _title_cannot_be_null(self) -> "KBDocumentUpdate":
        if "title" in self.model_fields_set and self.title is None:
            raise ValueError("title tidak boleh null; kirim string non-kosong atau omit field")
        return self


class KBDocumentStatusUpdate(BaseModel):
    """Payload toggle status dokumen (active <-> archived)."""

    model_config = ConfigDict(extra="forbid")

    status: DocumentStatus


class KBDocumentListQuery(BaseModel):
    """Filter query GET ``/kb/documents``.

    Tidak ada parameter tenant — penyaringan tenant dilakukan wajib di
    service/repository memakai ``TenantContext.from_request_state(request.state)``.
    """

    model_config = ConfigDict(extra="forbid")

    status: Optional[DocumentStatus] = None
    processing_status: Optional[ProcessingStatus] = None
    search: Optional[str] = Field(default=None, max_length=255)
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


# ---------------------------------------------------------------------------
# Schema output (tenant_id read-only; embedding tidak diekspos)
# ---------------------------------------------------------------------------


class KBChunkOut(BaseModel):
    """Satu baris ``knowledge_chunks`` yang boleh terlihat client.

    Kolom ``embedding`` (vector) sengaja tidak ada di schema ini.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    chunk_index: int = Field(ge=0)
    content: str
    token_count: int = Field(ge=1)
    embedding_model: Optional[str] = None
    embedding_dim: Optional[int] = Field(default=None, ge=0)
    created_at: datetime


class KBDocumentOut(BaseModel):
    """Response standar dokumen (dipakai untuk list dan upload)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID  # read-only; hanya output, tidak pernah diterima dari body
    title: str
    filename: str
    extension: str
    mime_type: str
    size_bytes: int = Field(ge=0)
    status: DocumentStatus
    processing_status: ProcessingStatus
    chunk_count: int = Field(default=0, ge=0)
    created_at: datetime
    updated_at: datetime


class KBDocumentDetail(KBDocumentOut):
    """GET ``/kb/documents/{id}`` — termasuk description, chunks, dan error pipeline."""

    description: Optional[str] = None
    error_message: Optional[str] = None
    chunks: list[KBChunkOut] = Field(default_factory=list)


class KBDocumentUploadOut(KBDocumentOut):
    """Response POST ``/kb/documents`` (202) — embedding diantrekan di background."""

    message: str = (
        "Upload diterima. Ekstraksi teks, chunking, dan embedding "
        "diproses sebagai background task."
    )


class KBDocumentListOut(BaseModel):
    """Response GET ``/kb/documents`` (paginated)."""

    items: list[KBDocumentOut]
    total: int = Field(ge=0)
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)


class KBDocumentDeleteOut(BaseModel):
    """Response DELETE — cascade chunks + vectors dilaporkan untuk audit."""

    id: UUID
    deleted: bool = True
    chunks_deleted: int = Field(default=0, ge=0)
    vectors_deleted: int = Field(default=0, ge=0)


class KBErrorOut(BaseModel):
    """Envelope error standar endpoint KB."""

    detail: str
    code: Optional[str] = None


# ---------------------------------------------------------------------------
# Validator upload
# ---------------------------------------------------------------------------


def validate_upload(
    *,
    filename: str,
    size_bytes: int,
    content_type: Optional[str] = None,
) -> str:
    """Validasi file upload terhadap ketentuan KB.

    Args:
        filename: nama file asli dari client.
        size_bytes: ukuran file dalam byte (``UploadFile.size`` atau hasil seek).
        content_type: header Content-Type upload (opsional).

    Returns:
        Ekstensi ternormalisasi (lowercase, dengan titik), contoh ``".pdf"``.

    Raises:
        KBValidationError: dengan ``status_code`` 415 (tipe tidak didukung),
            413 (melebihi 10 MB), atau 400 (payload tidak valid).
    """
    if not filename or not filename.strip():
        raise KBValidationError("Nama file tidak boleh kosong.", status_code=400)

    name = filename.strip()
    ext = f".{name.rsplit('.', 1)[-1].lower()}" if "." in name else ""

    if ext not in ALLOWED_EXTENSIONS:
        supported = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise KBValidationError(
            f"Ekstensi '{ext or '(tanpa ekstensi)'}' tidak didukung. Gunakan: {supported}.",
            status_code=415,
        )

    if content_type:
        base_mime = content_type.split(";", 1)[0].strip().lower()
        if base_mime and base_mime not in ALLOWED_MIME_TYPES:
            raise KBValidationError(
                f"Content-Type '{base_mime}' tidak didukung untuk file '{name}'.",
                status_code=415,
            )

    if size_bytes <= 0:
        raise KBValidationError("File kosong atau tidak memiliki konten.", status_code=400)

    if size_bytes > MAX_FILE_SIZE_BYTES:
        raise KBValidationError(
            f"Ukuran file {size_bytes:,} byte melebihi batas "
            f"{MAX_FILE_SIZE_BYTES:,} byte (10 MB).",
            status_code=413,
        )

    return ext
