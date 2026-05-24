from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from app.gateway.promptcard_runtime import PromptCardRuntimeMessageRequest, runtime_service

router = APIRouter(prefix="/api/promptcard/runtime", tags=["promptcard-runtime"])


class PromptCardRuntimeMessageResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    thread_id: str = Field(alias="threadId")
    text: str
    proposals: list[dict[str, Any]]
    diagnostics: dict[str, Any] = Field(default_factory=dict)


@router.get("/status")
async def status(request: Request) -> dict[str, Any]:
    return await runtime_service.status(request)


@router.post("/bootstrap")
async def bootstrap(request: Request, response: Response) -> dict[str, Any]:
    return await runtime_service.bootstrap(request, response)


@router.get("/catalog")
async def catalog(request: Request) -> dict[str, Any]:
    return await runtime_service.catalog(request)


@router.post("/messages", response_model=PromptCardRuntimeMessageResponse)
async def messages(body: PromptCardRuntimeMessageRequest, request: Request) -> dict[str, Any]:
    return await runtime_service.send_message(body, request)
