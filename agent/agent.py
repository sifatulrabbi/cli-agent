from typing import cast, Annotated
from typing_extensions import TypedDict
from langchain_core.messages import (
    BaseMessage,
    HumanMessage,
    SystemMessage,
    BaseMessageChunk,
)
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from pydantic.types import SecretStr
from langgraph.graph import StateGraph, START
from langgraph.graph.message import add_messages
from langgraph.prebuilt.tool_node import ToolNode, tools_condition

from prompts import classifier_sys_prompt, coding_agent_sys_prompt
from tools.bash_tool import bash_tool
from tools.note_tool import note_tool


OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
available_categories = [
    "information_retrieval",
    "simple_task",
    "reasoning_task",
    "non_reasoning_task",
]


# TODO: add a proper type for the state
class State(TypedDict):
    messages: Annotated[list, add_messages]


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
    _reasoning_llm: ChatOpenAI
    _session_id: str
    _memory: AgentMemory

    def __init__(self, *, api_key: str, session_id: str, memory: AgentMemory) -> None:
        self._api_key = cast(SecretStr, api_key)
        self._session_id = session_id
        self._memory = memory
        self._classifier_llm = ChatOpenAI(
            api_key=self._api_key,
            model="openai/gpt-4.1-nano",
            base_url=OPENROUTER_BASE_URL,
        )
        self._fast_llm = ChatOpenAI(
            api_key=self._api_key,
            model="x-ai/grok-4-fast",
            base_url=OPENROUTER_BASE_URL,
        )
        self._reasoning_llm = ChatOpenAI(
            api_key=self._api_key,
            model="z-ai/glm-4.6",
            base_url=OPENROUTER_BASE_URL,
            # reasoning_effort="medium",
            # reasoning={
            #     "effort": "medium",
            #     "summary": "auto",
            # },
        )

        tool_node = ToolNode([bash_tool, note_tool])

        self._graph_builder = StateGraph(State)
        self._graph_builder.add_node("llm", self._llm_node)
        self._graph_builder.add_node("tools", tool_node)
        self._graph_builder.add_edge(START, "llm")
        self._graph_builder.add_conditional_edges("llm", tools_condition)
        self._graph_builder.add_edge("tools", "llm")
        self._workflow = self._graph_builder.compile()

    async def run(self, user_msg: str):
        history = await self._memory.load()
        history.append(HumanMessage(user_msg))

        try:
            final_result = await self._workflow.ainvoke({"messages": history})
        except Exception as e:
            print("Error in the run() function:", e)
            raise e

        history = final_result.get("messages")
        await self._memory.save(cast(list[BaseMessage], history))

    async def _llm_node(self, state):
        formatted_prompt = coding_agent_sys_prompt.format(
            notes="- The project is empty"
        )
        try:
            result: BaseMessageChunk | None = None
            stream = self._reasoning_llm.astream(
                [
                    SystemMessage(formatted_prompt),
                    *state.get("messages"),
                ]
            )
            async for chunk in stream:
                if not result:
                    result = chunk
                else:
                    result = result + chunk
            return {"messages": result}
        except Exception as e:
            print("Error in the _llm_node:", e)
            raise e

    async def _tools_node(self, state: State):
        return {}

    async def _classifier(self, user_msg: str):
        chain = (
            ChatPromptTemplate.from_messages(
                [
                    SystemMessage(classifier_sys_prompt),
                    HumanMessage(content="{user_msg}"),
                ]
            )
            | self._classifier_llm
        )
        res = chain.invoke({"user_msg": user_msg})
        category = str(res.content if res.content else "").strip()
        for c in available_categories:
            if c in category:
                print("    category:", c)
                return c
        print("    category:", "non_reasoning_task")
        return "non_reasoning_task"  # fallback

    def _route_to_llm(self, category: str):
        if category == "reasoning_task":
            return self._reasoning_llm
        else:
            return self._fast_llm
