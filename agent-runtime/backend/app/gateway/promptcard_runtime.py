from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from app.gateway.deps import get_local_provider, get_thread_store
from app.gateway.routers import agents, auth, models, skills, thread_runs, threads, tools
from deerflow.config.app_config import get_app_config
from deerflow.config.model_config import ModelConfig
from deerflow.tools.promptcard_library import _load_presets


class PromptCardRuntimeMessageRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    thread_id: str | None = Field(default=None, alias="threadId")
    content: str
    mode: str | None = None
    permission_scope: str | None = Field(default=None, alias="permissionScope")
    session_key: str | None = Field(default=None, alias="sessionKey")
    project_id: str | None = Field(default=None, alias="projectId")
    workspace_context: dict[str, Any] | None = Field(default=None, alias="workspaceContext")


class PromptCardModelConfigRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enabled: bool | None = None
    api_base: str | None = Field(default=None, alias="apiBase")
    api_key: str | None = Field(default=None, alias="apiKey")
    model_name: str | None = Field(default=None, alias="modelName")
    temperature: float | None = None
    max_tokens: int | None = Field(default=None, alias="maxTokens")


class PromptCardRuntimeService:
    async def status(self, request: Request) -> dict[str, Any]:
        config = _request_config(request)
        storage = _storage_health()
        admin_count = None
        auth_ready = False
        try:
            admin_count = await get_local_provider().count_admin_users()
            auth_ready = True
        except Exception:
            auth_ready = False

        return {
            "runtime": {"ok": True, "service": "promptcard-runtime-boundary"},
            "auth": {"ok": auth_ready, "adminCount": admin_count},
            "models": {"ok": bool(config.models), "count": len(config.models)},
            "tools": {"ok": True, "count": len(config.tools)},
            "storage": storage,
        }

    async def bootstrap(self, request: Request, response: Response) -> dict[str, Any]:
        payload = await auth.promptcard_bootstrap(request, response)
        return _model_or_value(payload)

    async def catalog(self, request: Request) -> dict[str, Any]:
        config = _request_config(request)
        apply_model_config_to_runtime(config)
        model_payload = await models.list_models(config)
        tool_payload = await tools.list_tools(config)
        try:
            skill_payload = await skills.list_skills(config)
        except Exception:
            skill_payload = {"skills": []}
        try:
            agent_payload = await agents.list_agents()
        except Exception:
            agent_payload = {"agents": []}

        return {
            "models": _model_or_value(model_payload).get("models", []),
            "tools": _model_or_value(tool_payload).get("tools", []),
            "builtins": _model_or_value(tool_payload).get("builtins", []),
            "subagentEnabled": _model_or_value(tool_payload).get("subagent_enabled", False),
            "skills": _model_or_value(skill_payload).get("skills", []),
            "agents": _model_or_value(agent_payload).get("agents", []),
        }

    async def get_model_config(self, request: Request) -> dict[str, Any]:
        config = _request_config(request)
        apply_model_config_to_runtime(config)
        return model_config_response(config)

    async def save_model_config(self, body: PromptCardModelConfigRequest, request: Request) -> dict[str, Any]:
        config = _request_config(request)
        current = read_model_config(config)
        next_config = {
            **current,
            **{key: value for key, value in {
                "enabled": body.enabled,
                "apiBase": body.api_base,
                "apiKey": body.api_key,
                "modelName": body.model_name,
                "temperature": body.temperature,
                "maxTokens": body.max_tokens,
            }.items() if value is not None},
        }
        if body.api_key == "":
            next_config["apiKey"] = ""
        persist_model_config(next_config)
        apply_model_config_to_runtime(config, next_config)
        return model_config_response(config)

    async def test_model_config(self, body: PromptCardModelConfigRequest, request: Request) -> dict[str, Any]:
        config = _request_config(request)
        candidate = {
            **read_model_config(config),
            **{key: value for key, value in {
                "enabled": body.enabled,
                "apiBase": body.api_base,
                "apiKey": body.api_key,
                "modelName": body.model_name,
                "temperature": body.temperature,
                "maxTokens": body.max_tokens,
            }.items() if value is not None},
        }
        api_key = str(candidate.get("apiKey") or "").strip()
        if not api_key:
            return {"success": False, "message": "DeepSeek API Key is not configured."}
        api_base = str(candidate.get("apiBase") or "https://api.deepseek.com").rstrip("/")
        request_url = f"{api_base}/models"
        try:
            req = urllib.request.Request(request_url, headers={"Authorization": f"Bearer {api_key}"})
            with urllib.request.urlopen(req, timeout=8) as response:
                if 200 <= response.status < 300:
                    return {"success": True, "message": "DeepSeek connection ok."}
                return {"success": False, "message": f"DeepSeek returned HTTP {response.status}."}
        except urllib.error.HTTPError as exc:
            return {"success": False, "message": f"DeepSeek returned HTTP {exc.code}."}
        except OSError as exc:
            return {"success": False, "message": f"DeepSeek connection failed: {exc}"}

    async def send_message(self, body: PromptCardRuntimeMessageRequest, request: Request) -> dict[str, Any]:
        thread_id = body.thread_id
        permission_scope = body.permission_scope or (
            "workspace-chatbot-agent" if body.workspace_context else "prompt-library-agent"
        )
        project_id = body.project_id or _workspace_project_id(body.workspace_context)
        thread_metadata = _thread_metadata(body, permission_scope, project_id)
        if not thread_id:
            thread_response = await threads.create_thread(
                threads.ThreadCreateRequest(
                    metadata=thread_metadata,
                ),
                request,
            )
            thread_id = thread_response.thread_id
        else:
            await validate_thread_metadata(thread_id, thread_metadata, request)
        prompt = build_runtime_prompt(
            body.content,
            body.workspace_context,
            permission_scope=permission_scope,
        )
        apply_model_config_to_runtime(_request_config(request))
        model_name = default_model_name(_request_config(request))
        run_payload = await thread_runs.wait_run(
            thread_id=thread_id,
            body=thread_runs.RunCreateRequest(
                assistant_id="lead_agent",
                input={"messages": [{"role": "user", "content": prompt}]},
                context={
                    "model_name": model_name,
                    "thinking_enabled": False,
                    "subagent_enabled": True,
                    "max_concurrent_subagents": 2,
                },
                stream_mode=["values"],
            ),
            request=request,
        )
        text = extract_assistant_text(run_payload)
        proposals = parse_agent_workspace_proposals(
            text,
            workspace_context=body.workspace_context,
            permission_scope=permission_scope,
        )
        return {
            "threadId": thread_id,
            "text": text,
            "proposals": proposals,
            "diagnostics": {
                "proposalCount": len(proposals),
                "sessionKey": body.session_key,
                "projectId": project_id,
                "mode": body.mode,
            },
        }


runtime_service = PromptCardRuntimeService()


def _workspace_project_id(workspace_context: dict[str, Any] | None) -> str | None:
    if not isinstance(workspace_context, dict):
        return None
    value = workspace_context.get("projectId")
    return str(value) if value else None


def _thread_metadata(
    body: PromptCardRuntimeMessageRequest,
    permission_scope: str,
    project_id: str | None,
) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "source": "promptcard-runtime-boundary",
        "mode": body.mode,
        "permissionScope": permission_scope,
    }
    if body.session_key:
        metadata["sessionKey"] = body.session_key
    if project_id:
        metadata["projectId"] = project_id
    return metadata


async def validate_thread_metadata(thread_id: str, expected: dict[str, Any], request: Request) -> None:
    session_key = expected.get("sessionKey")
    if not session_key:
        return
    thread_store = get_thread_store(request)
    record = await thread_store.get(thread_id)
    metadata = record.get("metadata", {}) if isinstance(record, dict) else {}
    if not metadata:
        raise HTTPException(status_code=409, detail="Agent thread is missing PromptCard session metadata.")
    checks = [
        ("sessionKey", session_key),
        ("projectId", expected.get("projectId")),
        ("permissionScope", expected.get("permissionScope")),
    ]
    for key, expected_value in checks:
        if expected_value is None:
            continue
        actual_value = metadata.get(key)
        if actual_value != expected_value:
            raise HTTPException(
                status_code=409,
                detail=f"Agent thread metadata mismatch for {key}.",
            )


def model_config_path() -> Path:
    home = Path(os.getenv("DEER_FLOW_HOME") or ".deer-flow")
    return home / "promptcard-model-config.json"


def read_model_config(config: Any) -> dict[str, Any]:
    model = _first_model(config)
    base = {
        "enabled": True,
        "apiBase": str(getattr(model, "base_url", None) or "https://api.deepseek.com"),
        "apiKey": str(getattr(model, "api_key", None) or ""),
        "modelName": str(getattr(model, "name", None) or "deepseek-chat"),
        "temperature": float(getattr(model, "temperature", 0.3) or 0.3),
        "maxTokens": int(getattr(model, "max_tokens", 4096) or 4096),
    }
    path = model_config_path()
    if path.exists():
        try:
            stored = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(stored, dict):
                base.update({key: value for key, value in stored.items() if key in base})
        except (OSError, json.JSONDecodeError):
            pass
    return base


def persist_model_config(data: dict[str, Any]) -> None:
    path = model_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "enabled": bool(data.get("enabled", True)),
        "apiBase": str(data.get("apiBase") or "https://api.deepseek.com").rstrip("/"),
        "apiKey": str(data.get("apiKey") or ""),
        "modelName": str(data.get("modelName") or "deepseek-chat"),
        "temperature": float(data.get("temperature", 0.3)),
        "maxTokens": int(data.get("maxTokens", 4096)),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def apply_model_config_to_runtime(config: Any, data: dict[str, Any] | None = None) -> None:
    if config is None:
        return
    data = data or read_model_config(config)
    model_name = str(data.get("modelName") or "deepseek-chat")
    models_list = getattr(config, "models", [])
    model = _first_model(config)
    if model is None:
        model = ModelConfig(
            name=model_name,
            display_name="DeepSeek",
            use="langchain_deepseek:ChatDeepSeek",
            model=model_name,
            api_key=str(data.get("apiKey") or ""),
            base_url=str(data.get("apiBase") or "https://api.deepseek.com").rstrip("/"),
            timeout=600.0,
            max_retries=2,
            max_tokens=int(data.get("maxTokens", 4096)),
            temperature=float(data.get("temperature", 0.3)),
            supports_thinking=False,
            supports_vision=False,
        )
        models_list.append(model)
        return
    setattr(model, "name", model_name)
    setattr(model, "model", model_name)
    setattr(model, "display_name", getattr(model, "display_name", None) or "DeepSeek")
    setattr(model, "use", getattr(model, "use", None) or "langchain_deepseek:ChatDeepSeek")
    setattr(model, "api_key", str(data.get("apiKey") or ""))
    setattr(model, "base_url", str(data.get("apiBase") or "https://api.deepseek.com").rstrip("/"))
    setattr(model, "temperature", float(data.get("temperature", 0.3)))
    setattr(model, "max_tokens", int(data.get("maxTokens", 4096)))


def model_config_response(config: Any) -> dict[str, Any]:
    data = read_model_config(config)
    available = [str(getattr(model, "name", "")) for model in getattr(config, "models", []) if getattr(model, "name", "")]
    model_name = str(data.get("modelName") or "deepseek-chat")
    if model_name not in available:
        available.insert(0, model_name)
    api_key = str(data.get("apiKey") or "")
    return {
        "enabled": bool(data.get("enabled", True)),
        "apiBase": str(data.get("apiBase") or "https://api.deepseek.com").rstrip("/"),
        "apiKeyConfigured": bool(api_key),
        "apiKeyPreview": _mask_api_key(api_key) if api_key else None,
        "modelName": model_name,
        "temperature": float(data.get("temperature", 0.3)),
        "maxTokens": int(data.get("maxTokens", 4096)),
        "availableModels": available,
    }


def default_model_name(config: Any) -> str:
    data = read_model_config(config)
    return str(data.get("modelName") or getattr(_first_model(config), "name", None) or "deepseek-chat")


def _first_model(config: Any) -> Any | None:
    models_list = getattr(config, "models", None) or []
    return models_list[0] if models_list else None


def _mask_api_key(api_key: str) -> str:
    if len(api_key) <= 8:
        return "****"
    return f"{api_key[:3]}...{api_key[-4:]}"


def build_runtime_prompt(
    content: str,
    workspace_context: dict[str, Any] | None = None,
    *,
    permission_scope: str = "prompt-library-agent",
) -> str:
    prompt_library_snapshot = json.dumps(
        [
            {
                "id": preset.get("id"),
                "type": preset.get("type"),
                "category": preset.get("category"),
                "label": preset.get("label"),
                "content": preset.get("content"),
            }
            for preset in _load_presets()[:80]
        ],
        ensure_ascii=False,
        indent=2,
    )
    parts = [
        "You are the embedded PMAgent collaboration agent. Reply in concise Chinese by default.",
        "You are a conversational editor for PromptCard components. Talk with the user, then return executable JSON instructions when a card change is clearly requested.",
        "If the user intent is unclear, ask a concise follow-up question in Chinese and do not return JSON.",
        "Only include fields that should change. Never invent cardId, sequenceId, or rowId; use IDs from the workspace snapshot.",
        "PromptCard manages prompts, scripts, Prompt Library assets, and storyboard data. It does not generate video.",
    ]
    if permission_scope == "workspace-chatbot-agent":
        parts.extend(
            [
                "Permission scope: workspace-chatbot-agent.",
                "Prompt Library writes are forbidden in this workspace chatbot scope. Do not emit prompt_library_write_proposal JSON here.",
                "If content should become a reusable Prompt Library asset, tell the user to go to the Prompt Library decomposition/write page.",
                "For workspace edits, include a JSON block with kind agent_workspace_proposals and only workspace_card_update, workspace_card_create, or storyboard_update proposal items.",
                "For three-stage workspace edits, emit three_stage_field_update with stageKey, fieldId, mode replace or append, and content.",
                "For card workspace edits, the frontend may apply workspace_card_update and workspace_card_create instructions directly when the user requested the change.",
            ]
        )
    else:
        parts.extend(
            [
                "Permission scope: Prompt Library scope.",
                "Only create new Prompt Library presets. Never update, archive, delete, overwrite, or replace existing prompts.",
                "Prompt Library scope may emit prompt_library_write_proposal JSON only with operation create.",
                "Prompt Library is the only write entry point for reusable preset decomposition and storage.",
            ]
        )
    if workspace_context:
        parts.extend(["Current workspace snapshot:", json.dumps(workspace_context, ensure_ascii=False, indent=2)])
    parts.extend(["Current Prompt library snapshot:", prompt_library_snapshot, "User request:", content])
    return "\n\n".join(parts)


def extract_assistant_text(payload: dict[str, Any]) -> str:
    candidates = [
        payload.get("output"),
        payload.get("result"),
        payload.get("final"),
        (payload.get("values") or {}).get("messages") if isinstance(payload.get("values"), dict) else None,
        payload.get("messages"),
    ]
    for candidate in candidates:
        if isinstance(candidate, str):
            return candidate
        if isinstance(candidate, list):
            for item in reversed(candidate):
                if not isinstance(item, dict):
                    continue
                role = str(item.get("role") or item.get("type") or "").lower()
                if role in {"assistant", "ai"}:
                    text = _message_text(item.get("content"))
                    if text:
                        return text
    return json.dumps(payload, ensure_ascii=False, indent=2)


def parse_agent_workspace_proposals(
    text: str,
    *,
    workspace_context: dict[str, Any] | None = None,
    permission_scope: str = "prompt-library-agent",
) -> list[dict[str, Any]]:
    proposals: list[dict[str, Any]] = []
    seen: set[str] = set()
    valid_ids = _workspace_ids(workspace_context)
    candidates = [match.group(1) for match in re.finditer(r"```json\s*([\s\S]*?)```", text, re.IGNORECASE)]
    candidates.extend(match.group(1) for match in re.finditer(r'(\{[\s\S]*"(?:agent_workspace_proposals|prompt_library_write_proposal|workspace_card_update|workspace_card_create|storyboard_update|three_stage_field_update)"[\s\S]*\})', text, re.IGNORECASE))

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        items = parsed.get("proposals") if parsed.get("kind") == "agent_workspace_proposals" and isinstance(parsed.get("proposals"), list) else [parsed.get("proposal") if parsed.get("kind") == "prompt_library_write_proposal" else parsed]
        for index, item in enumerate(items):
            normalized = _normalize_proposal(item, len(proposals) + index, valid_ids)
            if (
                normalized
                and _proposal_is_allowed(normalized, permission_scope)
                and normalized["id"] not in seen
            ):
                seen.add(normalized["id"])
                proposals.append(normalized)
    return proposals


def _normalize_proposal(value: Any, index: int, valid_ids: dict[str, set[str]]) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    kind = str(value.get("kind") or "")
    base = {
        "id": str(value.get("id") or f"proposal-{int(time.time() * 1000)}-{index}"),
        "contextId": value.get("contextId"),
        "threadId": value.get("threadId"),
        "runId": value.get("runId"),
        "agentName": str(value.get("agentName") or "DeepSeek Agent"),
        "rationale": str(value.get("rationale") or ""),
        "status": value.get("status") if value.get("status") in {"approved", "rejected"} else "pending",
        "createdAt": int(value.get("createdAt") or int(time.time() * 1000)),
    }

    if kind == "workspace_card_update" and isinstance(value.get("updates"), list):
        updates = [
            _card_update(update)
            for update in value["updates"]
            if isinstance(update, dict) and _id_is_allowed(str(update.get("cardId") or ""), valid_ids["cards"])
        ]
        updates = [update for update in updates if update]
        if not updates:
            return None
        return {**base, "kind": "workspace_card_update", "updates": updates}

    if kind == "workspace_card_create" and isinstance(value.get("cardDraft"), dict):
        draft = value["cardDraft"]
        if not draft.get("type") or not draft.get("content"):
            return None
        return {
            **base,
            "kind": "workspace_card_create",
            "pageIndex": value.get("pageIndex"),
            "cardDraft": {
                "type": draft.get("type"),
                "title": str(draft.get("title") or draft.get("type")),
                "content": str(draft.get("content") or ""),
                "meta": draft.get("meta") or {},
            },
        }

    if kind == "storyboard_update":
        sequence_id = value.get("sequenceId")
        row_id = value.get("rowId")
        if sequence_id and not _id_is_allowed(str(sequence_id), valid_ids["sequences"]):
            return None
        if row_id and not _id_is_allowed(str(row_id), valid_ids["rows"]):
            return None
        sequence_updates = _pick_allowed(value.get("sequenceUpdates"), ["name", "description", "style", "constraints"])
        row_updates = _pick_allowed(value.get("rowUpdates"), ["cutLabel", "timeRange", "subject", "action", "scene", "camera", "lighting", "audio", "duration"])
        if not sequence_updates and not row_updates:
            return None
        return {**base, "kind": "storyboard_update", "sequenceId": sequence_id, "rowId": row_id, "sequenceUpdates": sequence_updates, "rowUpdates": row_updates}

    if kind == "three_stage_field_update":
        stage_key = str(value.get("stageKey") or "")
        field_id = str(value.get("fieldId") or "")
        if stage_key and not _id_is_allowed(stage_key, valid_ids["three_stage_stages"]):
            return None
        if field_id and not _id_is_allowed(f"{stage_key}:{field_id}", valid_ids["three_stage_fields"]):
            return None
        content = str(value.get("content") or "").strip()
        if not stage_key or not field_id or not content:
            return None
        return {
            **base,
            "kind": "three_stage_field_update",
            "stageKey": stage_key,
            "fieldId": field_id,
            "mode": "append" if value.get("mode") == "append" else "replace",
            "content": content,
        }

    proposal_draft = value.get("presetDraft")
    if (kind == "prompt_library_write_proposal" or proposal_draft) and isinstance(proposal_draft, dict):
        if value.get("operation", "create") != "create":
            return None
        if not proposal_draft.get("label") or not proposal_draft.get("content"):
            return None
        label = str(proposal_draft.get("label") or "").strip()
        content = str(proposal_draft.get("content") or "").strip()
        if not label or not content:
            return None
        return {
            **base,
            "kind": "prompt_library_write_proposal",
            "operation": "create",
            "targetPresetId": None,
            "presetDraft": {
                **proposal_draft,
                "label": label,
                "content": content,
                "category": str(proposal_draft.get("category") or "agent").strip() or "agent",
            },
        }
    return None


def _card_update(update: dict[str, Any]) -> dict[str, str] | None:
    result: dict[str, str] = {"cardId": str(update.get("cardId"))}
    if isinstance(update.get("title"), str):
        result["title"] = update["title"]
    if isinstance(update.get("content"), str):
        result["content"] = update["content"]
    return result if len(result) > 1 else None


def _workspace_ids(workspace_context: dict[str, Any] | None) -> dict[str, set[str]]:
    ids = {"cards": set(), "rows": set(), "sequences": set(), "three_stage_stages": set(), "three_stage_fields": set()}
    snapshot = workspace_context.get("snapshot") if isinstance(workspace_context, dict) else None
    _collect_ids(snapshot, ids)
    return ids


def _collect_ids(value: Any, ids: dict[str, set[str]]) -> None:
    if isinstance(value, list):
        for item in value:
            _collect_ids(item, ids)
        return
    if not isinstance(value, dict):
        return
    value_id = value.get("id")
    if isinstance(value_id, str):
        if "cards" in value or value.get("type") in {"subject", "action", "scene", "style", "camera", "lighting", "timing", "audio", "constraint", "custom"}:
            ids["cards"].add(value_id)
        if "rows" in value or "rowUpdates" in value or "cutLabel" in value:
            ids["rows"].add(value_id)
        if "sequences" in value or "sequenceUpdates" in value or "description" in value:
            ids["sequences"].add(value_id)
    for key, child in value.items():
        if key == "cards" and isinstance(child, list):
            ids["cards"].update(str(item["id"]) for item in child if isinstance(item, dict) and isinstance(item.get("id"), str))
        elif key == "rows" and isinstance(child, list):
            ids["rows"].update(str(item["id"]) for item in child if isinstance(item, dict) and isinstance(item.get("id"), str))
        elif key == "sequences" and isinstance(child, list):
            ids["sequences"].update(str(item["id"]) for item in child if isinstance(item, dict) and isinstance(item.get("id"), str))
        elif key == "sections" and isinstance(child, dict):
            for stage_key, section in child.items():
                ids["three_stage_stages"].add(str(stage_key))
                fields = section.get("fields") if isinstance(section, dict) else None
                if isinstance(fields, dict):
                    ids["three_stage_fields"].update(f"{stage_key}:{field_id}" for field_id in fields.keys())
        _collect_ids(child, ids)


def _id_is_allowed(value: str, allowed: set[str]) -> bool:
    return not allowed or value in allowed


def _pick_allowed(value: Any, keys: list[str]) -> dict[str, str] | None:
    if not isinstance(value, dict):
        return None
    result = {key: value[key] for key in keys if isinstance(value.get(key), str)}
    return result or None


def _proposal_is_allowed(proposal: dict[str, Any], permission_scope: str) -> bool:
    if permission_scope == "workspace-chatbot-agent":
        return proposal.get("kind") != "prompt_library_write_proposal"
    return True


def _message_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "\n".join(part for part in parts if part)
    return ""


def _request_config(request: Request):
    return getattr(request.app.state, "config", None) or get_app_config()


def _storage_health() -> dict[str, Any]:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8002/health", timeout=2) as response:
            payload = json.loads(response.read().decode("utf-8"))
            return {"ok": response.status == 200, "payload": payload}
    except (OSError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
        return {"ok": False, "error": str(exc)}


def _model_or_value(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if isinstance(value, dict):
        return value
    return value
