import uuid
from db import Base
from sqlalchemy import String, JSON, Text, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional


class ChatThread(Base):
    __tablename__ = "chat_threads"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    created_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    updated_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    deleted_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    model_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    usage: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="thread", cascade="all, delete-orphan"
    )


MessageType = Enum("ai", "human", "tool", name="message_type")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    thread_id: Mapped[str] = mapped_column(
        String, ForeignKey("chat_threads.id", ondelete="CASCADE"), index=True
    )
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tool_calls: Mapped[Optional[list[dict]]] = mapped_column(JSON, nullable=True)
    type: Mapped[str] = mapped_column(MessageType, nullable=False)

    thread: Mapped[ChatThread] = relationship(back_populates="messages")


__all__ = [
    "ChatThread",
    "ChatMessage",
]
