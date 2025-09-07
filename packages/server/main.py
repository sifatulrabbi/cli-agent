import os
import uvicorn
from dotenv import load_dotenv

load_dotenv()

if __name__ == "__main__":
    uvicorn.run(
        "agent:app",
        host="127.0.0.1",
        port=8080,
        reload=os.getenv("ENV", "local") == "local",
    )
