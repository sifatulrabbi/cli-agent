import os
from typing import Any, cast
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.graph.state import RunnableConfig
from pydantic import BaseModel, Field

from tools.bash_tool import bash_tool
from tools.note_tool import note_tool
from prompts import coding_agent_sys_prompt, coding_worker_sys_prompt


class TaskSchema(BaseModel):
    id: int = Field(..., description="Incremental ID for the task, starts from 1.")
    description: str = Field(..., description="Detailed description of the task.")


class StepByStepArgsSchema(BaseModel):
    tasks: list[TaskSchema] = Field(
        ..., description="Step by step tasks to handle the request."
    )
    message: str = Field(
        ...,
        description="A short message to the user to let them know what you're about to do.",
    )


_default_config = RunnableConfig(recursion_limit=10**10)


def get_notes():
    with open("/Users/sifatul/coding/cli-agent/agent/tmp/cli-agent-notes.md", "r") as f:
        content = f.read()
    return content


@tool(
    "step_by_step_execution",
    args_schema=StepByStepArgsSchema,
    description=(
        "Invoke this tool to handle complex or multi-stage tasks that require deep reasoning, "
        "precise planning, or many modifications — such as feature implementation, debugging, "
        "bug fixing, optimization, or multi-file refactors. "
        "When used, this tool will spawn a specialized version of the agent to execute the task "
        "step by step with full autonomy and all tool access."
    ),
)
async def step_by_step_execution_tool(tasks: list[TaskSchema], message: str):
    print("\nHandling tasks step by step:")
    for t in tasks:
        print(f"[{t.id}]", t.description)
    print("-" * 5)

    available_tools_map = {
        "bash": bash_tool,
        "note": note_tool,
    }
    llm = ChatOpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        model="gpt-5-mini",
        reasoning_effort="medium",
    )
    llm_with_tools = llm.bind_tools([bash_tool, note_tool])

    final_response = ""

    for task in tasks:
        print(f"\n--- Working on task [{task.id}] ---")
        history: list = [HumanMessage("Handle this task:\n\n" + task.description)]

        while True:
            ai_response: Any = None
            stream = llm_with_tools.astream(
                [
                    SystemMessage(coding_worker_sys_prompt.format(notes=get_notes())),
                    *history,
                ],
                _default_config,
            )
            async for chunk in stream:
                ai_response = ai_response + chunk if ai_response else chunk
                print(chunk.content, end="", flush=True)
            print()

            history.append(ai_response)

            if hasattr(ai_response, "tool_calls"):
                for tc in cast(AIMessage, ai_response).tool_calls:
                    print(f"[TOOL: {tc['name']}]", tc["args"])
                    tool_func = available_tools_map.get(tc["name"], None)
                    if not tool_func:
                        tool_result = "Invalid tool name! Please use a valid tool."
                        print("xxx Invalid tool call! xxx")
                    else:
                        tool_result = await tool_func.ainvoke(tc["args"])
                    history.append(
                        ToolMessage(
                            content=tool_result,
                            name=tc["name"],
                            tool_call_id=tc["id"],
                        )
                    )
            else:
                break

        final_response = (
            final_response
            + f'<task id="{task.id}">\n\
            <description>\n\
            {task.description}\n\
            </description>\n\
            <result>\n\
            {history[-1].content}\n\
            </result>\n\
            </task>\n'
        )

    return final_response


async def run_decide_then_exec_agent(user_msg: str, memory: list):
    available_tools_map = {
        "bash": bash_tool,
        "note": note_tool,
        "step_by_step_execution": step_by_step_execution_tool,
    }
    llm = ChatOpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        model="gpt-5-mini",
        reasoning_effort="minimal",
    )
    llm_with_tools = llm.bind_tools([bash_tool, note_tool, step_by_step_execution_tool])
    history = memory

    history.append(HumanMessage(user_msg))

    while True:
        ai_response: Any = None
        stream = llm_with_tools.astream(
            [
                SystemMessage(coding_agent_sys_prompt.format(notes=get_notes())),
                *history,
            ],
            _default_config,
        )
        async for chunk in stream:
            ai_response = ai_response + chunk if ai_response else chunk
            print(chunk.content, end="", flush=True)
        print()

        history.append(ai_response)

        if hasattr(ai_response, "tool_calls"):
            for tc in cast(AIMessage, ai_response).tool_calls:
                print(f"[TOOL: {tc['name']}]", tc["args"])
                tool_func = available_tools_map.get(tc["name"], None)
                if not tool_func:
                    tool_result = "Invalid tool name! Please use a valid tool."
                    print("xxx Invalid tool call! xxx")
                else:
                    tool_result = await tool_func.ainvoke(tc["args"])
                history.append(
                    ToolMessage(
                        content=tool_result,
                        name=tc["name"],
                        tool_call_id=tc["id"],
                    )
                )
        else:
            break
    return history
