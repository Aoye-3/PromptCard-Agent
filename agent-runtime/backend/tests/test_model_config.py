from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.gateway.model_management.connection_store import ModelConnectionStore
from app.gateway.model_management.contracts import AssignmentRequest, ConnectionRequest
from app.gateway.promptcard_runtime import (
    PromptCardRuntimeMessageRequest,
    PromptCardRuntimeService,
    apply_model_config_to_runtime,
    validate_thread_metadata,
)
from app.gateway.routers import promptcard_runtime


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
def model_store(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_HOME", str(tmp_path))
    credentials = MemoryCredentialStore()
    store = ModelConnectionStore(tmp_path / "promptcard-model-connections.json", credentials)
    monkeypatch.setattr("app.gateway.promptcard_runtime.get_connection_store", lambda: store)
    return store, credentials


def test_model_config_get_masks_api_key(model_store):
    store, _ = model_store
    _seed_chat_assignment(store, "sk-secret1234567890")
    app = FastAPI()
    app.state.config = _config(api_key="")
    app.include_router(promptcard_runtime.router)

    with TestClient(app) as client:
        response = client.get("/api/promptcard/runtime/model-config")

    assert response.status_code == 200
    payload = response.json()
    assert payload["apiKeyConfigured"] is True
    assert payload["apiKeyPreview"] == "••••••••"
    assert "secret1234567890" not in str(payload)


def test_model_config_put_persists_and_updates_runtime_config(tmp_path, model_store):
    store, credentials = model_store
    app = FastAPI()
    app.state.config = _config(api_key="")
    app.include_router(promptcard_runtime.router)

    with TestClient(app) as client:
        response = client.put(
            "/api/promptcard/runtime/model-config",
            json={
                "enabled": True,
                "apiBase": "https://api.deepseek.com",
                "apiKey": "sk-newsecret1234567890",
                "modelName": "deepseek-chat",
                "temperature": 0.2,
                "maxTokens": 3000,
            },
        )

    assert response.status_code == 200
    assert response.json()["apiKeyConfigured"] is True
    assert app.state.config.models[0].api_key == "sk-newsecret1234567890"
    assert app.state.config.models[0].temperature == 0.2
    assignment = store.assignment("chat.primary")
    assert assignment is not None
    assert credentials.get(assignment["connectionId"]) == "sk-newsecret1234567890"
    assert "sk-newsecret1234567890" not in store.path.read_text(encoding="utf-8")
    assert (tmp_path / "promptcard-model-config.json").exists()
    assert "apiKey" not in (tmp_path / "promptcard-model-config.json").read_text(encoding="utf-8")


def test_model_config_test_reports_missing_api_key(model_store):
    app = FastAPI()
    app.state.config = _config(api_key="")
    app.include_router(promptcard_runtime.router)

    with TestClient(app) as client:
        response = client.post("/api/promptcard/runtime/model-config/test", json={})

    assert response.status_code == 200
    assert response.json()["success"] is False
    assert "API Key" in response.json()["message"]


def test_legacy_facade_preserves_free_form_deepseek_chat_model(model_store):
    store, _ = model_store
    app = FastAPI()
    app.state.config = _config(api_key="")
    app.include_router(promptcard_runtime.router)

    with TestClient(app) as client:
        response = client.put(
            "/api/promptcard/runtime/model-config",
            json={
                "apiBase": "https://api.deepseek.com",
                "apiKey": "sk-custom",
                "modelName": "deepseek-v32-custom",
            },
        )

    assert response.status_code == 200
    assert store.assignment("chat.primary")["modelId"] == "deepseek-v32-custom"


def test_legacy_test_rejects_bad_base_before_reading_credential(model_store):
    store, credentials = model_store
    _seed_chat_assignment(store, "sk-secret")

    def forbidden_get(connection_id):
        raise AssertionError("credential must not be read for an invalid endpoint")

    credentials.get = forbidden_get
    app = FastAPI()
    app.state.config = _config(api_key="")
    app.include_router(promptcard_runtime.router)

    with TestClient(app) as client:
        response = client.post(
            "/api/promptcard/runtime/model-config/test",
            json={"apiBase": "http://127.0.0.1", "apiKey": "sk-request"},
        )

    assert response.status_code == 422
    assert response.json()["detail"] == "invalid_api_base"


def test_legacy_save_validates_blank_model_before_mutating_secret(model_store):
    store, credentials = model_store
    _seed_chat_assignment(store, "sk-original")
    state_before = store.path.read_bytes()
    values_before = dict(credentials.values)
    app = FastAPI()
    app.state.config = _config(api_key="")
    app.include_router(promptcard_runtime.router)

    with TestClient(app) as client:
        response = client.put(
            "/api/promptcard/runtime/model-config",
            json={"modelName": "   ", "apiKey": "sk-must-not-be-written"},
        )

    assert response.status_code == 422
    assert response.json()["detail"] == "model_name_required"
    assert store.path.read_bytes() == state_before
    assert credentials.values == values_before


def test_legacy_save_restores_state_and_credential_when_state_write_fails(model_store, monkeypatch):
    store, credentials = model_store
    _seed_chat_assignment(store, "sk-original")
    state_before = store.path.read_bytes()
    values_before = dict(credentials.values)

    def partial_write(state):
        store.path.write_bytes(b"partial")
        raise OSError("disk details must not escape")

    monkeypatch.setattr(store, "replace_state", partial_write)
    app = FastAPI()
    app.state.config = _config(api_key="")
    app.include_router(promptcard_runtime.router)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.put(
            "/api/promptcard/runtime/model-config",
            json={"apiKey": "sk-new", "modelName": "deepseek-custom"},
        )

    assert response.status_code == 503
    assert response.json()["detail"] == "connection_store_unavailable"
    assert store.path.read_bytes() == state_before
    assert credentials.values == values_before
    assert "disk details" not in response.text


def test_runtime_clears_mutated_secret_when_chat_assignment_is_absent(model_store):
    store, _ = model_store
    _seed_chat_assignment(store, "sk-secret")
    config = _config(api_key="")

    apply_model_config_to_runtime(config)
    assert config.models[0].api_key == "sk-secret"

    state = store.read_state()
    state["assignments"] = {}
    store.replace_state(state)
    apply_model_config_to_runtime(config)

    assert config.models[0].api_key == ""


def test_send_message_uses_configured_default_model(monkeypatch, model_store):
    store, _ = model_store
    _seed_chat_assignment(store, "sk-secret")
    service = PromptCardRuntimeService()
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(config=_config(api_key=""))))

    async def fake_create_thread(body, request):
        assert body.metadata == {
            "source": "promptcard-runtime-boundary",
            "mode": "card-workspace",
            "permissionScope": "workspace-chatbot-agent",
            "sessionKey": "workspace:card:project-1",
            "projectId": "project-1",
        }
        return SimpleNamespace(thread_id="thread-1")

    async def fake_wait_run(*, thread_id, body, request):
        assert thread_id == "thread-1"
        assert request is not None
        assert body.context["model_name"] == "deepseek-chat"
        return {"messages": [{"role": "assistant", "content": "ok"}]}

    monkeypatch.setattr("app.gateway.promptcard_runtime.threads.create_thread", fake_create_thread)
    monkeypatch.setattr("app.gateway.promptcard_runtime.thread_runs.wait_run", fake_wait_run)
    monkeypatch.setattr("app.gateway.promptcard_runtime._load_presets", lambda: [])

    import anyio

    result = anyio.run(
        service.send_message,
        PromptCardRuntimeMessageRequest(
            content="hello",
            mode="card-workspace",
            permissionScope="workspace-chatbot-agent",
            sessionKey="workspace:card:project-1",
            workspaceContext={
                "projectId": "project-1",
                "contextId": "card:project-1:0",
                "snapshot": {},
            },
        ),
        request,
    )

    assert result["threadId"] == "thread-1"
    assert result["text"] == "ok"
    assert result["diagnostics"]["sessionKey"] == "workspace:card:project-1"
    assert result["diagnostics"]["projectId"] == "project-1"


def test_validate_thread_metadata_allows_matching_session():
    request = _request_with_thread_metadata({
        "sessionKey": "workspace:card:project-1",
        "projectId": "project-1",
        "permissionScope": "workspace-chatbot-agent",
    })

    import anyio

    anyio.run(
        validate_thread_metadata,
        "thread-1",
        {
            "sessionKey": "workspace:card:project-1",
            "projectId": "project-1",
            "permissionScope": "workspace-chatbot-agent",
        },
        request,
    )


@pytest.mark.parametrize(
    ("stored", "expected"),
    [
        ({"sessionKey": "workspace:card:project-2", "projectId": "project-1", "permissionScope": "workspace-chatbot-agent"}, {"sessionKey": "workspace:card:project-1"}),
        ({"sessionKey": "workspace:card:project-1", "projectId": "project-2", "permissionScope": "workspace-chatbot-agent"}, {"sessionKey": "workspace:card:project-1", "projectId": "project-1"}),
        ({"sessionKey": "workspace:card:project-1", "projectId": "project-1", "permissionScope": "prompt-library-agent"}, {"sessionKey": "workspace:card:project-1", "projectId": "project-1", "permissionScope": "workspace-chatbot-agent"}),
    ],
)
def test_validate_thread_metadata_rejects_cross_session_reuse(stored, expected):
    request = _request_with_thread_metadata(stored)

    import anyio

    with pytest.raises(HTTPException) as exc:
        anyio.run(validate_thread_metadata, "thread-1", expected, request)

    assert exc.value.status_code == 409


def test_validate_thread_metadata_keeps_legacy_requests_without_session_key_compatible():
    request = _request_with_thread_metadata({})

    import anyio

    anyio.run(validate_thread_metadata, "thread-1", {"permissionScope": "workspace-chatbot-agent"}, request)


def _request_with_thread_metadata(metadata: dict):
    class ThreadStore:
        async def get(self, thread_id):
            assert thread_id == "thread-1"
            return {"thread_id": thread_id, "metadata": metadata}

    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(thread_store=ThreadStore())))


def _config(name: str = "deepseek-chat", api_key: str = "sk-secret"):
    model = SimpleNamespace(
        name=name,
        model=name,
        display_name="DeepSeek",
        description=None,
        use="langchain_deepseek:ChatDeepSeek",
        api_key=api_key,
        base_url="https://api.deepseek.com",
        timeout=600.0,
        max_retries=2,
        max_tokens=4096,
        temperature=0.3,
        supports_thinking=False,
        supports_reasoning_effort=False,
        supports_vision=False,
    )
    return SimpleNamespace(
        models=[model],
        tools=[],
        token_usage=SimpleNamespace(enabled=True),
        get_model_config=lambda model_name: model if model_name == name else None,
    )


def _seed_chat_assignment(store: ModelConnectionStore, credential: str) -> None:
    connection = store.create_connection(
        ConnectionRequest(
            providerId="deepseek",
            displayName="DeepSeek",
            apiBase="https://api.deepseek.com",
            enabled=True,
            credential=credential,
        )
    )
    store.set_assignment(
        "chat.primary",
        AssignmentRequest(connectionId=connection["id"], modelId="deepseek-chat"),
    )
