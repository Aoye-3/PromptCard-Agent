from __future__ import annotations

import pytest

from app.gateway.model_management.connection_store import (
    ModelConnectionStore,
    ModelManagementError,
)
from app.gateway.model_management.contracts import AssignmentRequest, ConnectionRequest
from app.gateway.text_generation import service


class MemoryCredentialStore:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}

    def set(self, connection_id: str, secret: str) -> None:
        self.values[connection_id] = secret

    def get(self, connection_id: str) -> str | None:
        return self.values.get(connection_id)

    def delete(self, connection_id: str) -> None:
        self.values.pop(connection_id, None)


def configured_store(tmp_path, provider_id: str, model_id: str):
    credentials = MemoryCredentialStore()
    store = ModelConnectionStore(tmp_path / "connections.json", credentials)
    connection = store.create_connection(
        ConnectionRequest(
            providerId=provider_id,
            displayName=provider_id,
            apiBase={
                "deepseek": "https://api.deepseek.com",
                "volcengine-ark": "https://ark.cn-beijing.volces.com/api/v3",
            }[provider_id],
            credential="secret-value",
        )
    )
    store.set_assignment(
        "chat.primary",
        AssignmentRequest(connectionId=connection["id"], modelId=model_id),
    )
    return store


def test_pi_native_descriptor_excludes_connection_credential(tmp_path, monkeypatch):
    store = configured_store(tmp_path, "deepseek", "deepseek-chat")
    monkeypatch.setattr(service, "get_connection_store", lambda: store)

    descriptor = service.assigned_text_model()

    assert descriptor["model"]["integrationGroup"]["kind"] == "pi-native"
    assert "credential" not in descriptor
    assert "apiBase" not in descriptor


def test_sdk_text_dispatches_through_provider_adapter(tmp_path, monkeypatch):
    store = configured_store(
        tmp_path,
        "volcengine-ark",
        "doubao-seed-2-0-lite-260215",
    )
    monkeypatch.setattr(service, "get_connection_store", lambda: store)

    class FakeAdapter:
        provider_id = "volcengine-ark"

        def complete(self, payload, *, api_base, credential, model_id):
            return {
                "payload": payload,
                "apiBase": api_base,
                "credential": credential,
                "modelId": model_id,
            }

    monkeypatch.setitem(service._SDK_ADAPTERS, "volcengine-ark", FakeAdapter())

    result = service.complete_sdk_text({"messages": []})

    assert result["modelId"] == "doubao-seed-2-0-lite-260215"
    assert result["credential"] == "secret-value"


def test_pi_native_model_cannot_enter_sdk_dispatch(tmp_path, monkeypatch):
    store = configured_store(tmp_path, "deepseek", "deepseek-chat")
    monkeypatch.setattr(service, "get_connection_store", lambda: store)

    with pytest.raises(ModelManagementError, match="text_provider_unsupported"):
        service.complete_sdk_text({"messages": []})
