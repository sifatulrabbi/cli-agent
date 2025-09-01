from typing import Any, Optional
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from db import session_scope
from db.models import ChatMessage, ChatThread
from datetime import datetime, timezone


async def get_all_chat_threads(
    session: Optional[AsyncSession] = None,
) -> list[ChatThread]:
    """Return all chat threads.

    If a session is provided, it will be used; otherwise a temporary
    transactional session is created via ``session_scope``.
    """
    if session is not None:
        result = await session.execute(select(ChatThread))
        return list(result.scalars().all())

    async with session_scope() as s:
        result = await s.execute(select(ChatThread))
        return list(result.scalars().all())


async def get_chat_thread_by_id(
    thread_id: str, session: Optional[AsyncSession] = None
) -> Optional[ChatThread]:
    """Return a single thread by id or ``None`` if not found."""
    # Eager-load messages to return the thread with its messages populated
    stmt = (
        select(ChatThread)
        .options(selectinload(ChatThread.messages))
        .where(ChatThread.id == thread_id)
    )
    if session is not None:
        result = await session.execute(stmt)
        return result.scalars().first()

    async with session_scope() as s:
        result = await s.execute(stmt)
        return result.scalars().first()


async def get_chat_message_by_id(
    message_id: str, session: Optional[AsyncSession] = None
) -> Optional[ChatMessage]:
    """Return a single chat message by id or ``None`` if not found."""
    stmt = select(ChatMessage).where(ChatMessage.id == message_id)
    if session is not None:
        result = await session.execute(stmt)
        return result.scalars().first()

    async with session_scope() as s:
        result = await s.execute(stmt)
        return result.scalars().first()


async def get_chat_messages_by_thread(
    thread_id: str,
    *,
    limit: Optional[int] = None,
    offset: int = 0,
    session: Optional[AsyncSession] = None,
) -> list[ChatMessage]:
    """Return messages for a thread.

    Parameters
    - thread_id: Thread identifier to filter messages.
    - limit/offset: Optional pagination.
    - session: Optional existing AsyncSession.
    """
    stmt = select(ChatMessage).where(ChatMessage.thread_id == thread_id)
    if offset:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)

    if session is not None:
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async with session_scope() as s:
        result = await s.execute(stmt)
        return list(result.scalars().all())


async def create_thread(session: AsyncSession | None = None):
    """Create and return a new ChatThread.

    If a session is provided, the caller is responsible for committing.
    Otherwise, a transactional session is created and committed.
    """
    # Let DB/ORM defaults set timestamps
    thread = ChatThread()

    if session is not None:
        session.add(thread)
        # Flush to populate default values (e.g., id) without committing
        await session.flush()
        return thread

    async with session_scope() as s:
        s.add(thread)
        await s.flush()
        return thread


async def add_message_to_thread(
    thread_id: str,
    msg_type: str,
    content: str,
    tool_calls: list[Any],
    session: AsyncSession | None = None,
):
    """Create and return a new ChatMessage under the given thread.

    Creates a minimal default message with type="human". If a session is
    provided, the caller is responsible for committing.
    Returns None if the thread does not exist.
    """
    if session is not None:
        # Validate the thread exists to avoid integrity errors
        thread = await get_chat_thread_by_id(thread_id, session=session)
        if thread is None:
            not_found_exp = Exception()
            raise Exception()

        message = ChatMessage(
            thread_id=thread_id,
            type=msg_type,
            tool_calls=tool_calls,
            content=content,
        )
        session.add(message)
        await session.flush()
        return message

    async with session_scope() as s:
        thread = await get_chat_thread_by_id(thread_id, session=s)
        if thread is None:
            return None

        message = ChatMessage(thread_id=thread_id, type="human")
        s.add(message)
        await s.flush()
        return message


async def delete_threads(thread_ids: list[str], session: AsyncSession | None = None):
    """Delete threads and their messages. Returns count of threads deleted.

    Performs explicit child-then-parent deletes to avoid relying on
    database-level cascade behavior.
    """
    if not thread_ids:
        return 0

    delete_msgs_stmt = delete(ChatMessage).where(ChatMessage.thread_id.in_(thread_ids))
    delete_threads_stmt = delete(ChatThread).where(ChatThread.id.in_(thread_ids))

    if session is not None:
        await session.execute(delete_msgs_stmt)
        result = await session.execute(delete_threads_stmt)
        return result.rowcount or 0

    async with session_scope() as s:
        await s.execute(delete_msgs_stmt)
        result = await s.execute(delete_threads_stmt)
        return result.rowcount or 0
