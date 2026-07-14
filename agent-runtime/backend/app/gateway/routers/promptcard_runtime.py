from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from app.gateway.model_management.connection_store import ModelManagementError
from app.gateway.model_management.credential_store import CredentialStoreError
from app.gateway.promptcard_runtime import (
    PromptCardModelConfigRequest,
    PromptCardRuntimeMessageRequest,
    runtime_service,
)

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
    try:
        return await runtime_service.catalog(request)
    except (ModelManagementError, CredentialStoreError) as exc:
        raise _model_http_error(exc) from None


@router.get("/model-config", deprecated=True)
async def model_config(request: Request) -> dict[str, Any]:
    try:
        return await runtime_service.get_model_config(request)
    except (ModelManagementError, CredentialStoreError) as exc:
        raise _model_http_error(exc) from None


@router.put("/model-config", deprecated=True)
async def save_model_config(body: PromptCardModelConfigRequest, request: Request) -> dict[str, Any]:
    try:
        return await runtime_service.save_model_config(body, request)
    except (ModelManagementError, CredentialStoreError) as exc:
        raise _model_http_error(exc) from None


@router.post("/model-config/test", deprecated=True)
async def test_model_config(body: PromptCardModelConfigRequest, request: Request) -> dict[str, Any]:
    try:
        return await runtime_service.test_model_config(body, request)
    except (ModelManagementError, CredentialStoreError) as exc:
        raise _model_http_error(exc) from None


@router.post("/messages", response_model=PromptCardRuntimeMessageResponse)
async def messages(body: PromptCardRuntimeMessageRequest, request: Request) -> dict[str, Any]:
    try:
        return await runtime_service.send_message(body, request)
    except (ModelManagementError, CredentialStoreError) as exc:
        raise _model_http_error(exc) from None


def _model_http_error(exc: ModelManagementError | CredentialStoreError) -> HTTPException:
    code = exc.code
    if code in {
        "credential_store_unavailable",
        "connection_store_unavailable",
        "migration_failed",
    }:
        status_code = 503
    elif code == "connection_is_assigned":
        status_code = 409
    else:
        status_code = 422
    return HTTPException(status_code=status_code, detail=code)
