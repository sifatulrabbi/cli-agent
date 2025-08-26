from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph.message import Messages, add_messages
from langgraph.graph import StateGraph, START, END
from langchain.chat_models import init_chat_model

# OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
llm = init_chat_model(model="openai:gpt-4.1-mini")


class State(TypedDict):
    messages: Annotated[Messages, add_messages] = []


def chatbot(state: State):
    return {"messages": [llm.invoke(state["messages"])]}


graph_builder = StateGraph(State)
graph_builder.add_node("chatbot", chatbot)
graph_builder.add_edge(START, "chatbot")
graph_builder.add_edge("chatbot", END)

graph = graph_builder.compile()


if __name__ == "__main__":

    def stream_graph_updates(user_input: str):
        for event in graph.stream(
            {"messages": [{"role": "user", "content": user_input}]}
        ):
            for value in event.values():
                print("Assistant:", value["messages"][-1].content)

    while True:
        try:
            user_input = input("User: ")
            if user_input.lower() in ["quit", "exit", "q"]:
                print("Goodbye!")
                break
            stream_graph_updates(user_input)
        except:
            # fallback if input() is not available
            user_input = "What do you know about LangGraph?"
            print("User: " + user_input)
            stream_graph_updates(user_input)
            break
