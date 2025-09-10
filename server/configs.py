import os
from typing import Any


DATA_DIR = "/tmp/cli-agent-server"
TODO_DATA_DIR = "/tmp/cli-agent-server/todos"
OPENAI_API_KEY: Any = os.getenv("OPENAI_API_KEY", "")
OPENROUTER_API_KEY: Any = os.getenv("OPENROUTER_API_KEY", "")

if not os.path.exists(DATA_DIR):
    os.mkdir(DATA_DIR)
    os.mkdir(TODO_DATA_DIR)
