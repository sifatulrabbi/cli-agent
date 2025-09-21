import uuid
from typing import Annotated, AsyncGenerator, Callable, Text
from fastapi import Depends
from datetime import datetime
from sqlalchemy import CheckConstraint, String, DateTime, func, JSON, Integer, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.ext.mutable import MutableDict, MutableList
from configs import DB_URL


class Base(DeclarativeBase):
    __abstract__ = True

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[DateTime] = mapped_column(DateTime, default=None)


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    __table_args__ = (
        CheckConstraint("json_valid(model_info)"),
        CheckConstraint("json_valid(messages)"),
    )

    working_path: Mapped[str] = mapped_column(Text(1024), nullable=False)
    model_info: Mapped[dict] = mapped_column(
        MutableDict.as_mutable(JSON), default=dict, nullable=False
    )
    env_info: Mapped[dict] = mapped_column(
        MutableDict.as_mutable(JSON), default=dict, nullable=False
    )
    token_in: Mapped[int] = mapped_column(Integer, default=0)
    token_out: Mapped[int] = mapped_column(Integer, default=0)
    messages_json: Mapped[list[dict]] = mapped_column(
        MutableList.as_mutable(JSON), default=list, nullable=False
    )


Engine = create_async_engine(DB_URL, echo=False, future=True)
SessionLocal = async_sessionmaker(Engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception as e:
            print("Failed to complete DB operation:")
            print(e)
            print("Rolling back!")
            await session.rollback()


DBSessionDep = Annotated[AsyncSession, Depends(get_session)]


async def prepare_db():
    print("Preparing the database.")
    async with Engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
