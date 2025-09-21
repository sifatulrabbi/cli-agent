import json
from typing import cast
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
)
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI


@tool
def get_weather_info(city_name: str, country_name: str):
    """Get the current weather information of a city."""
    return f"The currently temperature in {city_name}, {country_name} is 27 degree celsius with light rain that might continue for another hour."


llm = ChatOpenAI(
    model="gpt-4.1-mini",
    use_responses_api=True,
    # reasoning={
    #     "effort": "medium",
    #     "summary": "auto",
    # },
    output_version="responses/v1",
).bind_tools([get_weather_info])

messages: list[BaseMessage] = [
    SystemMessage(
        """\
You are an helpful assistant. You will assist the user with their requests.
"""
    ),
    HumanMessage("What is the current weather in Dhaka, Bangladesh?"),
]
response = llm.invoke(messages)
messages.append(response)
response = cast(AIMessage, response)

if response.tool_calls and len(response.tool_calls) > 0:
    for tc in response.tool_calls:
        if tc.get("name", "") == "get_weather_info":
            tool_msg = get_weather_info.invoke(tc)
            messages.append(tool_msg)
    response = llm.invoke(messages)
    messages.append(response)


with open("./tests/messages-gpt41-mini.json", "w") as f:
    obj_messages = []
    for msg in messages:
        obj_messages.append(msg.model_dump())
    json.dump(obj_messages, f, indent=2)
