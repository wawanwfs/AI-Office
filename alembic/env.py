'''Alembic environment untuk project dibantuin (SQLAlchemy 2.0 async).

Mendukung autogenerate & migrasi skema multi-tenant:
Tenant, User, Conversation, Message, KnowledgeDocument, OrderRecord.
'''

import asyncio
import logging
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import settings

# Import Base dan SEMUA model agar terdaftar di Base.metadata
# (wajib agar autogenerate mendeteksi seluruh tabel).
from app.models.base import Base
from app.models.tenant import Tenant  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.conversation import Conversation  # noqa: F401
from app.models.message import Message  # noqa: F401
from app.models.knowledge_document import KnowledgeDocument  # noqa: F401
from app.models.order_record import OrderRecord  # noqa: F401

config = context.config
logger = logging.getLogger('alembic.env')

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Inject URL database dari settings aplikasi.
# Pastikan driver async (asyncpg) dipakai untuk mode online.
database_url = str(settings.DATABASE_URL)
if database_url.startswith('postgresql://'):
    database_url = database_url.replace('postgresql://', 'postgresql+asyncpg://', 1)
elif database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql+asyncpg://', 1)
config.set_main_option('sqlalchemy.url', database_url)

target_metadata = Base.metadata


def process_revision_directives(context, revision, directives) -> None:
    '''Skip revisi kosong saat autogenerate (tidak ada perubahan skema).'''
    if config.cmd_opts is not None and getattr(config.cmd_opts, 'autogenerate', False):
        script = directives[0]
        if script.upgrade_ops.is_empty():
            directives[:] = []
            logger.info('No changes in schema detected.')


def run_migrations_offline() -> None:
    '''Mode offline: emit SQL ke stdout tanpa koneksi DB (review DBA / CI).'''
    url = config.get_main_option('sqlalchemy.url')
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={'paramstyle': 'named'},
        compare_type=True,
        compare_server_default=True,
        process_revision_directives=process_revision_directives,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    '''Callback sync yang dijalankan di atas koneksi async via run_sync.'''
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        process_revision_directives=process_revision_directives,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    '''Buat async engine (NullPool) dan jalankan migrasi lewat run_sync.'''
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix='sqlalchemy.',
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    '''Mode online: jalankan migrasi menggunakan engine async.'''
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
