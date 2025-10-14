import os
import asyncio
from dotenv import load_dotenv

from agent import Agent, AgentMemory
# from multi_step_agent import multi_step_agent


async def main():
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    session_id = "test-session"
    memory = AgentMemory(session_id=session_id)
    agent = Agent(api_key=api_key, session_id=session_id, memory=memory)

    while True:
        user_msg = input("USER: ")
        if user_msg.strip() in ["q", "/exit", "exit", "quit", "/quit"]:
            exit(0)
        print("AI: ", end="", flush=True)

        await agent.run(user_msg)
        # await multi_step_agent(user_msg)

        print()
        print("-" * 80)
        print()


if __name__ == "__main__":
    load_dotenv()
    asyncio.run(main())
