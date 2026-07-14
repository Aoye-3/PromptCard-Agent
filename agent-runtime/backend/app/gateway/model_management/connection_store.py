from __future__ import annotations

import json
import os
import tempfile
from copy import deepcopy
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

CREDENTIAL_MASK = "********"
SLOT_MODALITY = {"chat.primary": "chat", "image.primary": "image"}


class ModelManagementError(ValueError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def default_connection_store_path() -> Path:
    home = Path(os.getenv("DEER_FLOW_HOME") or ".deer-flow")
    return home / "model-connections.json"


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
        _atomic_write_json(self.path, state)

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
        connection = self.prepare_connection(connection_id, request)
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
        modality = SLOT_MODALITY.get(slot)
        if modality is None:
            raise ModelManagementError("invalid_model_slot")
        connection = self.get_connection_config(request.connection_id)
        if not connection.get("enabled", True):
            raise ModelManagementError("connection_disabled")
        model = model_by_id(request.model_id)
        if model is None:
            raise ModelManagementError("model_not_found")
        if model["providerId"] != connection["providerId"]:
            raise ModelManagementError("model_provider_mismatch")
        if model["modality"] != modality:
            raise ModelManagementError("incompatible_model_slot")
        assignment = {
            "slot": slot,
            "connectionId": request.connection_id,
            "modelId": request.model_id,
        }
        state = self.read_state()
        state["assignments"][slot] = assignment
        self.replace_state(state)
        return deepcopy(assignment)

    def assignment(self, slot: str) -> dict[str, Any] | None:
        assignment = self.read_state()["assignments"].get(slot)
        return deepcopy(assignment) if assignment is not None else None

    def prepare_connection(
        self,
        connection_id: str,
        request: ConnectionRequest,
    ) -> dict[str, Any]:
        _validate_connection_id(connection_id)
        _validate_provider_and_url(request.provider_id, request.api_base)
        display_name = request.display_name.strip()
        if not display_name:
            raise ModelManagementError("display_name_required")
        return {
            "id": connection_id,
            "providerId": request.provider_id,
            "displayName": display_name,
            "apiBase": request.api_base.rstrip("/"),
            "enabled": request.enabled,
        }

    def _response(self, connection: dict[str, Any]) -> dict[str, Any]:
        configured = bool(self.credential_store.get(str(connection["id"])))
        return {
            **deepcopy(connection),
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
            if self.credential_store.get(connection_id) is not None:
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
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ModelManagementError("invalid_api_base")


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
