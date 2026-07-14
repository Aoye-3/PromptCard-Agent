from __future__ import annotations

import json
import os
import tempfile
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from app.gateway.model_management.catalog import model_by_id, provider_exists
from app.gateway.model_management.contracts import AssignmentRequest, ConnectionRequest
from app.gateway.model_management.credential_store import (
    CredentialStore,
    CredentialStoreError,
    SystemKeyringCredentialStore,
)

CREDENTIAL_MASK = "••••••••"
SLOT_MODALITY = {"chat.primary": "chat", "image.primary": "image"}
PROVIDER_ENDPOINTS = {
    "deepseek": "https://api.deepseek.com",
    "volcengine-ark": "https://ark.cn-beijing.volces.com/api/v3",
}


class ModelManagementError(ValueError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def default_connection_store_path() -> Path:
    home = Path(os.getenv("DEER_FLOW_HOME") or ".deer-flow")
    return home / "promptcard-model-connections.json"


def get_connection_store() -> ModelConnectionStore:
    return ModelConnectionStore(default_connection_store_path(), SystemKeyringCredentialStore())


class ModelConnectionStore:
    def __init__(self, path: Path, credential_store: CredentialStore) -> None:
        self.path = path
        self.credential_store = credential_store

    def read_state(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"version": 1, "connections": [], "assignments": {}}
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ModelManagementError("invalid_connection_store") from exc
        if not isinstance(payload, dict):
            raise ModelManagementError("invalid_connection_store")
        connections = payload.get("connections", [])
        assignments = payload.get("assignments", {})
        if not isinstance(connections, list) or not isinstance(assignments, dict):
            raise ModelManagementError("invalid_connection_store")
        return {"version": 1, "connections": connections, "assignments": assignments}

    def replace_state(self, state: dict[str, Any]) -> None:
        ids: set[str] = set()
        for connection in state.get("connections", []):
            connection_id = str(connection.get("id", ""))
            _validate_connection_id(connection_id)
            if connection_id in ids:
                raise ModelManagementError("duplicate_connection_id")
            ids.add(connection_id)
            _validate_provider_and_url(
                str(connection.get("providerId", "")),
                str(connection.get("apiBase", "")),
            )
        for assignment in state.get("assignments", {}).values():
            _validate_assignment(state, assignment)
        try:
            _atomic_write_json(self.path, state)
        except OSError:
            raise ModelManagementError("connection_store_unavailable") from None

    def state_bytes(self) -> bytes | None:
        return self.path.read_bytes() if self.path.exists() else None

    def restore_state_bytes(self, original: bytes | None) -> None:
        if original is None:
            if self.path.exists():
                self.path.unlink()
            return
        _atomic_write_bytes(self.path, original)

    def list_connections(self) -> list[dict[str, Any]]:
        return [self._response(item) for item in self.read_state()["connections"]]

    def get_connection(self, connection_id: str) -> dict[str, Any]:
        return self._response(self.get_connection_config(connection_id))

    def get_connection_config(self, connection_id: str) -> dict[str, Any]:
        _validate_connection_id(connection_id)
        connection = next(
            (
                item
                for item in self.read_state()["connections"]
                if item.get("id") == connection_id
            ),
            None,
        )
        if connection is None:
            raise ModelManagementError("connection_not_found")
        return deepcopy(connection)

    def create_connection(self, request: ConnectionRequest) -> dict[str, Any]:
        connection_id = str(uuid4())
        connection = self.prepare_connection(connection_id, request)
        credential_written = self._replace_credential(connection_id, request.credential)
        state = self.read_state()
        state["connections"].append(connection)
        try:
            self.replace_state(state)
        except Exception:
            if credential_written:
                self.credential_store.delete(connection_id)
            raise
        return self._response(connection)

    def update_connection(
        self,
        connection_id: str,
        request: ConnectionRequest,
    ) -> dict[str, Any]:
        state = self.read_state()
        index = next(
            (
                index
                for index, item in enumerate(state["connections"])
                if item.get("id") == connection_id
            ),
            None,
        )
        if index is None:
            raise ModelManagementError("connection_not_found")
        existing = state["connections"][index]
        is_assigned = any(
            assignment.get("connectionId") == connection_id
            for assignment in state["assignments"].values()
        )
        if is_assigned and (
            request.provider_id != existing["providerId"] or not request.enabled
        ):
            raise ModelManagementError("connection_is_assigned")
        connection = self.prepare_connection(connection_id, request, existing=existing)
        previous_secret = self.credential_store.get(connection_id)
        credential_changed = request.credential is not None
        if credential_changed:
            self._replace_credential(connection_id, request.credential)
        state["connections"][index] = connection
        try:
            self.replace_state(state)
        except Exception:
            if credential_changed:
                self._restore_credential(connection_id, previous_secret)
            raise
        return self._response(connection)

    def delete_connection(self, connection_id: str) -> None:
        state = self.read_state()
        if any(
            assignment.get("connectionId") == connection_id
            for assignment in state["assignments"].values()
        ):
            raise ModelManagementError("connection_is_assigned")
        original_count = len(state["connections"])
        state["connections"] = [
            item for item in state["connections"] if item.get("id") != connection_id
        ]
        if len(state["connections"]) == original_count:
            raise ModelManagementError("connection_not_found")
        previous_secret = self.credential_store.get(connection_id)
        if previous_secret is not None:
            self.credential_store.delete(connection_id)
        try:
            self.replace_state(state)
        except Exception:
            self._restore_credential(connection_id, previous_secret)
            raise

    def list_assignments(self) -> list[dict[str, Any]]:
        assignments = self.read_state()["assignments"]
        return [deepcopy(assignments[slot]) for slot in sorted(assignments)]

    def set_assignment(self, slot: str, request: AssignmentRequest) -> dict[str, Any]:
        assignment = {
            "slot": slot,
            "connectionId": request.connection_id,
            "modelId": request.model_id,
        }
        state = self.read_state()
        _validate_assignment(state, assignment)
        state["assignments"][slot] = assignment
        self.replace_state(state)
        return deepcopy(assignment)

    def save_legacy_chat(
        self,
        request: ConnectionRequest,
        model_id: str,
    ) -> dict[str, Any]:
        model_id = model_id.strip()
        if not model_id:
            raise ModelManagementError("model_name_required")
        _validate_provider_and_url(request.provider_id, request.api_base)
        state_before = self.state_bytes()
        state = self.read_state()
        assignment = state["assignments"].get("chat.primary")
        if assignment is None:
            connection_id = str(uuid4())
            connection = self.prepare_connection(connection_id, request)
            state["connections"].append(connection)
        else:
            connection_id = assignment["connectionId"]
            index = next(
                index
                for index, item in enumerate(state["connections"])
                if item["id"] == connection_id
            )
            existing = state["connections"][index]
            if request.provider_id != existing["providerId"] or not request.enabled:
                raise ModelManagementError("connection_is_assigned")
            connection = self.prepare_connection(connection_id, request, existing=existing)
            state["connections"][index] = connection
        next_assignment = {
            "slot": "chat.primary",
            "connectionId": connection_id,
            "modelId": model_id,
        }
        state["assignments"]["chat.primary"] = next_assignment
        _validate_assignment(state, next_assignment)
        previous_secret = self.credential_store.get(connection_id)
        credential_changed = request.credential is not None
        try:
            if credential_changed:
                self._replace_credential(connection_id, request.credential)
            self.replace_state(state)
        except Exception as exc:
            try:
                self.restore_state_bytes(state_before)
                if credential_changed:
                    self._restore_credential(connection_id, previous_secret)
            except Exception:
                raise ModelManagementError("connection_store_unavailable") from None
            if isinstance(exc, OSError):
                raise ModelManagementError("connection_store_unavailable") from None
            raise
        return self._response(connection)

    def record_test(self, connection_id: str, *, success: bool) -> None:
        state = self.read_state()
        connection = next(
            (item for item in state["connections"] if item["id"] == connection_id),
            None,
        )
        if connection is None:
            raise ModelManagementError("connection_not_found")
        tested_at = _now()
        connection["lastTest"] = {
            "status": "success" if success else "failure",
            "testedAt": tested_at,
            "message": "Connection ok." if success else "Connection failed.",
        }
        connection["updatedAt"] = tested_at
        self.replace_state(state)

    def assignment(self, slot: str) -> dict[str, Any] | None:
        assignment = self.read_state()["assignments"].get(slot)
        return deepcopy(assignment) if assignment is not None else None

    def prepare_connection(
        self,
        connection_id: str,
        request: ConnectionRequest,
        *,
        existing: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _validate_connection_id(connection_id)
        _validate_provider_and_url(request.provider_id, request.api_base)
        display_name = request.display_name.strip()
        if not display_name:
            raise ModelManagementError("display_name_required")
        now = _now()
        connection = {
            "id": connection_id,
            "providerId": request.provider_id,
            "displayName": display_name,
            "apiBase": request.api_base,
            "enabled": request.enabled,
            "credentialRef": f"connection:{connection_id}",
            "createdAt": existing.get("createdAt", now) if existing else now,
            "updatedAt": now,
        }
        if existing and "lastTest" in existing:
            connection["lastTest"] = deepcopy(existing["lastTest"])
        return connection

    def _response(self, connection: dict[str, Any]) -> dict[str, Any]:
        configured = bool(self.credential_store.get(str(connection["id"])))
        return {
            **{
                key: deepcopy(connection[key])
                for key in ["id", "providerId", "displayName", "apiBase", "enabled", "createdAt", "updatedAt", "lastTest"]
                if key in connection
            },
            "credentialConfigured": configured,
            "credentialMask": CREDENTIAL_MASK if configured else None,
        }

    def _replace_credential(self, connection_id: str, credential: str | None) -> bool:
        if credential is None:
            return False
        if credential == "":
            if self.credential_store.get(connection_id) is not None:
                self.credential_store.delete(connection_id)
            return True
        self.credential_store.set(connection_id, credential)
        if self.credential_store.get(connection_id) != credential:
            try:
                self.credential_store.delete(connection_id)
            finally:
                raise CredentialStoreError()
        return True

    def _restore_credential(self, connection_id: str, secret: str | None) -> None:
        if secret is None:
            self.credential_store.delete(connection_id)
            return
        self.credential_store.set(connection_id, secret)


def _validate_connection_id(connection_id: str) -> None:
    try:
        parsed = UUID(connection_id)
    except ValueError:
        raise ModelManagementError("invalid_connection_id") from None
    if str(parsed) != connection_id:
        raise ModelManagementError("invalid_connection_id")


def _validate_provider_and_url(provider_id: str, api_base: str) -> None:
    if not provider_exists(provider_id):
        raise ModelManagementError("provider_not_found")
    parsed = urlsplit(api_base)
    if (
        api_base != PROVIDER_ENDPOINTS.get(provider_id)
        or parsed.scheme != "https"
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ModelManagementError("invalid_api_base")


def validate_provider_endpoint(provider_id: str, api_base: str) -> None:
    _validate_provider_and_url(provider_id, api_base)


def _validate_assignment(state: dict[str, Any], assignment: dict[str, Any]) -> None:
    slot = str(assignment.get("slot", ""))
    modality = SLOT_MODALITY.get(slot)
    if modality is None:
        raise ModelManagementError("invalid_model_slot")
    connection = next(
        (
            item
            for item in state.get("connections", [])
            if item.get("id") == assignment.get("connectionId")
        ),
        None,
    )
    if connection is None:
        raise ModelManagementError("connection_not_found")
    if not connection.get("enabled", True):
        raise ModelManagementError("connection_disabled")
    model_id = str(assignment.get("modelId", "")).strip()
    if not model_id:
        raise ModelManagementError("model_name_required")
    if slot == "chat.primary" and connection["providerId"] == "deepseek":
        model = model_by_id(model_id)
        if model is not None and model["modality"] != "chat":
            raise ModelManagementError("incompatible_model_slot")
        return
    model = model_by_id(model_id)
    if model is None:
        raise ModelManagementError("model_not_found")
    if model["providerId"] != connection["providerId"]:
        raise ModelManagementError("model_provider_mismatch")
    if model["modality"] != modality:
        raise ModelManagementError("incompatible_model_slot")


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
            temporary_path = Path(handle.name)
        os.replace(temporary_path, path)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()


def _atomic_write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "wb", dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False
        ) as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
            temporary_path = Path(handle.name)
        os.replace(temporary_path, path)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()
