import json
import os
from typing import Any, List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_openai import ChatOpenAI
from langchain_core.messages import (
    AIMessage as LCAIMessage,
    BaseMessage,
    HumanMessage as LCHumanMessage,
    SystemMessage as LCSystemMessage,
    ToolMessage as LCToolMessage,
)
from langchain_core.tools import tool
from pydantic import BaseModel, Field
import asyncio


app = FastAPI(title="CLI-Agent Server", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "PATCH", "DELETE", "PUT"],
    allow_headers=["*"],
)


OPENAI_API_KEY: Any = os.getenv("OPENAI_API_KEY", "")
llm = ChatOpenAI(
    api_key=OPENAI_API_KEY,
    model="gpt-5-mini",
    use_responses_api=True,
    output_version="responses/v1",
    reasoning={"effort": "medium", "summary": "auto"},
)


SYS_PROMPT = (
    os.getenv(
        "CLI_AGENT_SYS_PROMPT",
        "You are a helpful CLI Chat Agent. Now, assist the user with their requests.",
    )
    or "You are a helpful CLI Chat Agent. Now, assist the user with their requests."
)


# ----------------------
# Tools (spec only; not executed here)
# ----------------------


@tool("ls")
def ls_tool() -> str:
    """List all files, directories, and sub directories of the current project."""
    return "(tool is executed by the Go app)"


class ReadFilesArgs(BaseModel):
    filePaths: List[str] = Field(..., description="The paths of the files to read")


@tool("read_files", args_schema=ReadFilesArgs)
def read_files_tool(filePaths: List[str]) -> str:
    """Read multiple files in the project by full path (use 'ls' first)."""
    return "(tool is executed by the Go app)"


class CreateEntityArgs(BaseModel):
    entityPath: str
    entityType: str = Field(..., description="Either 'dir' or 'file'")
    entityName: str
    content: str


@tool("create_entity", args_schema=CreateEntityArgs)
def create_entity_tool(
    entityPath: str, entityType: str, entityName: str, content: str
) -> str:
    """Create a directory or a file at the given path with optional content."""
    return "(tool is executed by the Go app)"


class RemoveEntityArgs(BaseModel):
    entityPath: str


@tool("remove_entity", args_schema=RemoveEntityArgs)
def remove_entity_tool(entityPath: str) -> str:
    """Remove a directory or file by full path (obtainable via 'ls')."""
    return "(tool is executed by the Go app)"


class AppendInsert(BaseModel):
    insertAfter: int
    content: str


class AppendFileArgs(BaseModel):
    filePath: str
    inserts: List[AppendInsert]


@tool("append_file", args_schema=AppendFileArgs)
def append_file_tool(filePath: str, inserts: List[AppendInsert]) -> str:
    """Insert content into a text file by line number positions."""
    return "(tool is executed by the Go app)"


class Patch(BaseModel):
    startLine: int
    endLine: int
    content: str


class PatchFileArgs(BaseModel):
    filePath: str
    patches: List[Patch]


@tool("patch_file", args_schema=PatchFileArgs)
def patch_file_tool(filePath: str, patches: List[Patch]) -> str:
    """Replace specific line ranges in a text file; no insertions here."""
    return "(tool is executed by the Go app)"


class GrepArgs(BaseModel):
    cmd: str = Field(..., description="Command e.g., grep -R -n 'pattern' .")


@tool("grep", args_schema=GrepArgs)
def grep_tool(cmd: str) -> str:
    """Run grep with sensible excludes automatically applied by the Go app."""
    return "(tool is executed by the Go app)"


def get_tools():
    return [
        ls_tool,
        read_files_tool,
        create_entity_tool,
        remove_entity_tool,
        append_file_tool,
        patch_file_tool,
        grep_tool,
    ]


# ----------------------
# History bridging models
# ----------------------


class HistoryMessage(BaseModel):
    role: str
    raw_json: str


class ChatRequest(BaseModel):
    messages: List[HistoryMessage]


class ChatResponse(BaseModel):
    messages: List[HistoryMessage]


def _extract_text_from_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for item in content:
            # Handle both dict-style and object-style chunks
            if isinstance(item, dict):
                if item.get("type") == "text" and isinstance(item.get("text"), str):
                    parts.append(item["text"])
            else:
                txt = getattr(item, "text", None)
                if isinstance(txt, str):
                    parts.append(txt)
        return "\n".join([p for p in parts if p])
    return ""


def _history_to_langchain(history: List[HistoryMessage]) -> List[BaseMessage]:
    lc_messages: List[BaseMessage] = [LCSystemMessage(content=SYS_PROMPT)]

    for hm in history:
        role = (hm.role or "").lower()
        try:
            data = json.loads(hm.raw_json or "{}")
        except Exception:
            data = {}

        if role == "human":
            content = data.get("content") or data.get("output") or ""
            lc_messages.append(LCHumanMessage(content=content))
        elif role == "ai":
            content = data.get("output") or data.get("content") or ""
            tool_calls = []
            for tc in data.get("tool_calls", []) or []:
                # Normalize args to dict
                args_raw = tc.get("args", {})
                if isinstance(args_raw, str):
                    try:
                        args_raw = json.loads(args_raw)
                    except Exception:
                        args_raw = {"input": args_raw}
                tool_calls.append(
                    {
                        "name": tc.get("name", ""),
                        "args": args_raw,
                        "id": tc.get("call_id") or tc.get("id") or "",
                    }
                )
            lc_messages.append(LCAIMessage(content=content, tool_calls=tool_calls))
        elif role == "tool":
            content = data.get("content") or ""
            tool_call_id = data.get("call_id") or data.get("tool_call_id") or ""
            name = data.get("name") or ""
            lc_messages.append(
                LCToolMessage(content=content, tool_call_id=tool_call_id, name=name)
            )
        else:
            # Unknown role: ignore
            continue
    return lc_messages


def _format_ai_for_history(ai: LCAIMessage) -> HistoryMessage:
    # Extract textual output
    output_text = _extract_text_from_content(ai.content)

    # Extract reasoning summary if present in response metadata
    reasoning_text = ""
    try:
        meta = getattr(ai, "response_metadata", {}) or {}
        # Various providers may return reasoning in different shapes
        if isinstance(meta, dict):
            if isinstance(meta.get("reasoning"), dict):
                reasoning_text = (
                    meta["reasoning"].get("summary")
                    or meta["reasoning"].get("text")
                    or meta["reasoning"].get("content")
                    or ""
                )
    except Exception:
        reasoning_text = ""

    # Normalize tool calls
    tool_calls_payload = []
    for tc in ai.tool_calls or []:
        name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", "")
        args = tc.get("args") if isinstance(tc, dict) else getattr(tc, "args", {})
        call_id = tc.get("id") if isinstance(tc, dict) else getattr(tc, "id", "")
        try:
            args_str = json.dumps(args, ensure_ascii=False)
        except Exception:
            args_str = json.dumps({"input": str(args)}, ensure_ascii=False)
        tool_calls_payload.append(
            {
                "name": name or "",
                "call_id": call_id or "",
                "args": args_str,
            }
        )

    ai_payload = {
        "role": "ai",
        "reasoning": reasoning_text,
        "output": output_text,
        "tool_calls": tool_calls_payload,
    }

    return HistoryMessage(
        role="ai", raw_json=json.dumps(ai_payload, ensure_ascii=False)
    )


@app.post("/agent/chat", response_model=ChatResponse)
async def agent_chat(body: ChatRequest) -> ChatResponse:
    lc_messages = _history_to_langchain(body.messages)
    response: LCAIMessage = await llm.bind_tools(get_tools()).ainvoke(lc_messages)  # type: ignore
    ai_h = _format_ai_for_history(response)
    return ChatResponse(messages=[ai_h])


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/agent/stream")
async def agent_stream(body: ChatRequest):
    lc_messages = _history_to_langchain(body.messages)

    async def event_gen():
        collected_text_parts: list[str] = []
        final_sent = False
        try:
            async for event in llm.bind_tools(get_tools()).astream_events(lc_messages, version="v1"):  # type: ignore
                et = event.get("event", "")
                if et == "on_chat_model_stream":
                    data = event.get("data", {}) or {}
                    chunk = data.get("chunk")
                    # 'chunk' can be an object with .content or a dict
                    content = getattr(chunk, "content", None)
                    if content is None and isinstance(chunk, dict):
                        content = chunk.get("content")
                    text = _extract_text_from_content(content)
                    if text:
                        collected_text_parts.append(text)
                        yield _sse({"type": "chunk", "text": text})
                elif et == "on_chat_model_end":
                    data = event.get("data", {}) or {}
                    output = data.get("output")
                    ai_msg = output if isinstance(output, LCAIMessage) else None
                    # Fallback: try to build a minimal AIMessage-like payload
                    if ai_msg is None:
                        # synthesize an AI message from collected text
                        synthesized = LCAIMessage(content="".join(collected_text_parts))
                        ai_h = _format_ai_for_history(synthesized)
                    else:
                        ai_h = _format_ai_for_history(ai_msg)
                    final_sent = True
                    yield _sse({"type": "final", "message": ai_h.model_dump()})
        except Exception as e:
            # Surface error as a final event so the client can handle gracefully
            err_ai = LCAIMessage(content=f"Error during stream: {e}")
            ai_h = _format_ai_for_history(err_ai)
            final_sent = True
            yield _sse({"type": "final", "message": ai_h.model_dump()})
        finally:
            if not final_sent:
                # Ensure the client receives at least a final event
                ai_h = HistoryMessage(role="ai", raw_json=json.dumps({
                    "role": "ai",
                    "output": "".join(collected_text_parts),
                    "reasoning": "",
                    "tool_calls": [],
                }, ensure_ascii=False))
                yield _sse({"type": "final", "message": ai_h.model_dump()})

    return StreamingResponse(event_gen(), media_type="text/event-stream")
