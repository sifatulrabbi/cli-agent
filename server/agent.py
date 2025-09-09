import json
import os
from typing import Any, List, cast
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_openai import ChatOpenAI
from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from pydantic import BaseModel, Field
from model_config import get_model_reasoning_param, get_model_output_version


app = FastAPI(title="CLI-Agent Server", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "PATCH", "DELETE", "PUT"],
    allow_headers=["*"],
)


OPENAI_API_KEY: Any = os.getenv("OPENAI_API_KEY", "")
SYS_PROMPT = """\
You are a helpful CLI Chat Agent.

<tool_use_policy>
- Use the 'bash' tool to interact with the filesystem for listing, reading, creating, and removing files or directories.
  - Always stay inside WorkingPath; use relative paths (e.g., ./ or subpaths) and never traverse outside (no ../).
  - Keep bash invocations to a single command without pipes, redirects, subshells, or backgrounding.
  - For performing any grep make sure to only use the exclusive 'grep' tool.
- For any content edits inside files (inserting or replacing text), do not use 'bash'. Use the 'append_file' and 'patch_file' tools.
  - To create a file with initial content: first create it via bash (e.g., touch ./path/to/file), then add content via 'append_file'.

When unsure about the project layout, first list files with bash (e.g., "ls -la ."). Prefer concise, precise actions that minimize changes.
</tool_use_policy>
"""
model_name = "gpt-5-mini"
llm = ChatOpenAI(
    api_key=OPENAI_API_KEY,
    model=model_name,
    use_responses_api=True,
    output_version=get_model_output_version(model_name),
    reasoning=get_model_reasoning_param(model_name),
)


# ----------------------
# History bridging models
# ----------------------


class HistoryMessage(BaseModel):
    role: str
    raw_json: str


class ChatRequest(BaseModel):
    messages: List[HistoryMessage]
    tools: List[dict] = Field(default_factory=list)


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
    lc_messages: List[BaseMessage] = [SystemMessage(content=SYS_PROMPT)]

    for hm in history:
        role = (hm.role or "").lower()
        try:
            data = json.loads(hm.raw_json or "{}")
        except Exception:
            data = {}

        if role == "human":
            content = data.get("content") or data.get("output") or ""
            lc_messages.append(HumanMessage(content=content))

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
            lc_messages.append(AIMessage(content=content, tool_calls=tool_calls))

        elif role == "tool":
            content = data.get("content") or ""
            tool_call_id = (
                data.get("call_id") or data.get("tool_call_id") or data.get("id") or ""
            )
            name = data.get("name") or ""
            lc_messages.append(
                ToolMessage(content=content, tool_call_id=tool_call_id, name=name)
            )
        else:
            # Unknown role: ignore
            continue
    return lc_messages


def _format_ai_for_history(ai: AIMessage) -> HistoryMessage:
    # Extract textual output
    output_text = _extract_text_from_content(ai.content)
    # Extract reasoning summary if present in response metadata
    reasoning_text = ""
    try:
        metadata = getattr(ai, "response_metadata", {}) or {}
        # Various providers may return reasoning in different shapes
        if isinstance(metadata, dict):
            if isinstance(metadata.get("reasoning"), dict):
                reasoning_text = (
                    metadata["reasoning"].get("summary")
                    or metadata["reasoning"].get("text")
                    or metadata["reasoning"].get("content")
                    or ""
                )
        # For openai's responses API
        if isinstance(ai.content, list):
            for part in ai.content:
                if not isinstance(part, dict):
                    continue
                if part.get("type", "") == "reasoning":
                    summaries = part.get("summary", [])
                    for s in summaries:
                        reasoning_text = reasoning_text + s.get("text", "")
    except Exception:
        # No need to fail when we can't parse the lc_message.
        pass

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

        if not name or not call_id:
            continue

        tool_calls_payload.append(
            {
                "name": name,
                "call_id": call_id,
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
    response: AIMessage = await llm.bind(tools=body.tools).ainvoke(lc_messages)  # type: ignore
    ai_h = _format_ai_for_history(response)
    return ChatResponse(messages=[ai_h])


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/agent/stream")
async def agent_stream(body: ChatRequest):
    lc_messages = _history_to_langchain(body.messages)

    async def event_gen():
        final_sent = False
        acc = None
        try:
            async for chunk in llm.bind(tools=body.tools).astream(lc_messages):
                acc = acc + chunk if acc else chunk
                delta_ai = _format_ai_for_history(cast(AIMessageChunk, acc))
                yield _sse({"type": "acc", "message": delta_ai.model_dump()})

            final_sent = True
            final_h = _format_ai_for_history(cast(AIMessageChunk, acc))
            yield _sse({"type": "final", "message": final_h.model_dump()})

        except Exception as e:
            err_ai = AIMessage(content=f"Error during stream: {e}")
            ai_h = _format_ai_for_history(err_ai)
            final_sent = True
            yield _sse({"type": "final", "message": ai_h.model_dump()})

        finally:
            if not final_sent:
                ai_h = _format_ai_for_history(
                    AIMessage(content="Failed to respond to the query")
                )
                yield _sse({"type": "final", "message": ai_h.model_dump()})

    return StreamingResponse(event_gen(), media_type="text/event-stream")
