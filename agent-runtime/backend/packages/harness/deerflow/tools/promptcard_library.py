import json
import os
import time
import uuid
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Literal

from langchain_core.tools import tool


CARD_TYPES = {
    "subject",
    "action",
    "scene",
    "style",
    "camera",
    "lighting",
    "timing",
    "audio",
    "constraint",
    "custom",
}


def _library_path() -> Path:
    configured = os.getenv("PROMPTCARD_LIBRARY_FILE")
    if configured:
        return Path(configured)

    project_root = Path(os.getenv("DEER_FLOW_PROJECT_ROOT", ".")).resolve()
    return project_root.parent / "data" / "prompt-library-presets.json"


def _load_presets() -> list[dict[str, Any]]:
    api_payload = _api_json("/api/presets")
    if api_payload and isinstance(api_payload.get("presets"), list):
        return api_payload["presets"]

    path = _library_path()
    if not path.exists():
        return []

    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        presets = payload.get("presets", [])
        return presets if isinstance(presets, list) else []
    return []


def _compact_preset(preset: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": preset.get("id"),
        "type": preset.get("type"),
        "category": preset.get("category"),
        "label": preset.get("label"),
        "content": preset.get("content"),
        "usageCount": preset.get("usageCount", 0),
        "revision": preset.get("revision", 1),
        "meta": preset.get("meta") or {},
    }


def _compact_project(project: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": project.get("id"),
        "title": project.get("title"),
        "type": project.get("type"),
        "revision": project.get("revision", 1),
        "updatedAt": project.get("updatedAt"),
        "lastOpenedAt": project.get("lastOpenedAt"),
        "meta": project.get("meta") or {},
    }


def _storage_base_url() -> str:
    return os.getenv("PROMPTCARD_STORAGE_API_URL", "http://127.0.0.1:8002").rstrip("/")


def _api_json(path: str, method: str = "GET", payload: dict[str, Any] | None = None) -> dict[str, Any] | None:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{_storage_base_url()}{path}",
        data=data,
        method=method,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return {"error": exc.code, "detail": exc.read().decode("utf-8")}
    except OSError:
        return None


def _to_json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


@tool
def prompt_library_read(card_type: str | None = None, limit: int = 100) -> str:
    """Read the current PromptCard prompt library presets without mutating them."""
    presets = _load_presets()
    if card_type:
        presets = [preset for preset in presets if preset.get("type") == card_type]

    return _to_json(
        {
            "kind": "prompt_library_snapshot",
            "count": len(presets),
            "presets": [_compact_preset(preset) for preset in presets[: max(limit, 0)]],
        }
    )


@tool
def prompt_library_search(query: str = "", card_type: str | None = None, limit: int = 10) -> str:
    """Search PromptCard prompt library presets by label, category, or content."""
    normalized_query = query.strip().lower()
    presets = _load_presets()
    if card_type:
        presets = [preset for preset in presets if preset.get("type") == card_type]
    if normalized_query:
        presets = [
            preset
            for preset in presets
            if normalized_query
            in " ".join(
                str(preset.get(field, "")) for field in ("label", "category", "content")
            ).lower()
        ]

    return _to_json(
        {
            "kind": "prompt_library_search_results",
            "query": query,
            "count": len(presets),
            "presets": [_compact_preset(preset) for preset in presets[: max(limit, 0)]],
        }
    )


@tool
def prompt_library_propose_write(
    operation: Literal["create", "update", "archive"],
    label: str,
    content: str,
    card_type: str = "style",
    category: str = "agent",
    rationale: str = "",
    target_preset_id: str | None = None,
) -> str:
    """Create a Prompt库 write proposal. This tool never writes to the library directly."""
    if card_type not in CARD_TYPES:
        card_type = "custom"

    proposal = {
        "id": f"proposal-{uuid.uuid4().hex}",
        "threadId": None,
        "runId": None,
        "agentName": "DeepSeek Agent",
        "operation": operation,
        "targetPresetId": target_preset_id,
        "presetDraft": {
            "type": card_type,
            "category": category or "agent",
            "label": label.strip() or "Agent proposal",
            "content": content.strip(),
            "meta": {
                "source": "agent-runtime",
                "proposalOnly": True,
            },
        },
        "rationale": rationale.strip(),
        "status": "pending",
        "createdAt": int(time.time() * 1000),
    }
    return _to_json({"kind": "prompt_library_write_proposal", "proposal": proposal})


@tool
def prompt_library_write_with_revision(
    target_preset_id: str,
    revision: int,
    label: str | None = None,
    content: str | None = None,
    card_type: str | None = None,
    category: str | None = None,
) -> str:
    """Write an approved PromptCard preset update. Requires the current revision and may return a conflict."""
    updates: dict[str, Any] = {}
    if label is not None:
        updates["label"] = label
    if content is not None:
        updates["content"] = content
    if card_type is not None:
        updates["type"] = card_type if card_type in CARD_TYPES else "custom"
    if category is not None:
        updates["category"] = category

    result = _api_json(f"/api/presets/{target_preset_id}", "PUT", {"revision": revision, "updates": updates})
    return _to_json({"kind": "prompt_library_write_result", "result": result})


@tool
def promptcard_project_read(project_id: str | None = None, limit: int = 50) -> str:
    """Read PromptCard projects from the local storage service."""
    if project_id:
        project = _api_json(f"/api/projects/{project_id}")
        return _to_json({"kind": "promptcard_project_snapshot", "project": project})

    payload = _api_json("/api/projects") or {"projects": []}
    projects = payload.get("projects", [])
    return _to_json(
        {
            "kind": "promptcard_project_list",
            "count": len(projects),
            "projects": [_compact_project(project) for project in projects[: max(limit, 0)]],
        }
    )


@tool
def promptcard_project_write_with_revision(project_id: str, revision: int, updates_json: str) -> str:
    """Write a PromptCard project update through the local storage service. Requires the current revision."""
    try:
        updates = json.loads(updates_json)
    except json.JSONDecodeError as exc:
        return _to_json({"kind": "promptcard_project_write_result", "error": f"invalid json: {exc}"})
    if not isinstance(updates, dict):
        return _to_json({"kind": "promptcard_project_write_result", "error": "updates_json must decode to an object"})

    result = _api_json(f"/api/projects/{project_id}", "PUT", {"revision": revision, "updates": updates})
    return _to_json({"kind": "promptcard_project_write_result", "result": result})
