from __future__ import annotations

import json
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from app.gateway.model_management.connection_store import (
    ModelConnectionStore,
    ModelManagementError,
    _atomic_write_bytes,
    _atomic_write_json,
    _validate_assignment,
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

    connection_id = str(
        uuid5(NAMESPACE_URL, f"promptcard:legacy:deepseek:{legacy_path.resolve()}")
    )
    state = store.read_state()
    existing_index = next(
        (
            index
            for index, item in enumerate(state["connections"])
            if item.get("id") == connection_id
        ),
        None,
    )
    connection = store.prepare_connection(
        connection_id,
        ConnectionRequest(
            providerId="deepseek",
            displayName="DeepSeek",
            apiBase=str(legacy.get("apiBase") or "https://api.deepseek.com"),
            enabled=bool(legacy.get("enabled", True)),
        ),
        existing=(state["connections"][existing_index] if existing_index is not None else None),
    )
    if existing_index is None:
        state["connections"].append(connection)
    else:
        state["connections"][existing_index] = connection
    assignment = {
        "slot": "chat.primary",
        "connectionId": connection_id,
        "modelId": str(legacy.get("modelName") or "deepseek-chat"),
    }
    state["assignments"]["chat.primary"] = assignment
    _validate_assignment(state, assignment)

    legacy_bytes = legacy_path.read_bytes()
    state_bytes = store.state_bytes()
    previous_secret = store.credential_store.get(connection_id)
    try:
        store.credential_store.set(connection_id, secret)
        if store.credential_store.get(connection_id) != secret:
            raise CredentialStoreError()
        store.replace_state(state)
        persisted = store.read_state()
        persisted_connection = next(
            (
                item
                for item in persisted["connections"]
                if item.get("id") == connection_id
            ),
            None,
        )
        if (
            persisted["assignments"].get("chat.primary") != assignment
            or persisted_connection != connection
        ):
            raise ModelManagementError("migration_failed")
        if store.credential_store.get(connection_id) != secret:
            raise CredentialStoreError()
        sanitized = dict(legacy)
        sanitized.pop("apiKey", None)
        _atomic_write_json(legacy_path, sanitized)
    except Exception as exc:
        try:
            store.restore_state_bytes(state_bytes)
            _atomic_write_bytes(legacy_path, legacy_bytes)
            store._restore_credential(connection_id, previous_secret)
        except Exception:
            pass
        if isinstance(exc, (CredentialStoreError, ModelManagementError)):
            raise exc
        raise ModelManagementError("migration_failed") from None
    return True
