from langchain_core.tools import tool
from pydantic import BaseModel, Field


class WorkerAgentArgsSchema(BaseModel):
    instructions: str = Field(
        ..., description="Detailed instructions for the worker agent to follow."
    )
    mode: str = Field(..., description="Either 'debugger' or 'coder'")


@tool("worker_agent", args_schema=None, description="")
async def worker_agent(instructions: str, mode: str):
    return
