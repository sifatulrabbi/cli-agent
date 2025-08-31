import os
import pathlib
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from sqlalchemy import event
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.ext.asyncio import (
    AsyncAttrs,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


def _build_sqlite_url_from_env() -> str:
    """Build an async SQLAlchemy SQLite URL using DB_PATH.

    Accepted DB_PATH values:
    - Filesystem path (relative or absolute) to the SQLite file
    - The special value ":memory:" for an in-memory DB
    - A pre-formatted sqlite URL (will be coerced to use aiosqlite driver)
    """
    db_path = os.getenv("DB_PATH")
    if not db_path:
        raise RuntimeError(
            "DB_PATH environment variable is required (path to SQLite database file)"
        )

    if db_path == ":memory:":
        return "sqlite+aiosqlite:///:memory:"

    if db_path.startswith("sqlite:"):
        # Ensure async driver for all sqlite URLs
        if db_path.startswith("sqlite+aiosqlite:"):
            return db_path
        if db_path.startswith("sqlite+pysqlite:"):
            return db_path.replace("sqlite+pysqlite:", "sqlite+aiosqlite:", 1)
        if db_path.startswith("sqlite://"):
            return db_path.replace("sqlite://", "sqlite+aiosqlite://", 1)
        return db_path.replace("sqlite:", "sqlite+aiosqlite:", 1)

    # Treat as filesystem path
    abs_path = pathlib.Path(db_path).expanduser().resolve()
    return f"sqlite+aiosqlite:///{abs_path}"


_DATABASE_URL = _build_sqlite_url_from_env()


class Base(AsyncAttrs, DeclarativeBase):
    pass


engine = create_async_engine(_DATABASE_URL)


@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):  # type: ignore[no-redef]
    """Ensure SQLite enforces foreign keys."""
    try:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
    except Exception:
        # Non-SQLite drivers will just ignore this
        pass


SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


@asynccontextmanager
async def session_scope():
    """Async transactional scope for a series of operations."""
    session: AsyncSession = SessionLocal()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an AsyncSession (FastAPI dependency)."""
    session: AsyncSession = SessionLocal()
    try:
        yield session
    finally:
        await session.close()


async def init_db(create_all: bool = True) -> None:
    """Initialize the database (create tables if they don't exist) asynchronously."""
    if create_all:
        print("Creating all the tables if don't exist...")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("Done creating all the tables.")


__all__ = [
    "Base",
    "engine",
    "SessionLocal",
    "session_scope",
    "get_session",
    "init_db",
]
