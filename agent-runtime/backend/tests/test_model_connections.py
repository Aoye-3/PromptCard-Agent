from __future__ import annotations

import json
import logging
from email.message import Message
from urllib.error import HTTPError
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.model_management.connection_store import ModelConnectionStore, ModelManagementError
from app.gateway.model_management.credential_store import CredentialStoreError
from app.gateway.routers import model_management


class MemoryCredentialStore:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}

    def set(self, connection_id: str, secret: str) -> None:
        self.values[connection_id] = secret

    def get(self, connection_id: str) -> str | None:
        return self.values.get(connection_id)

    def delete(self, connection_id: str) -> None:
        self.values.pop(connection_id, None)


@pytest.fixture
def model_api(tmp_path, monkeypatch):
    credentials = MemoryCredentialStore()
    store = ModelConnectionStore(tmp_path / "promptcard-model-connections.json", credentials)
    monkeypatch.setattr(model_management, "get_connection_store", lambda: store)
    app = FastAPI()
    app.include_router(model_management.router)
    return TestClient(app), store, credentials


def test_catalog_contains_deepseek_chat_and_ark_seedream_manifests(model_api):
    client, _, _ = model_api

    response = client.get("/api/promptcard/runtime/model-catalog")

    assert response.status_code == 200
    payload = response.json()
    assert {provider["id"] for provider in payload["providers"]} == {"deepseek", "volcengine-ark"}
    assert {
        (model["id"], model["providerId"], model["modality"])
        for model in payload["models"]
    } == {
        ("deepseek-chat", "deepseek", "chat"),
        ("doubao-seedream-5-0-pro-260628", "volcengine-ark", "image"),
    }
    seedream = next(model for model in payload["models"] if model["modality"] == "image")
    assert seedream["capabilities"] == {
        "modes": ["generate", "edit", "region-edit"],
        "maxReferenceImages": 10,
        "mentionStrategy": "ordered-image-labels",
        "regionInputs": ["point", "bbox"],
        "resolutions": ["1K", "2K"],
        "outputCount": 1,
        "streaming": False,
    }


def test_connection_crud_never_serializes_or_logs_credentials(model_api, caplog):
    client, store, credentials = model_api
    secret = "sk-never-return-or-log-this"

    with caplog.at_level(logging.DEBUG):
        created = client.post(
            "/api/promptcard/runtime/model-connections",
            json={
                "providerId": "deepseek",
                "displayName": "Primary chat",
                "apiBase": "https://api.deepseek.com",
                "enabled": True,
                "credential": secret,
            },
        )

    assert created.status_code == 201
    connection = created.json()
    assert str(UUID(connection["id"])) == connection["id"]
    assert connection["credentialConfigured"] is True
    assert connection["credentialMask"] == "••••••••"
    assert secret not in created.text
    assert secret not in caplog.text
    assert secret not in store.path.read_text(encoding="utf-8")
    assert credentials.get(connection["id"]) == secret
    persisted = json.loads(store.path.read_text(encoding="utf-8"))["connections"][0]
    assert persisted["credentialRef"] == f"connection:{connection['id']}"
    assert persisted["createdAt"]
    assert persisted["updatedAt"]
    assert "credentialRef" not in connection

    updated = client.put(
        f"/api/promptcard/runtime/model-connections/{connection['id']}",
        json={
            "providerId": "deepseek",
            "displayName": "Renamed",
            "apiBase": "https://api.deepseek.com",
            "enabled": False,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["displayName"] == "Renamed"
    assert updated.json()["apiBase"] == "https://api.deepseek.com"
    assert updated.json()["credentialConfigured"] is True
    assert credentials.get(connection["id"]) == secret

    listed = client.get("/api/promptcard/runtime/model-connections")
    assert listed.status_code == 200
    assert listed.json() == {"connections": [updated.json()]}
    assert secret not in listed.text

    cleared = client.put(
        f"/api/promptcard/runtime/model-connections/{connection['id']}",
        json={
            "providerId": "deepseek",
            "displayName": "Renamed",
            "apiBase": "https://api.deepseek.com",
            "enabled": False,
            "credential": "",
        },
    )
    assert cleared.status_code == 200
    assert cleared.json()["credentialConfigured"] is False
    assert cleared.json()["credentialMask"] is None
    assert credentials.get(connection["id"]) is None

    deleted = client.delete(f"/api/promptcard/runtime/model-connections/{connection['id']}")
    assert deleted.status_code == 204
    assert credentials.get(connection["id"]) is None


@pytest.mark.parametrize(
    "payload",
    [
        {
            "providerId": "unknown",
            "displayName": "Unknown",
            "apiBase": "https://example.com",
            "enabled": True,
        },
        {
            "providerId": "deepseek",
            "displayName": "Bad base",
            "apiBase": "file:///not-http",
            "enabled": True,
        },
        *[
            {
                "providerId": "deepseek",
                "displayName": "Bad base",
                "apiBase": api_base,
                "enabled": True,
            }
            for api_base in [
                "http://api.deepseek.com",
                "https://api.deepseek.com/",
                "https://api.deepseek.com/v1",
                "https://api.deepseek.com:443",
                "https://user:pass@api.deepseek.com",
                "https://api.deepseek.com?next=http://127.0.0.1",
                "https://api.deepseek.com#fragment",
                "https://127.0.0.1",
                "https://localhost",
                "https://api.deepseek.com.evil.test",
            ]
        ],
    ],
)
def test_connection_write_validates_provider_and_http_base_url(model_api, payload):
    client, _, _ = model_api

    response = client.post("/api/promptcard/runtime/model-connections", json=payload)

    assert response.status_code == 422


def test_assignments_validate_modality_connection_state_and_delete_references(model_api):
    client, _, _ = model_api
    deepseek = _create_connection(client, "deepseek", enabled=True)
    ark = _create_connection(client, "volcengine-ark", enabled=True)
    disabled = _create_connection(client, "deepseek", enabled=False)

    wrong_modality = client.put(
        "/api/promptcard/runtime/model-assignments/chat.primary",
        json={"connectionId": ark["id"], "modelId": "doubao-seedream-5-0-pro-260628"},
    )
    assert wrong_modality.status_code == 422
    assert wrong_modality.json()["detail"] == "incompatible_model_slot"

    disabled_connection = client.put(
        "/api/promptcard/runtime/model-assignments/chat.primary",
        json={"connectionId": disabled["id"], "modelId": "deepseek-chat"},
    )
    assert disabled_connection.status_code == 422
    assert disabled_connection.json()["detail"] == "connection_disabled"

    missing_connection = client.put(
        "/api/promptcard/runtime/model-assignments/chat.primary",
        json={
            "connectionId": "123e4567-e89b-12d3-a456-426614174000",
            "modelId": "deepseek-chat",
        },
    )
    assert missing_connection.status_code == 422
    assert missing_connection.json()["detail"] == "connection_not_found"

    assigned = client.put(
        "/api/promptcard/runtime/model-assignments/chat.primary",
        json={"connectionId": deepseek["id"], "modelId": "deepseek-chat"},
    )
    assert assigned.status_code == 200
    assert assigned.json() == {
        "slot": "chat.primary",
        "connectionId": deepseek["id"],
        "modelId": "deepseek-chat",
    }
    assert client.get("/api/promptcard/runtime/model-assignments").json() == {
        "assignments": [assigned.json()]
    }

    rejected_delete = client.delete(
        f"/api/promptcard/runtime/model-connections/{deepseek['id']}"
    )
    assert rejected_delete.status_code == 409
    assert rejected_delete.json()["detail"] == "connection_is_assigned"

    for changes in [
        {"providerId": "volcengine-ark", "enabled": True},
        {"providerId": "deepseek", "enabled": False},
    ]:
        rejected_update = client.put(
            f"/api/promptcard/runtime/model-connections/{deepseek['id']}",
            json={
                **changes,
                "displayName": "DeepSeek",
                "apiBase": (
                    "https://ark.cn-beijing.volces.com/api/v3"
                    if changes["providerId"] == "volcengine-ark"
                    else "https://api.deepseek.com"
                ),
            },
        )
        assert rejected_update.status_code == 409
        assert rejected_update.json()["detail"] == "connection_is_assigned"


def test_connection_test_uses_stored_secret_without_returning_it(model_api, monkeypatch, caplog):
    client, store, _ = model_api
    secret = "sk-test-only-secret"
    connection = _create_connection(client, "deepseek", credential=secret)
    observed: dict[str, str] = {}

    def fake_probe(api_base: str, credential: str) -> None:
        observed.update(api_base=api_base, credential=credential)

    monkeypatch.setattr(model_management, "probe_connection", fake_probe)
    with caplog.at_level(logging.DEBUG):
        response = client.post(
            f"/api/promptcard/runtime/model-connections/{connection['id']}/test"
        )

    assert response.status_code == 200
    assert response.json() == {"success": True, "message": "Connection ok."}
    assert observed == {
        "api_base": "https://api.deepseek.com",
        "credential": secret,
    }
    assert secret not in response.text
    assert secret not in caplog.text
    persisted = json.loads(store.path.read_text(encoding="utf-8"))["connections"][0]
    assert persisted["lastTest"]["status"] == "success"
    assert persisted["lastTest"]["message"] == "Connection ok."
    assert persisted["lastTest"]["testedAt"]


def test_connection_test_refuses_redirects_and_returns_sanitized_failure(model_api, monkeypatch):
    client, store, _ = model_api
    connection = _create_connection(client, "deepseek", credential="sk-no-redirect")
    opened: list[str] = []

    class RedirectingOpener:
        def open(self, request, timeout):
            opened.append(request.full_url)
            headers = Message()
            headers["Location"] = "http://127.0.0.1/steal"
            raise HTTPError(request.full_url, 302, "provider-controlled secret", headers, None)

    monkeypatch.setattr(model_management.urllib.request, "build_opener", lambda *handlers: RedirectingOpener())

    response = client.post(
        f"/api/promptcard/runtime/model-connections/{connection['id']}/test"
    )

    assert response.status_code == 200
    assert response.json() == {"success": False, "message": "Connection failed."}
    assert opened == ["https://api.deepseek.com/models"]
    assert "provider-controlled" not in response.text
    last_test = json.loads(store.path.read_text(encoding="utf-8"))["connections"][0]["lastTest"]
    assert last_test["status"] == "failure"
    assert last_test["message"] == "Connection failed."


def test_connection_test_revalidates_persisted_endpoint_before_credential_read(model_api):
    client, store, credentials = model_api
    connection = _create_connection(client, "deepseek", credential="sk-never-read")
    state = json.loads(store.path.read_text(encoding="utf-8"))
    state["connections"][0]["apiBase"] = "http://127.0.0.1"
    store.path.write_text(json.dumps(state), encoding="utf-8")

    def forbidden_get(connection_id):
        raise AssertionError("credential read before endpoint validation")

    credentials.get = forbidden_get

    response = client.post(
        f"/api/promptcard/runtime/model-connections/{connection['id']}/test"
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "invalid_api_base"


def test_connection_test_normalizes_last_test_persistence_failure(model_api, monkeypatch):
    client, store, _ = model_api
    connection = _create_connection(client, "deepseek", credential="sk-test")
    monkeypatch.setattr(model_management, "probe_connection", lambda api_base, credential: None)
    monkeypatch.setattr(
        store,
        "record_test",
        lambda *args, **kwargs: (_ for _ in ()).throw(ModelManagementError("invalid_connection_store")),
    )

    response = client.post(
        f"/api/promptcard/runtime/model-connections/{connection['id']}/test"
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "invalid_connection_store"


def test_connection_test_normalizes_store_migration_failure(model_api, monkeypatch):
    client, _, _ = model_api
    monkeypatch.setattr(
        model_management,
        "_store",
        lambda: (_ for _ in ()).throw(CredentialStoreError()),
    )

    response = client.post(
        "/api/promptcard/runtime/model-connections/123e4567-e89b-12d3-a456-426614174000/test"
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "credential_store_unavailable"


def _create_connection(
    client: TestClient,
    provider_id: str,
    *,
    enabled: bool = True,
    credential: str | None = None,
) -> dict:
    payload = {
        "providerId": provider_id,
        "displayName": provider_id,
        "apiBase": (
            "https://api.deepseek.com"
            if provider_id == "deepseek"
            else "https://ark.cn-beijing.volces.com/api/v3"
        ),
        "enabled": enabled,
    }
    if credential is not None:
        payload["credential"] = credential
    response = client.post("/api/promptcard/runtime/model-connections", json=payload)
    assert response.status_code == 201
    return response.json()
