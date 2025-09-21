from pydantic import BaseModel
from typing import Optional


class ChatSessionModelInfo(BaseModel):
    model_name: str
    reasoning_effort: str


class ChatSessionEnvInfo(BaseModel):
    os_name: str
    os_arch: str
    total_memory: Optional[int]
    total_cpu: Optional[int]
    total_storage: Optional[int]


class CreateChatSessionPayload(BaseModel):
    working_path: str
    model_info: ChatSessionModelInfo
    env_info: ChatSessionEnvInfo
