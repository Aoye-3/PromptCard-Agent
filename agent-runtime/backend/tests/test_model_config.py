from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.gateway.routers import promptcard_runtime
from app.gateway.promptcard_runtime import PromptCardRuntimeMessageRequest, PromptCardRuntimeService, validate_thread_metadata


def test_model_config_get_masks_api_key(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_HOME", str(tmp_path))
    app = FastAPI()
    app.state.config = _config(api_key="sk-secret1234567890")
    app.include_router(promptcard_runtime.router)

    with TestClient(app) as client:
        response = client.get("/api/promptcard/runtime/model-config")

    assert response.status_code == 200
    payload = response.json()
    assert payload["apiKeyConfigured"] is True
    assert payload["apiKeyPreview"].startswith("sk-")
    assert "secret1234567890" not in str(payload)


def test_model_config_put_persists_and_updates_runtime_config(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_HOME", str(tmp_path))
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
    assert (tmp_path / "promptcard-model-config.json").exists()


def test_model_config_test_reports_missing_api_key(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_HOME", str(tmp_path))
    app = FastAPI()
    app.state.config = _config(api_key="")
    app.include_router(promptcard_runtime.router)

    with TestClient(app) as client:
        response = client.post("/api/promptcard/runtime/model-config/test", json={})

    assert response.status_code == 200
    assert response.json()["success"] is False
    assert "API Key" in response.json()["message"]


def test_send_message_uses_configured_default_model(monkeypatch):
    service = PromptCardRuntimeService()
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(config=_config(name="deepseek-v32", api_key="sk-secret"))))

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
        assert body.context["model_name"] == "deepseek-v32"
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
