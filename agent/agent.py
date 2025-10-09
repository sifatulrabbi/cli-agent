from typing import cast
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from pydantic.types import SecretStr
from prompts import classifier_sys_prompt, coding_agent_sys_prompt


OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
available_categories = [
    "information_retrieval",
    "simple_task",
    "reasoning_task",
    "non_reasoning_task",
]


class AgentMemory:
    _history: list[BaseMessage] = []

    def __init__(self, *, session_id: str) -> None:
        self.session_id = session_id

    def load(self) -> list[BaseMessage]:
        return self._history

    def save(self, history: list[BaseMessage]) -> bool:
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
            reasoning_effort="medium",
            reasoning={
                "effort": "medium",
                "summary": "auto",
            },
        )

    def run(self, user_msg: str):
        category = self._classifier(user_msg)
        llm = self._route_to_llm(category)

        history = self._memory.load()
        history.append(HumanMessage(user_msg))

        result = llm.invoke([SystemMessage(coding_agent_sys_prompt), *history])

        history.append(result)
        self._memory.save(history)

        return result.content

    def _classifier(self, user_msg: str):
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
                return c
        return "non_reasoning_task"  # fallback

    def _route_to_llm(self, category: str):
        if category == "reasoning_task":
            return self._reasoning_llm
        else:
            return self._fast_llm
