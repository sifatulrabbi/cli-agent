import json
from typing import Any, cast, Annotated
from langgraph.graph.state import RunnableConfig
from typing_extensions import TypedDict
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from pydantic.types import SecretStr
from langgraph.graph import StateGraph, START
from langgraph.graph.message import add_messages
from langgraph.prebuilt.tool_node import tools_condition

from prompts import classifier_sys_prompt, coding_agent_sys_prompt
from tools.bash_tool import bash_tool
from tools.note_tool import note_tool


OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
available_categories = [
    "basic_chat",
    "low_reasoning_task",
    "high_reasoning_task",
]
_available_tools = {
    "bash": bash_tool,
    "note": note_tool,
}


# TODO: add a proper type for the state
class State(TypedDict):
    messages: Annotated[list, add_messages]
    category: str


class AgentMemory:
    _history: list[BaseMessage] = []

    def __init__(self, *, session_id: str) -> None:
        self.session_id = session_id

    async def load(self) -> list[BaseMessage]:
        return self._history

    async def save(self, history: list[BaseMessage]) -> bool:
        self._history = history
        return True


class Agent:
    _api_key: SecretStr
    _classifier_llm: ChatOpenAI
    _fast_llm: ChatOpenAI
    _low_reasoning_llm: ChatOpenAI
    _reasoning_llm: ChatOpenAI
    _session_id: str
    _memory: AgentMemory

    def __init__(self, *, api_key: str, session_id: str, memory: AgentMemory) -> None:
        self._api_key = cast(SecretStr, api_key)
        self._session_id = session_id
        self._memory = memory
        self._classifier_llm = ChatOpenAI(
            api_key=self._api_key,
            model="gpt-4.1-nano",
            base_url=OPENROUTER_BASE_URL,
        )
        self._fast_llm = ChatOpenAI(
            api_key=self._api_key,
            model="x-ai/grok-4-fast",
            base_url=OPENROUTER_BASE_URL,
        )
        self._low_reasoning_llm = ChatOpenAI(
            api_key=self._api_key,
            model="openai/gpt-5-mini",
            base_url=OPENROUTER_BASE_URL,
            reasoning_effort="low",
        )
        self._reasoning_llm = ChatOpenAI(
            api_key=self._api_key,
            model="openai/gpt-5-mini",
            base_url=OPENROUTER_BASE_URL,
            reasoning_effort="medium",
        )

        self._graph_builder = StateGraph(State)
        self._graph_builder.add_node("llm", self._llm_node)
        self._graph_builder.add_node("tools", self._tools_node)
        self._graph_builder.add_edge(START, "llm")
        self._graph_builder.add_conditional_edges("llm", tools_condition)
        self._graph_builder.add_edge("tools", "llm")
        self._workflow = self._graph_builder.compile()
        self._default_cfg = RunnableConfig(recursion_limit=10**10)

    async def run(self, user_msg: str):
        history = await self._memory.load()
        history.append(HumanMessage(user_msg))

        try:
            category = await self._classifier(history)
            final_result = await self._workflow.ainvoke(
                {"messages": history, "category": category},
                config=self._default_cfg,
            )
        except Exception as e:
            print("Error in the run() function:", e)
            raise e

        history = final_result["messages"]
        await self._memory.save(cast(list[BaseMessage], history))

    async def _llm_node(self, state):
        formatted_prompt = coding_agent_sys_prompt.format(notes=self._get_notes())
        messages = [SystemMessage(formatted_prompt), *state["messages"]]

        result: Any = None
        try:
            stream = self._reasoning_llm.bind_tools(
                [_available_tools[k] for k in _available_tools.keys()]
            ).astream(messages)
            async for chunk in stream:
                if not result:
                    result = chunk
                else:
                    result = result + chunk
                print(chunk.content, end="", flush=True)

            if result.content:
                print()
            return {"messages": [result]}

        except Exception as e:
            print("Error in the _llm_node:", e)
            raise e

    async def _tools_node(self, state: State):
        last_msg = state.get("messages")[-1]
        if not isinstance(last_msg, AIMessage):
            return {}

        tool_msgs: list[ToolMessage] = []

        for tc in last_msg.tool_calls:
            tool_fn = _available_tools[tc["name"]]
            tool_result = await tool_fn.ainvoke(tc["args"])
            tool_msgs.append(
                ToolMessage(
                    content=json.dumps(tool_result),
                    name=tc["name"],
                    tool_call_id=tc["id"],
                )
            )

            print(f"[[TOOL]] {tc['name']}")
            print(f"[[TOOL ARGS]] {tc['args']}")
        return {"messages": tool_msgs}

    async def _classifier(self, history: list[BaseMessage]):
        formatted_history = "<conversation_history>"
        for msg in history:
            if msg.type == "user" or msg.type == "human":
                formatted_history = (
                    formatted_history
                    + f"\n<user_message>\n{msg.content}\n</user_message>"
                )
            elif msg.type == "assistant" or msg.type == "ai":
                formatted_history = (
                    formatted_history
                    + f"\n<assistant_message>\n{msg.content}\n</assistant_message>"
                )
        formatted_history = formatted_history + "\n</conversation_history>"

        res = self._classifier_llm.invoke(
            [
                SystemMessage(classifier_sys_prompt),
                HumanMessage(
                    content=f"{formatted_history}\n\nNow based on the conversation history above categorize the complexity of the last most <user_message>."
                ),
            ]
        )
        category = str(res.content if res.content else "").strip()
        print(f"  [classifier: {category}]")
        for c in available_categories:
            if c in category:
                return c
        return "low_reasoning_task"  # fallback

    def _route_to_llm(self, category: str):
        if category == "high_reasoning_task":
            return self._reasoning_llm
        elif category == "low_reasoning_task":
            return self._low_reasoning_llm
        else:  # basic_chat
            return self._fast_llm

    def _get_notes(self) -> str:
        base_path = "/Users/sifatul/coding/cli-agent/agent/tmp/cli-agent-notes.md"
        with open(base_path) as f:
            content = f.read()
        return content
