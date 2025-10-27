from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db import prepare_db
from api.chat_session_router import chat_sessions_router


app = FastAPI(title="CLI-Agent Server", version="0.5.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "PATCH", "DELETE", "PUT"],
    allow_headers=["*"],
)
app.include_router(chat_sessions_router)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await prepare_db()
    yield
