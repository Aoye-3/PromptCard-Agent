from __future__ import annotations

import importlib.util
import json
import logging
from email.message import Message
from pathlib import Path
from urllib.error import HTTPError
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.gateway.promptcard_runtime as promptcard_runtime_module
from app.gateway.model_management.connection_store import ModelConnectionStore, ModelManagementError
from app.gateway.model_management.contracts import ConnectionRequest
from app.gateway.model_management.credential_store import CredentialStoreError
from app.gateway.model_management.migration import migrate_legacy_connection_state
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


def test_legacy_connection_state_is_recovered_once_without_moving_credentials(tmp_path):
    credentials = MemoryCredentialStore()
    connection_id = "575822c5-7569-44d5-8712-db8d4782ab17"
    credentials.set(connection_id, "saved-secret")
    store = ModelConnectionStore(
        tmp_path / ".promptcard-runtime" / "promptcard-model-connections.json",
        credentials,
    )
    legacy_path = tmp_path / ".deer-flow" / "promptcard-model-connections.json"
    legacy_path.parent.mkdir(parents=True)
    legacy_path.write_text(
        json.dumps(
            {
                "version": 1,
                "connections": [
                    {
                        "id": connection_id,
                        "providerId": "volcengine-ark",
                        "displayName": "Seedream",
                        "apiBase": "https://ark.cn-beijing.volces.com/api/v3",
                        "enabled": True,
                        "credentialRef": f"connection:{connection_id}",
                        "createdAt": 1,
                        "updatedAt": 2,
                    }
                ],
                "assignments": {
                    "image.primary": {
                        "slot": "image.primary",
                        "connectionId": connection_id,
                        "modelId": "doubao-seedream-5-0-pro-260628",
                    }
                },
            }
        ),
        encoding="utf-8",
    )

    assert migrate_legacy_connection_state(legacy_path, store) is True
    assert migrate_legacy_connection_state(legacy_path, store) is False
    assert len(store.list_connections()) == 1
    assert store.assignment("image.primary") == {
        "slot": "image.primary",
        "connectionId": connection_id,
        "modelId": "doubao-seedream-5-0-pro-260628",
    }
    assert credentials.get(connection_id) == "saved-secret"
    assert "saved-secret" not in store.path.read_text(encoding="utf-8")


def test_catalog_contains_chat_and_image_manifests(model_api):
    client, _, _ = model_api

    response = client.get("/api/promptcard/runtime/model-catalog")

    assert response.status_code == 200
    payload = response.json()
    assert {provider["id"] for provider in payload["providers"]} == {"deepseek", "volcengine-ark"}
    deepseek_provider = next(provider for provider in payload["providers"] if provider["id"] == "deepseek")
    ark_provider = next(provider for provider in payload["providers"] if provider["id"] == "volcengine-ark")
    assert deepseek_provider["integrationGroups"]["chat"]["displayName"] == "PI 原生"
    assert ark_provider["integrationGroups"]["chat"]["displayName"] == "方舟 SDK"
    assert ark_provider["integrationGroups"]["image"]["displayName"] == "方舟 SDK"
    assert {
        (model["id"], model["providerId"], model["modality"])
        for model in payload["models"]
    } == {
        ("deepseek-chat", "deepseek", "chat"),
        ("doubao-seed-2-0-lite-260215", "volcengine-ark", "chat"),
        ("doubao-seedream-5-0-pro-260628", "volcengine-ark", "image"),
    }
    seedream = next(model for model in payload["models"] if model["modality"] == "image")
    assert seedream["integrationGroup"] == {
        "id": "volcengine-ark-sdk",
        "displayName": "方舟 SDK",
        "kind": "sdk",
    }
    assert seedream["source"] == "provider-catalog"
    assert seedream["assignable"] is True
    assert seedream["capabilities"] == {
        "modes": ["generate", "edit", "region-edit"],
        "maxReferenceImages": 10,
        "mentionStrategy": "ordered-image-labels",
        "regionInputs": ["point", "bbox"],
        "resolutions": ["1K", "2K"],
        "aspectRatios": ["smart", "1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9", "custom"],
            "customSize": {
                "minPixels": 921600,
                "maxPixels": 4624220,
                "minAspectRatio": 0.0625,
                "maxAspectRatio": 16,
            },
            "promptOptimization": {
                "modes": ["standard", "fast"],
                "default": "standard",
            },
            "inputConstraints": {
                "formats": ["jpeg", "png", "webp", "bmp", "tiff", "gif", "heic", "heif"],
                "maxImages": 10,
                "maxBytesPerImage": 31457280,
                "maxPixelsPerImage": 36000000,
                "minSideExclusive": 14,
                "minAspectRatio": 0.0625,
                "maxAspectRatio": 16,
            },
            "annotationInputs": ["raster-markup"],
            "outputFormats": ["png", "jpeg"],
            "responseTransports": ["url", "b64_json"],
            "watermark": True,
        "outputCount": 1,
        "streaming": False,
    }


def test_connection_model_discovery_is_scoped_to_its_provider(model_api):
    client, _, _ = model_api
    connection = _create_connection(client, "volcengine-ark")

    response = client.get(
        f"/api/promptcard/runtime/model-connections/{connection['id']}/models"
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["connectionId"] == connection["id"]
    assert payload["providerId"] == "volcengine-ark"
    assert {
        (model["id"], model["modality"], model["integrationGroup"]["displayName"])
        for model in payload["models"]
    } == {
        ("doubao-seed-2-0-lite-260215", "chat", "方舟 SDK"),
        ("doubao-seedream-5-0-pro-260628", "image", "方舟 SDK"),
    }
    assert all(model["providerId"] == "volcengine-ark" for model in payload["models"])


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
    assert type(persisted["createdAt"]) is int
    assert type(persisted["updatedAt"]) is int
    assert set(persisted) == {
        "id", "providerId", "displayName", "apiBase", "enabled",
        "credentialRef", "createdAt", "updatedAt",
    }
    created_at = persisted["createdAt"]
    updated_at = persisted["updatedAt"]
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
    persisted_updated = json.loads(store.path.read_text(encoding="utf-8"))["connections"][0]
    assert persisted_updated["createdAt"] == created_at
    assert persisted_updated["updatedAt"] > updated_at

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
                "https://[",
            ]
        ],
    ],
)
def test_connection_write_validates_provider_and_http_base_url(model_api, payload):
    client, _, _ = model_api

    response = client.post("/api/promptcard/runtime/model-connections", json=payload)

    assert response.status_code == 422


def test_assignments_validate_modality_connection_state_and_delete_references(model_api):
    client, store, _ = model_api
    deepseek = _create_connection(client, "deepseek", enabled=True, credential="sk-ready")
    ark = _create_connection(client, "volcengine-ark", enabled=True)
    disabled = _create_connection(client, "deepseek", enabled=False)

    wrong_modality = client.put(
        "/api/promptcard/runtime/model-assignments/chat.primary",
        json={"connectionId": ark["id"], "modelId": "doubao-seedream-5-0-pro-260628"},
    )
    assert wrong_modality.status_code == 422
    assert wrong_modality.json()["detail"]["code"] == "incompatible_model_slot"

    disabled_connection = client.put(
        "/api/promptcard/runtime/model-assignments/chat.primary",
        json={"connectionId": disabled["id"], "modelId": "deepseek-chat"},
    )
    assert disabled_connection.status_code == 422
    assert disabled_connection.json()["detail"]["code"] == "connection_disabled"

    missing_connection = client.put(
        "/api/promptcard/runtime/model-assignments/chat.primary",
        json={
            "connectionId": "123e4567-e89b-12d3-a456-426614174000",
            "modelId": "deepseek-chat",
        },
    )
    assert missing_connection.status_code == 422
    assert missing_connection.json()["detail"]["code"] == "connection_not_found"

    store.record_test(deepseek["id"], success=True)

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
    assert rejected_delete.json()["detail"]["code"] == "connection_is_assigned"

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
        assert rejected_update.json()["detail"]["code"] == "connection_is_assigned"


def test_assignment_requires_credential_and_successful_latest_test(model_api):
    client, store, _ = model_api
    missing_credential = _create_connection(client, "deepseek")

    response = client.put(
        "/api/promptcard/runtime/model-assignments/chat.primary",
        json={"connectionId": missing_credential["id"], "modelId": "deepseek-chat"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == {
        "code": "credential_missing",
        "message": "The model connection has no configured credential.",
        "action": "update_credential",
        "retryable": False,
        "field": "connectionId",
    }

    untested = _create_connection(client, "deepseek", credential="sk-untested")
    response = client.put(
        "/api/promptcard/runtime/model-assignments/chat.primary",
        json={"connectionId": untested["id"], "modelId": "deepseek-chat"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "connection_not_tested"

    store.record_test(untested["id"], success=False)
    response = client.put(
        "/api/promptcard/runtime/model-assignments/chat.primary",
        json={"connectionId": untested["id"], "modelId": "deepseek-chat"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "connection_test_failed"


@pytest.mark.parametrize(
    ("sdk_status", "error_code"),
    [
        ("missing", "ark_sdk_missing"),
        ("incompatible", "ark_sdk_incompatible"),
        ("check_failed", "ark_sdk_check_failed"),
    ],
)
def test_image_assignment_requires_ready_ark_sdk(
    model_api,
    monkeypatch,
    sdk_status,
    error_code,
):
    client, store, _ = model_api
    connection = _create_connection(
        client,
        "volcengine-ark",
        credential="ark-ready-credential",
    )
    store.record_test(connection["id"], success=True)
    monkeypatch.setattr(
        model_management,
        "collect_image_generation_status",
        lambda: _diagnostic_status(sdk_status, error_code),
    )

    response = client.put(
        "/api/promptcard/runtime/model-assignments/image.primary",
        json={
            "connectionId": connection["id"],
            "modelId": "doubao-seedream-5-0-pro-260628",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == error_code


def test_ark_connection_test_requires_ready_sdk_before_credential_or_probe(
    model_api,
    monkeypatch,
):
    client, _, credentials = model_api
    connection = _create_connection(
        client,
        "volcengine-ark",
        credential="ark-never-read",
    )
    monkeypatch.setattr(
        model_management,
        "collect_image_generation_status",
        lambda: _diagnostic_status("missing", "ark_sdk_missing"),
    )
    credentials.get = lambda connection_id: (_ for _ in ()).throw(
        AssertionError("credential read before SDK readiness")
    )
    monkeypatch.setattr(
        model_management,
        "probe_connection",
        lambda *args: (_ for _ in ()).throw(
            AssertionError("provider probe before SDK readiness")
        ),
    )

    response = client.post(
        f"/api/promptcard/runtime/model-connections/{connection['id']}/test"
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "ark_sdk_missing"


def test_assignment_can_be_deleted_and_connection_dependencies_are_explicit(model_api):
    client, store, _ = model_api
    connection = _create_connection(client, "deepseek", credential="sk-ready")
    store.record_test(connection["id"], success=True)
    assigned = client.put(
        "/api/promptcard/runtime/model-assignments/chat.primary",
        json={"connectionId": connection["id"], "modelId": "deepseek-chat"},
    )
    assert assigned.status_code == 200

    dependencies = client.get(
        f"/api/promptcard/runtime/model-connections/{connection['id']}/dependencies"
    )
    assert dependencies.status_code == 200
    assert dependencies.json() == {
        "assignments": ["chat.primary"],
        "canvasNodeCount": None,
        "canvasNodeCountAvailable": False,
    }

    deleted = client.delete("/api/promptcard/runtime/model-assignments/chat.primary")
    assert deleted.status_code == 204
    assert client.get("/api/promptcard/runtime/model-assignments").json() == {
        "assignments": []
    }
    assert client.delete(
        f"/api/promptcard/runtime/model-connections/{connection['id']}"
    ).status_code == 204


def test_material_connection_changes_invalidate_last_test(model_api):
    client, store, credentials = model_api
    connection = _create_connection(client, "deepseek", credential="sk-first")
    store.record_test(connection["id"], success=True)

    renamed = client.put(
        f"/api/promptcard/runtime/model-connections/{connection['id']}",
        json={
            "providerId": "deepseek",
            "displayName": "Renamed only",
            "apiBase": "https://api.deepseek.com",
            "enabled": True,
        },
    )
    assert renamed.status_code == 200
    assert renamed.json()["lastTest"]["ok"] is True

    credential_changed = client.put(
        f"/api/promptcard/runtime/model-connections/{connection['id']}",
        json={
            "providerId": "deepseek",
            "displayName": "Renamed only",
            "apiBase": "https://api.deepseek.com",
            "enabled": True,
            "credential": "sk-second",
        },
    )
    assert credential_changed.status_code == 200
    assert "lastTest" not in credential_changed.json()
    assert credentials.get(connection["id"]) == "sk-second"


def test_legacy_chat_save_invalidates_last_test_when_credential_changes(model_api):
    _, store, _ = model_api
    first = store.save_legacy_chat(
        ConnectionRequest(
            providerId="deepseek",
            displayName="DeepSeek",
            apiBase="https://api.deepseek.com",
            enabled=True,
            credential="sk-first",
        ),
        "deepseek-chat",
    )
    store.record_test(first["id"], success=True)

    updated = store.save_legacy_chat(
        ConnectionRequest(
            providerId="deepseek",
            displayName="DeepSeek",
            apiBase="https://api.deepseek.com",
            enabled=True,
            credential="sk-second",
        ),
        "deepseek-chat",
    )

    assert "lastTest" not in updated


def test_model_management_errors_use_safe_structured_envelope(model_api):
    client, _, _ = model_api

    response = client.get(
        "/api/promptcard/runtime/model-connections/123e4567-e89b-12d3-a456-426614174000/dependencies"
    )

    assert response.status_code == 422
    assert response.json()["detail"] == {
        "code": "connection_not_found",
        "message": "The model connection was not found.",
        "action": "refresh_connections",
        "retryable": False,
        "field": "connectionId",
    }


def test_connection_test_uses_stored_secret_without_returning_it(model_api, monkeypatch, caplog):
    client, store, _ = model_api
    secret = "sk-test-only-secret"
    connection = _create_connection(client, "deepseek", credential=secret)
    observed: dict[str, str] = {}

    def fake_probe(provider_id: str, api_base: str, credential: str) -> None:
        observed.update(provider_id=provider_id, api_base=api_base, credential=credential)

    monkeypatch.setattr(model_management, "probe_connection", fake_probe)
    with caplog.at_level(logging.DEBUG):
        response = client.post(
            f"/api/promptcard/runtime/model-connections/{connection['id']}/test"
        )

    assert response.status_code == 200
    assert response.json() == {"success": True, "message": "Connection ok."}
    assert observed == {
        "provider_id": "deepseek",
        "api_base": "https://api.deepseek.com",
        "credential": secret,
    }
    assert secret not in response.text
    assert secret not in caplog.text
    persisted = json.loads(store.path.read_text(encoding="utf-8"))["connections"][0]
    assert set(persisted["lastTest"]) == {"ok", "checkedAt", "message"}
    assert persisted["lastTest"]["ok"] is True
    assert type(persisted["lastTest"]["checkedAt"]) is int
    assert persisted["lastTest"]["message"] == "Connection ok."
    assert persisted["updatedAt"] == persisted["lastTest"]["checkedAt"]


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

    monkeypatch.setattr(
        "app.gateway.model_management.service.urllib.request.build_opener",
        lambda *handlers: RedirectingOpener(),
    )

    response = client.post(
        f"/api/promptcard/runtime/model-connections/{connection['id']}/test"
    )

    assert response.status_code == 200
    assert response.json() == {"success": False, "message": "Connection failed."}
    assert opened == ["https://api.deepseek.com/models"]
    assert "provider-controlled" not in response.text
    last_test = json.loads(store.path.read_text(encoding="utf-8"))["connections"][0]["lastTest"]
    assert last_test["ok"] is False
    assert last_test["message"] == "Connection failed."


def test_ark_connection_probe_uses_documented_ping_endpoint(model_api, monkeypatch):
    client, _, _ = model_api
    connection = _create_connection(
        client,
        "volcengine-ark",
        credential="ark-probe-secret",
    )
    opened: list[str] = []

    class SuccessfulResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

    class SuccessfulOpener:
        def open(self, request, timeout):
            opened.append(request.full_url)
            return SuccessfulResponse()

    monkeypatch.setattr(
        model_management,
        "collect_image_generation_status",
        lambda: _diagnostic_status("ready", None),
    )
    monkeypatch.setattr(
        "app.gateway.model_management.service.urllib.request.build_opener",
        lambda *handlers: SuccessfulOpener(),
    )

    response = client.post(
        f"/api/promptcard/runtime/model-connections/{connection['id']}/test"
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert opened == ["https://ark.cn-beijing.volces.com/ping"]


def test_create_validates_corrupt_state_before_credential_mutation(model_api):
    client, store, credentials = model_api
    store.path.write_bytes(b"not-json")

    response = client.post(
        "/api/promptcard/runtime/model-connections",
        json={
            "providerId": "deepseek",
            "displayName": "Must not persist",
            "apiBase": "https://api.deepseek.com",
            "enabled": True,
            "credential": "sk-must-not-be-written",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_connection_store"
    assert credentials.values == {}


def test_probe_helper_is_owned_by_model_management_service():
    assert importlib.util.find_spec("app.gateway.model_management.service") is not None
    from app.gateway.model_management import service

    assert model_management.probe_connection is service.probe_connection
    promptcard_source = Path(promptcard_runtime_module.__file__).read_text(encoding="utf-8")
    assert "app.gateway.routers.model_management import probe_connection" not in promptcard_source


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
    assert response.json()["detail"]["code"] == "invalid_api_base"


def test_connection_test_normalizes_last_test_persistence_failure(model_api, monkeypatch):
    client, store, _ = model_api
    connection = _create_connection(client, "deepseek", credential="sk-test")
    monkeypatch.setattr(model_management, "probe_connection", lambda *args: None)
    monkeypatch.setattr(
        store,
        "record_test",
        lambda *args, **kwargs: (_ for _ in ()).throw(ModelManagementError("invalid_connection_store")),
    )

    response = client.post(
        f"/api/promptcard/runtime/model-connections/{connection['id']}/test"
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_connection_store"


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
    assert response.json()["detail"]["code"] == "credential_store_unavailable"


@pytest.mark.parametrize("operation", ["get", "post", "put", "test"])
def test_model_routes_normalize_storage_io_failures(model_api, monkeypatch, operation):
    client, store, _ = model_api
    connection = _create_connection(client, "deepseek", credential="sk-test")

    def fail_read_state():
        raise OSError("private storage path")

    monkeypatch.setattr(store, "read_state", fail_read_state)
    with TestClient(client.app, raise_server_exceptions=False) as safe_client:
        if operation == "get":
            response = safe_client.get("/api/promptcard/runtime/model-connections")
        elif operation == "post":
            response = safe_client.post(
                "/api/promptcard/runtime/model-connections",
                json={
                    "providerId": "deepseek",
                    "displayName": "New",
                    "apiBase": "https://api.deepseek.com",
                    "enabled": True,
                    "credential": "sk-new",
                },
            )
        elif operation == "put":
            response = safe_client.put(
                f"/api/promptcard/runtime/model-connections/{connection['id']}",
                json={
                    "providerId": "deepseek",
                    "displayName": "Updated",
                    "apiBase": "https://api.deepseek.com",
                    "enabled": True,
                },
            )
        else:
            response = safe_client.post(
                f"/api/promptcard/runtime/model-connections/{connection['id']}/test"
            )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "connection_store_unavailable"
    assert "private storage path" not in response.text


@pytest.mark.parametrize("failure", ["legacy_read", "state_snapshot", "sanitize"])
def test_migration_io_failures_are_stable_on_get(model_api, monkeypatch, failure):
    client, store, _ = model_api
    legacy_path = store.path.parent / "promptcard-model-config.json"
    legacy_path.write_text(
        json.dumps({"apiKey": "sk-legacy", "modelName": "deepseek-chat"}),
        encoding="utf-8",
    )
    if failure == "legacy_read":
        real_read_text = Path.read_text

        def fail_legacy_read(path, *args, **kwargs):
            if path == legacy_path:
                raise OSError("private legacy read")
            return real_read_text(path, *args, **kwargs)

        monkeypatch.setattr(Path, "read_text", fail_legacy_read)
    elif failure == "state_snapshot":
        monkeypatch.setattr(
            store,
            "state_bytes",
            lambda: (_ for _ in ()).throw(OSError("private snapshot")),
        )
    else:
        monkeypatch.setattr(
            "app.gateway.model_management.migration._atomic_write_json",
            lambda path, payload: (_ for _ in ()).throw(OSError("private sanitize")),
        )

    with TestClient(client.app, raise_server_exceptions=False) as safe_client:
        response = safe_client.get("/api/promptcard/runtime/model-connections")

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "migration_failed"
    assert "private" not in response.text


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


def _diagnostic_status(status: str, error_code: str | None) -> dict:
    return {
        "serverEnabled": True,
        "checkedAt": 1,
        "credentialStore": {"available": True},
        "providers": [
            {
                "providerId": "volcengine-ark",
                "status": status,
                "sdk": {
                    "packageName": "volcengine-python-sdk",
                    "installedVersion": None,
                    "requiredVersion": "5.0.36",
                    "compatible": status == "ready",
                    "error": (
                        None
                        if error_code is None
                        else {"code": error_code, "message": "safe"}
                    ),
                },
            }
        ],
    }
