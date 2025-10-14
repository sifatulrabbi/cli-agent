# import os
import asyncio
from dotenv import load_dotenv

# from agent import Agent, AgentMemory
from agents.decide_then_exec import run_decide_then_exec_agent


async def main():
    # api_key = os.getenv("OPENROUTER_API_KEY", "")
    # session_id = "test-session"
    # memory = AgentMemory(session_id=session_id)
    # agent = Agent(api_key=api_key, session_id=session_id, memory=memory)

    history = []
    while True:
        user_msg = input("USER: ")
        if user_msg.strip() in ["q", "/exit", "exit", "quit", "/quit"]:
            exit(0)
        print("AI: ", end="", flush=True)

        # await agent.run(user_msg)
        history = await run_decide_then_exec_agent(user_msg, history)

        print()
        print("-" * 80)
        print()


if __name__ == "__main__":
    load_dotenv()
    asyncio.run(main())
