from __future__ import annotations

import base64
import json
import os
import time
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from app.gateway.ark_chat import complete_ark_chat
from app.gateway.csrf_middleware import is_secure_request
from app.gateway.image_generation.service import PromptCardStorageClient, StorageGatewayError
from app.gateway.internal_auth import create_internal_auth_headers
from app.gateway.local_session import LOCAL_SESSION_COOKIE, local_session_token
from app.gateway.model_management.catalog import MODELS, model_by_id
from app.gateway.model_management.connection_store import (
    CREDENTIAL_MASK,
    ModelManagementError,
    get_connection_store,
)
from app.gateway.model_management.contracts import ConnectionRequest
from app.gateway.model_management.service import ConnectionProbeError, probe_connection


class PromptCardRuntimeMessageRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    thread_id: str | None = Field(default=None, alias="threadId")
    content: str = Field(min_length=1, max_length=20_000)
    mode: str | None = None
    permission_scope: str = Field(
        default="workspace-chatbot-agent",
        alias="permissionScope",
    )
    session_key: str | None = Field(default=None, alias="sessionKey")
    project_id: str | None = Field(default=None, alias="projectId")
    workspace_context: dict[str, Any] | None = Field(
        default=None,
        alias="workspaceContext",
    )
    prompt_library: list[dict[str, Any]] = Field(
        default_factory=list,
        alias="promptLibrary",
        max_length=200,
    )


class PromptCardMediaAnalysisRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    thread_id: str | None = Field(default=None, alias="threadId")
    asset_id: str = Field(alias="assetId", min_length=1)
    content_type: str = Field(alias="contentType", min_length=1)
    analysis_type: str = Field(alias="analysisType")
    content: str = Field(default="", max_length=20_000)


class PromptCardModelConfigRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enabled: bool | None = None
    api_base: str | None = Field(default=None, alias="apiBase")
    api_key: str | None = Field(default=None, alias="apiKey")
    model_name: str | None = Field(default=None, alias="modelName")
    temperature: float | None = None
    max_tokens: int | None = Field(default=None, alias="maxTokens")


class PromptCardInternalChatRequest(BaseModel):
    model: str
    system_prompt: str = Field(default="", alias="systemPrompt")
    messages: list[dict[str, Any]] = Field(default_factory=list)
    tools: list[dict[str, Any]] = Field(default_factory=list)
    temperature: float | None = None
    max_tokens: int | None = Field(default=None, alias="maxTokens")


class PromptCardRuntimeService:
    async def status(self, request: Request) -> dict[str, Any]:
        text_agent_url = _text_agent_url()
        text_agent: dict[str, Any]
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                response = await client.get(f"{text_agent_url}/health")
                text_agent = {
                    "ok": response.status_code == 200,
                    "payload": response.json() if response.status_code == 200 else None,
                }
        except (httpx.HTTPError, ValueError):
            text_agent = {"ok": False}
        assignment = get_connection_store().assignment("chat.primary")
        return {
            "runtime": {
                "ok": True,
                "service": "promptcard-runtime",
                "orchestrator": "pi",
            },
            "auth": {"ok": True, "mode": "local-process-token"},
            "models": {"ok": assignment is not None, "count": 1 if assignment else 0},
            "tools": {"ok": text_agent["ok"], "count": 4},
            "storage": await _storage_health(),
            "textAgent": text_agent,
        }

    async def bootstrap(self, request: Request, response: Response) -> dict[str, Any]:
        response.set_cookie(
            key=LOCAL_SESSION_COOKIE,
            value=local_session_token(),
            httponly=True,
            secure=is_secure_request(request),
            samesite="strict",
        )
        return {
            "user": {
                "id": "local-promptcard-user",
                "email": "local@promptcard",
                "name": "Local PromptCard User",
            },
            "expires_in": None,
        }

    async def catalog(self, request: Request) -> dict[str, Any]:
        chat_models = [
            {
                "name": model["id"],
                "display_name": model["displayName"],
                "supports_vision": "image"
                in model.get("capabilities", {}).get("input", []),
                "supports_thinking": False,
                "provider": model["providerId"],
            }
            for model in MODELS
            if model["modality"] == "chat"
        ]
        return {
            "models": chat_models,
            "tools": [
                {"name": "search_prompt_library", "group": "prompt-library"},
                {"name": "emit_canvas_text_update", "group": "proposal"},
                {"name": "emit_canvas_text_create", "group": "proposal"},
                {"name": "emit_prompt_library_create", "group": "proposal"},
            ],
            "builtins": [],
            "subagentEnabled": False,
            "skills": [],
            "agents": [
                {
                    "id": "promptcard-text-agent",
                    "name": "PromptCard Text Agent",
                    "description": "pi orchestration with Ark multimodal text models",
                }
            ],
        }

    async def send_message(
        self,
        body: PromptCardRuntimeMessageRequest,
        request: Request,
    ) -> dict[str, Any]:
        payload = body.model_dump(by_alias=True)
        response = await _invoke_text_agent(payload)
        response["proposals"] = validate_agent_proposals(
            response.get("proposals") or [],
            workspace_context=body.workspace_context,
            permission_scope=body.permission_scope,
        )
        return response

    async def analyze_media(
        self,
        body: PromptCardMediaAnalysisRequest,
        request: Request,
    ) -> dict[str, Any]:
        if not body.content_type.startswith("image/"):
            raise HTTPException(status_code=422, detail="media_analysis_image_required")
        storage = PromptCardStorageClient()
        try:
            asset = await run_in_threadpool(storage.load_asset, body.asset_id)
        except StorageGatewayError:
            raise HTTPException(status_code=502, detail="media_asset_unavailable") from None
        finally:
            storage.close()
        if len(asset.content) > 30 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="media_asset_too_large")
        if not asset.content_type.startswith("image/"):
            raise HTTPException(status_code=422, detail="media_analysis_image_required")
        prompt = body.content.strip() or {
            "style": "分析这张图片的媒体风格，并给出可复用的视觉风格描述。",
            "prompt": "逆向拆解这张图片，输出可用于图片生成的结构化提示词。",
        }.get(body.analysis_type, "分析当前图片并回答用户问题。")
        response = await _invoke_text_agent(
            {
                "threadId": body.thread_id,
                "content": prompt,
                "permissionScope": "media-analysis-agent",
                "workspaceContext": None,
                "promptLibrary": [],
                "attachment": {
                    "assetId": body.asset_id,
                    "contentType": asset.content_type,
                    "data": base64.b64encode(asset.content).decode("ascii"),
                },
            }
        )
        response["proposals"] = []
        return response

    async def internal_chat(
        self,
        body: PromptCardInternalChatRequest,
    ) -> dict[str, Any]:
        return await run_in_threadpool(
            complete_ark_chat,
            body.model_dump(by_alias=True),
        )

    async def get_model_config(self, request: Request) -> dict[str, Any]:
        store = get_connection_store()
        assignment = store.assignment("chat.primary")
        connection = (
            store.get_connection(assignment["connectionId"])
            if assignment is not None
            else None
        )
        return {
            "enabled": bool(connection and connection.get("enabled", True)),
            "apiBase": connection.get("apiBase") if connection else "https://ark.cn-beijing.volces.com/api/v3",
            "apiKeyConfigured": bool(connection and connection.get("credentialConfigured")),
            "apiKeyPreview": CREDENTIAL_MASK if connection and connection.get("credentialConfigured") else None,
            "modelName": assignment["modelId"] if assignment else "doubao-seed-2-0-lite-260215",
            "temperature": 0.4,
            "maxTokens": 4096,
            "availableModels": [
                model["id"] for model in MODELS if model["modality"] == "chat"
            ],
        }

    async def save_model_config(
        self,
        body: PromptCardModelConfigRequest,
        request: Request,
    ) -> dict[str, Any]:
        model_id = (body.model_name or "doubao-seed-2-0-lite-260215").strip()
        model = model_by_id(model_id)
        provider_id = (
            str(model["providerId"])
            if model is not None
            else "deepseek"
        )
        api_base = body.api_base or {
            "volcengine-ark": "https://ark.cn-beijing.volces.com/api/v3",
            "deepseek": "https://api.deepseek.com",
        }[provider_id]
        get_connection_store().save_legacy_chat(
            ConnectionRequest(
                providerId=provider_id,
                displayName="Volcengine Ark" if provider_id == "volcengine-ark" else "DeepSeek",
                apiBase=api_base,
                enabled=True if body.enabled is None else body.enabled,
                credential=body.api_key,
            ),
            model_id,
        )
        return await self.get_model_config(request)

    async def test_model_config(
        self,
        body: PromptCardModelConfigRequest,
        request: Request,
    ) -> dict[str, Any]:
        store = get_connection_store()
        assignment = store.assignment("chat.primary")
        if assignment is None:
            raise ModelManagementError("assignment_not_found")
        connection = store.get_connection_config(assignment["connectionId"])
        credential = body.api_key or store.credential_store.get(connection["id"])
        if not credential:
            raise ModelManagementError("credential_missing")
        try:
            await run_in_threadpool(
                probe_connection,
                body.api_base or connection["apiBase"],
                credential,
            )
        except ConnectionProbeError:
            return {"success": False, "message": "Connection failed."}
        return {"success": True, "message": "Connection ok."}


def validate_agent_proposals(
    proposals: list[dict[str, Any]],
    *,
    workspace_context: dict[str, Any] | None,
    permission_scope: str,
) -> list[dict[str, Any]]:
    validated = []
    snapshot = (
        workspace_context.get("snapshot")
        if isinstance(workspace_context, dict)
        else {}
    ) or {}
    selected_node = snapshot.get("selectedNode")
    selected_text_id = (
        str(selected_node.get("id"))
        if isinstance(selected_node, dict)
        and selected_node.get("kind") == "text"
        and selected_node.get("id") == snapshot.get("selectedNodeId")
        else None
    )
    for index, proposal in enumerate(proposals):
        if not isinstance(proposal, dict):
            continue
        kind = proposal.get("kind")
        if (
            permission_scope == "workspace-chatbot-agent"
            and selected_text_id
            and kind == "free_canvas_text_update"
            and str(proposal.get("nodeId")) == selected_text_id
            and isinstance(proposal.get("userText"), str)
            and proposal["userText"].strip()
        ):
            validated.append(_proposal_base(proposal, index))
        elif (
            permission_scope == "workspace-chatbot-agent"
            and selected_text_id is None
            and kind == "free_canvas_text_create"
            and isinstance(proposal.get("userText"), str)
            and proposal["userText"].strip()
        ):
            validated.append(_proposal_base(proposal, index))
        elif (
            permission_scope == "prompt-library-agent"
            and kind == "prompt_library_write_proposal"
            and proposal.get("operation", "create") == "create"
            and isinstance(proposal.get("presetDraft"), dict)
            and str(proposal["presetDraft"].get("label") or "").strip()
            and str(proposal["presetDraft"].get("content") or "").strip()
        ):
            validated.append(_proposal_base(proposal, index))
    return validated


def _proposal_base(proposal: dict[str, Any], index: int) -> dict[str, Any]:
    return {
        **proposal,
        "id": str(proposal.get("id") or f"proposal-{int(time.time() * 1000)}-{index}"),
        "agentName": str(proposal.get("agentName") or "PromptCard Agent"),
        "status": "pending",
        "createdAt": int(proposal.get("createdAt") or int(time.time() * 1000)),
    }


async def _invoke_text_agent(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{_text_agent_url()}/invoke",
                headers=create_internal_auth_headers(),
                json=payload,
            )
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="text_agent_unavailable") from None
    if response.status_code == 409:
        raise HTTPException(status_code=409, detail="text_agent_session_mismatch")
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="text_agent_failed")
    return response.json()


def _text_agent_url() -> str:
    return os.getenv("PROMPTCARD_TEXT_AGENT_URL", "http://127.0.0.1:8011").rstrip("/")


async def _storage_health() -> dict[str, Any]:
    url = os.getenv(
        "PROMPTCARD_STORAGE_HEALTH_URL",
        "http://127.0.0.1:8002/health",
    )
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            response = await client.get(url)
        return {"ok": response.status_code == 200}
    except httpx.HTTPError:
        return {"ok": False}


def load_prompt_library_snapshot() -> list[dict[str, Any]]:
    path = Path(
        os.getenv(
            "PROMPTCARD_LIBRARY_FILE",
            "data/prompt-library-presets.json",
        )
    )
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    items = payload if isinstance(payload, list) else payload.get("presets", [])
    return [item for item in items if isinstance(item, dict)][:200]


runtime_service = PromptCardRuntimeService()
