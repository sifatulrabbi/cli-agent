import asyncio
from typing import Annotated, Any, AsyncGenerator, Sequence, cast
from typing_extensions import TypedDict
from langchain_core.messages import (
    AIMessageChunk,
    HumanMessage,
    MessageLikeRepresentation,
)
from langgraph.graph.message import Messages, add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.graph import StateGraph, START, END
from langchain.chat_models import init_chat_model
from langchain_core.tools import tool

# OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
_llm = init_chat_model(model="openai:gpt-4.1-mini", use_responses_api=True)


@tool
async def get_weather(city: str):
    """Get the current weather information of a city."""
    return f"Current temperature in {city} is 30 degree celsius."


tools = [get_weather]


class State(TypedDict):
    messages: Annotated[Messages, add_messages]


async def _llm_node(state: State):
    llminput = cast(Sequence[MessageLikeRepresentation], state.get("messages"))
    response = await _llm.bind_tools(tools).ainvoke(llminput)
    return {"messages": [response]}


# async def custom_tool_node(state: State):
#     return {"messages": []}


graph = (
    StateGraph(State)
    .add_node("llm", _llm_node)
    .add_node("tools", ToolNode(tools))
    .add_edge(START, "llm")
    .add_conditional_edges("llm", tools_condition)
    .add_edge("tools", "llm")
    .compile()
)


async def invoke_agent(
    user_input: str,
) -> AsyncGenerator[str, str]:
    graph_input = cast(State, {"messages": [HumanMessage(content=user_input)]})
    acc = None
    async for chunk in graph.astream(graph_input, stream_mode="messages"):
        # casting type for better linting
        msg_chunk, metadata = cast(tuple[AIMessageChunk, dict[str, Any]], chunk)
        if not msg_chunk or not msg_chunk.content:
            continue
        if not acc:
            acc = msg_chunk
        else:
            acc = acc + msg_chunk

        final_content = msg_chunk.text()

        if (
            hasattr(msg_chunk, "tool_call_chunks")
            and len(msg_chunk.tool_call_chunks) > 0
        ) or ((hasattr(msg_chunk, "tool_calls") and len(msg_chunk.tool_calls) > 0)):
            final_content = final_content + "Using tools..."

        yield final_content


if __name__ == "__main__":

    async def _stream_graph_updates(user_input: str):
        async for chunk in invoke_agent(user_input):
            print(chunk, end="", flush=True)
        print()

    async def _run_cli():
        while True:
            user_input = input("User: ")
            if user_input.lower() in ["quit", "exit", "q"]:
                print("Goodbye!")
                break
            await _stream_graph_updates(user_input)

    asyncio.run(_run_cli())
