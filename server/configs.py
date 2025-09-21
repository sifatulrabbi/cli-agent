import os
from typing import Any


ENV = os.getenv("ENV", "prod")
DATA_DIR = "/tmp/cli-agent-server"
TODO_DATA_DIR = "/tmp/cli-agent-server/todos"
OPENAI_API_KEY: Any = os.getenv("OPENAI_API_KEY", "")
OPENROUTER_API_KEY: Any = os.getenv("OPENROUTER_API_KEY", "")

if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(TODO_DATA_DIR, exist_ok=True)

DB_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite+aiosqlite:///{DATA_DIR}/cli_agent.db",
)
