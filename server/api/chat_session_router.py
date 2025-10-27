from fastapi import APIRouter, status as http_status
from fastapi.responses import JSONResponse
from db import ChatSession, DBSessionDep
from api.payload_schemas import CreateChatSessionPayload

chat_sessions_router = APIRouter(prefix="/agent/chat_sessions")


@chat_sessions_router.post("/create_and_initialize")
async def create_chat_session(payload: CreateChatSessionPayload, db: DBSessionDep):
    chat_session = ChatSession(
        working_path=payload.working_path,
        model_info=payload.model_info.model_dump(),
        env_info=payload.env_info.model_dump(),
        messages_json=[],
    )

    db.add(chat_session)
    await db.flush()
    await db.refresh(chat_session)

    print(f"New session created: {chat_session.id}")

    return JSONResponse(content=chat_session, status_code=http_status.HTTP_201_CREATED)


@chat_sessions_router.get("/s/{chat_session_id}")
async def get_chat_session(chat_session_id: str, db: DBSessionDep):
    pass
