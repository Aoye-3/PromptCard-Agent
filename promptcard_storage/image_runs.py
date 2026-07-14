from __future__ import annotations

import base64
import json
from copy import deepcopy
from typing import Any


RUN_STATES = {"queued", "running", "succeeded", "failed"}
TERMINAL_STATES = {"succeeded", "failed"}
_CREATE_FIELDS = {
    "id",
    "projectId",
    "nodeId",
    "connectionId",
    "providerId",
    "modelId",
    "state",
    "requestSnapshot",
    "outputAssetIds",
    "createdAt",
}
_TRANSITION_FIELDS = {
    "running": {"state", "startedAt", "providerRequestId"},
    "succeeded": {"state", "finishedAt", "providerRequestId", "outputAssetIds", "usage"},
    "failed": {"state", "finishedAt", "providerRequestId", "error", "usage"},
}
_FORBIDDEN_KEYS = {"secret", "apikey", "remoteurl", "path"}


def normalize_new_image_run(item: dict[str, Any], now: int) -> dict[str, Any]:
    if not isinstance(item, dict):
        raise ValueError("Image generation run must be an object")
    _reject_forbidden_fields(item)
    unexpected = set(item) - _CREATE_FIELDS
    if unexpected:
        raise ValueError(f"Unsupported image generation run fields: {', '.join(sorted(unexpected))}")

    state = item.get("state", "queued")
    if state != "queued":
        raise ValueError("Image generation runs must be created in queued state")
    request_snapshot = item.get("requestSnapshot")
    if not isinstance(request_snapshot, dict):
        raise ValueError("Image generation run requestSnapshot is required")
    output_asset_ids = _normalize_asset_ids(item.get("outputAssetIds", []))
    if output_asset_ids:
        raise ValueError("Queued image generation runs cannot have output assets")

    created = {
        "id": _required_string(item, "id"),
        "projectId": _required_string(item, "projectId"),
        "nodeId": _required_string(item, "nodeId"),
        "connectionId": _required_string(item, "connectionId"),
        "providerId": _required_string(item, "providerId"),
        "modelId": _required_string(item, "modelId"),
        "state": "queued",
        "requestSnapshot": deepcopy(request_snapshot),
        "outputAssetIds": [],
        "createdAt": _timestamp(item.get("createdAt", now), "createdAt"),
    }
    return created


def transition_image_run(current: dict[str, Any], patch: dict[str, Any], now: int) -> dict[str, Any]:
    if not isinstance(patch, dict):
        raise ValueError("Image generation run state patch must be an object")
    _reject_forbidden_fields(patch)
    target = patch.get("state")
    if target not in RUN_STATES:
        raise ValueError("Image generation run state is invalid")
    expected = "running" if current["state"] == "queued" else TERMINAL_STATES if current["state"] == "running" else set()
    if (isinstance(expected, str) and target != expected) or (isinstance(expected, set) and target not in expected):
        raise ValueError(f"Invalid image generation run transition: {current['state']} -> {target}")
    unexpected = set(patch) - _TRANSITION_FIELDS[target]
    if unexpected:
        raise ValueError(f"Unsupported image generation run state fields: {', '.join(sorted(unexpected))}")

    updated = deepcopy(current)
    updated["state"] = target
    if target == "running":
        updated["startedAt"] = _timestamp(patch.get("startedAt", now), "startedAt")
    else:
        updated["finishedAt"] = _timestamp(patch.get("finishedAt", now), "finishedAt")

    if "providerRequestId" in patch:
        updated["providerRequestId"] = _optional_string(patch["providerRequestId"], "providerRequestId")
    if "usage" in patch:
        if not isinstance(patch["usage"], dict):
            raise ValueError("Image generation run usage must be an object")
        updated["usage"] = deepcopy(patch["usage"])
    if target == "succeeded":
        updated["outputAssetIds"] = _normalize_asset_ids(patch.get("outputAssetIds", []))
    if target == "failed" and "error" in patch:
        updated["error"] = _normalize_error(patch["error"])
    return updated


def normalize_page_limit(limit: int) -> int:
    if isinstance(limit, bool) or not isinstance(limit, int) or limit < 1 or limit > 100:
        raise ValueError("Image generation run limit must be between 1 and 100")
    return limit


def encode_cursor(created_at: int, run_id: str) -> str:
    raw = json.dumps([created_at, run_id], separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(cursor: str | None) -> tuple[int, str] | None:
    if cursor is None:
        return None
    if not isinstance(cursor, str) or not cursor:
        raise ValueError("Image generation run cursor is invalid")
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        value = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Image generation run cursor is invalid") from exc
    if (
        not isinstance(value, list)
        or len(value) != 2
        or isinstance(value[0], bool)
        or not isinstance(value[0], int)
        or not isinstance(value[1], str)
        or not value[1]
    ):
        raise ValueError("Image generation run cursor is invalid")
    return value[0], value[1]


def image_run_page(runs: list[dict[str, Any]], limit: int) -> dict[str, Any]:
    has_more = len(runs) > limit
    items = runs[:limit]
    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = encode_cursor(last["createdAt"], last["id"])
    return {"runs": items, "nextCursor": next_cursor}


def _required_string(item: dict[str, Any], field: str) -> str:
    value = item.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Image generation run {field} is required")
    return value


def _optional_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"Image generation run {field} must be a non-empty string")
    return value


def _timestamp(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"Image generation run {field} must be a non-negative integer")
    return value


def _normalize_asset_ids(value: Any) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) and item for item in value):
        raise ValueError("Image generation run outputAssetIds must be a list of non-empty strings")
    return list(value)


def _normalize_error(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("Image generation run error must be an object")
    if set(value) - {"code", "message", "retryable"}:
        raise ValueError("Image generation run error contains unsupported fields")
    code = value.get("code")
    message = value.get("message")
    retryable = value.get("retryable")
    if not isinstance(code, str) or not code or not isinstance(message, str) or not isinstance(retryable, bool):
        raise ValueError("Image generation run error is invalid")
    return {"code": code, "message": message, "retryable": retryable}


def _reject_forbidden_fields(value: Any) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized_key = "".join(character for character in str(key).lower() if character.isalnum())
            if normalized_key in _FORBIDDEN_KEYS:
                raise ValueError(f"Image generation run field is forbidden: {key}")
            _reject_forbidden_fields(child)
    elif isinstance(value, list):
        for child in value:
            _reject_forbidden_fields(child)
