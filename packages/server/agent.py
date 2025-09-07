import os
from typing import Any, AsyncGenerator, Sequence, cast
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage
from pydantic import BaseModel


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


async def invoke_llm_with_tools(
    messages: Sequence[BaseMessage], tools=[]
) -> AsyncGenerator[BaseMessage, Any]:
    stream = llm.bind_tools(tools).astream(messages)
    acc = None
    async for chunk in stream:
        if not acc:
            acc = chunk
        else:
            acc = acc + chunk
        yield cast(BaseMessage, acc)


@app.post("/agent/chat")
async def agent_chat(messages: list[dict]):
    pass
