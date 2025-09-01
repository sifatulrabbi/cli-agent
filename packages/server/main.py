import os
import sys
import uvicorn
from dotenv import load_dotenv

# Ensure this file's directory is importable so we can import agent.py next to us
CURRENT_DIR = os.path.dirname(__file__)
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)

load_dotenv()

try:
    import agent
except Exception as exc:
    raise RuntimeError("Failed to import agent.py for graph streaming") from exc

if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host="127.0.0.1",
        port=8080,
        reload=os.getenv("ENV", "local") == "local",
    )
