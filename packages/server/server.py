from sqlalchemy.ext.asyncio import AsyncSession
from agent import agent_graph
from typing import AsyncGenerator, Optional
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.responses import StreamingResponse
from db import get_session
from db.models import ChatThread


class ChatRequest(BaseModel):
    input: str


app = FastAPI(title="CLI-Agent Server", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "PATCH", "DELETE", "PUT"],
    allow_headers=["*"],
)


async def _iter_graph_tokens(user_input: str) -> AsyncGenerator[str, None]:
    accumulated_text = ""
    try:
        async for event in agent_graph.astream(
            {"messages": [{"role": "user", "content": user_input}]},
            stream_mode="messages",
        ):
            for value in event.values():
                try:
                    last_msg = value["messages"][-1]
                    content = last_msg.content if last_msg else ""
                    if not isinstance(content, str):
                        continue
                    if len(content) > len(accumulated_text):
                        delta = content[len(accumulated_text) :]
                        accumulated_text = content
                        if delta:
                            yield delta
                except Exception:
                    continue
    except Exception as exc:
        yield f"\n[stream_error]: {type(exc).__name__}: {exc}\n"


def _format_sse_event(data: str, event: Optional[str] = None) -> bytes:
    lines = []
    if event:
        lines.append(f"event: {event}")
    # Split by lines to satisfy SSE spec for multi-line payloads
    for line in data.splitlines() or [""]:
        lines.append(f"data: {line}")
    lines.append("")
    payload = "\n".join(lines) + "\n"
    return payload.encode("utf-8")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/chat/sse")
async def chat_sse(req: ChatRequest):
    if not req.input:
        raise HTTPException(status_code=400, detail="input is required")

    async def event_stream() -> AsyncGenerator[bytes, None]:
        async for chunk in _iter_graph_tokens(req.input):
            yield _format_sse_event(chunk, event="message")
        yield _format_sse_event("", event="done")

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(
        event_stream(), media_type="text/event-stream", headers=headers
    )


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    if not req.input:
        raise HTTPException(status_code=400, detail="input is required")

    async def chunk_stream() -> AsyncGenerator[bytes, None, None]:
        async for chunk in _iter_graph_tokens(req.input):
            yield chunk.encode("utf-8")
        yield b"\n[DONE]\n"

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(
        chunk_stream(), media_type="text/plain; charset=utf-8", headers=headers
    )


@app.get("/chat/history")
async def chat_history(db: AsyncSession = Depends(get_session)):
    threads = await db.query(ChatThread).all()
    return {"history": [thread.to_dict() for thread in threads]}
