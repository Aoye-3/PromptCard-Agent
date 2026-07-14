from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

from app.gateway.model_management.connection_store import (
    ModelConnectionStore,
    _atomic_write_json,
)
from app.gateway.model_management.contracts import ConnectionRequest
from app.gateway.model_management.credential_store import CredentialStoreError


def migrate_legacy_model_config(
    legacy_path: Path,
    store: ModelConnectionStore,
) -> bool:
    if not legacy_path.exists():
        return False
    try:
        legacy = json.loads(legacy_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if not isinstance(legacy, dict) or "apiKey" not in legacy:
        return False
    secret = str(legacy.get("apiKey") or "")
    if not secret:
        sanitized = dict(legacy)
        sanitized.pop("apiKey", None)
        _atomic_write_json(legacy_path, sanitized)
        return True

    connection_id = str(uuid4())
    connection = store.prepare_connection(
        connection_id,
        ConnectionRequest(
            providerId="deepseek",
            displayName="DeepSeek",
            apiBase=str(legacy.get("apiBase") or "https://api.deepseek.com"),
            enabled=bool(legacy.get("enabled", True)),
        ),
    )
    store.credential_store.set(connection_id, secret)
    try:
        if store.credential_store.get(connection_id) != secret:
            raise CredentialStoreError()
        state = store.read_state()
        state["connections"].append(connection)
        state["assignments"]["chat.primary"] = {
            "slot": "chat.primary",
            "connectionId": connection_id,
            "modelId": str(legacy.get("modelName") or "deepseek-chat"),
        }
        store.replace_state(state)
    except Exception:
        try:
            store.credential_store.delete(connection_id)
        finally:
            raise

    sanitized = dict(legacy)
    sanitized.pop("apiKey", None)
    _atomic_write_json(legacy_path, sanitized)
    return True
