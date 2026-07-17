from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.model_management.catalog import model_by_id
from app.gateway.model_management.connection_store import default_connection_store_path
from app.gateway.promptcard_runtime import (
    PromptCardRuntimeMessageRequest,
    validate_agent_proposals,
)
from app.gateway.routers import promptcard_runtime


def test_ark_multimodal_text_model_is_in_catalog():
    model = model_by_id("doubao-seed-2-0-lite-260215")

    assert model is not None
    assert model["providerId"] == "volcengine-ark"
    assert model["modality"] == "chat"
    assert model["capabilities"]["input"] == ["text", "image"]


def test_connection_store_uses_promptcard_runtime_state_dir(monkeypatch):
    state_dir = Path(__file__).parent / ".runtime-state-test"
    monkeypatch.setenv("PROMPTCARD_RUNTIME_STATE_DIR", str(state_dir))

    assert default_connection_store_path() == state_dir / "promptcard-model-connections.json"


def test_selected_canvas_text_node_only_accepts_update_for_selected_node():
    context = {
        "snapshot": {
            "selectedNodeId": "text-1",
            "selectedNode": {"id": "text-1", "kind": "text", "userText": "old"},
            "nodes": [
                {"id": "text-1", "kind": "text"},
                {"id": "text-2", "kind": "text"},
            ],
        }
    }
    proposals = [
        {
            "kind": "free_canvas_text_update",
            "id": "keep",
            "nodeId": "text-1",
            "mode": "replace",
            "userText": "new",
        },
        {
            "kind": "free_canvas_text_update",
            "id": "drop",
            "nodeId": "text-2",
            "mode": "replace",
            "userText": "wrong target",
        },
        {
            "kind": "free_canvas_text_create",
            "id": "drop-create",
            "userText": "must not create while a text node is selected",
        },
    ]

    validated = validate_agent_proposals(
        proposals,
        workspace_context=context,
        permission_scope="workspace-chatbot-agent",
    )

    assert [proposal["id"] for proposal in validated] == ["keep"]


def test_canvas_without_selected_text_node_only_accepts_text_create():
    context = {
        "snapshot": {
            "selectedNodeId": None,
            "selectedNode": None,
            "nodes": [{"id": "image-1", "kind": "image"}],
        }
    }
    proposals = [
        {
            "kind": "free_canvas_text_update",
            "id": "drop-update",
            "nodeId": "missing",
            "mode": "replace",
            "userText": "wrong",
        },
        {
            "kind": "free_canvas_text_create",
            "id": "keep-create",
            "title": "Agent Prompt",
            "userText": "new prompt",
        },
    ]

    validated = validate_agent_proposals(
        proposals,
        workspace_context=context,
        permission_scope="workspace-chatbot-agent",
    )

    assert [proposal["id"] for proposal in validated] == ["keep-create"]


def test_prompt_library_scope_only_accepts_additive_create():
    proposals = [
        {
            "kind": "prompt_library_write_proposal",
            "id": "keep",
            "operation": "create",
            "presetDraft": {
                "type": "style",
                "category": "agent",
                "label": "Cinematic",
                "content": "cinematic light",
            },
        },
        {
            "kind": "prompt_library_write_proposal",
            "id": "drop",
            "operation": "update",
            "targetPresetId": "preset-1",
            "presetDraft": {
                "type": "style",
                "category": "agent",
                "label": "Overwrite",
                "content": "not allowed",
            },
        },
    ]

    validated = validate_agent_proposals(
        proposals,
        workspace_context=None,
        permission_scope="prompt-library-agent",
    )

    assert [proposal["id"] for proposal in validated] == ["keep"]


def test_messages_endpoint_keeps_public_contract(monkeypatch):
    async def fake_send_message(body: PromptCardRuntimeMessageRequest, request):
        assert body.content == "补全提示词"
        return {
            "threadId": "thread-1",
            "text": "已生成待确认修改。",
            "proposals": [],
            "diagnostics": {"orchestrator": "pi"},
        }

    monkeypatch.setattr(promptcard_runtime.runtime_service, "send_message", fake_send_message)
    app = FastAPI()
    app.include_router(promptcard_runtime.router)

    with TestClient(app) as client:
        response = client.post(
            "/api/promptcard/runtime/messages",
            json={
                "content": "补全提示词",
                "mode": "free-canvas-workspace",
                "sessionKey": "workspace:free-canvas:project-1",
                "projectId": "project-1",
                "workspaceContext": {
                    "contextId": "free-canvas:project-1:text-1",
                    "mode": "free-canvas-workspace",
                    "projectId": "project-1",
                    "projectTitle": "Project",
                    "snapshot": {
                        "selectedNodeId": "text-1",
                        "selectedNode": {"id": "text-1", "kind": "text"},
                        "nodes": [{"id": "text-1", "kind": "text"}],
                    },
                },
            },
        )

    assert response.status_code == 200
    assert response.json()["threadId"] == "thread-1"
    assert response.json()["diagnostics"]["orchestrator"] == "pi"


def test_internal_text_model_endpoint_returns_provider_descriptor(monkeypatch):
    monkeypatch.setenv("PROMPTCARD_INTERNAL_TOKEN", "internal-test-token")
    async def fake_internal_text_model():
        return {
            "connectionId": "connection-1",
            "providerId": "deepseek",
            "model": {
                "id": "deepseek-chat",
                "displayName": "DeepSeek Chat",
                "modality": "chat",
                "integrationGroup": {
                    "id": "pi-native",
                    "displayName": "PI 原生",
                    "kind": "pi-native",
                },
            },
        }

    monkeypatch.setattr(
        promptcard_runtime.runtime_service,
        "internal_text_model",
        fake_internal_text_model,
    )
    app = FastAPI()
    app.include_router(promptcard_runtime.router)

    with TestClient(app) as client:
        response = client.get(
            "/api/promptcard/runtime/internal/text-model",
            headers={"X-PromptCard-Internal-Token": "internal-test-token"},
        )

    assert response.status_code == 200
    assert response.json()["model"]["integrationGroup"]["kind"] == "pi-native"
    assert "credential" not in response.json()


def test_internal_text_model_endpoint_rejects_local_session_only(monkeypatch):
    monkeypatch.setenv("PROMPTCARD_INTERNAL_TOKEN", "internal-test-token")
    app = FastAPI()
    app.include_router(promptcard_runtime.router)

    with TestClient(app) as client:
        response = client.get("/api/promptcard/runtime/internal/text-model")

    assert response.status_code == 401
    assert response.json()["detail"] == "internal_auth_required"


def test_pi_native_proxy_injects_stored_credential_and_streams(monkeypatch):
    captured = {}
    monkeypatch.setenv("PROMPTCARD_INTERNAL_TOKEN", "internal-test-token")

    def fake_resolve(connection_id):
        assert connection_id == "connection-1"
        return {
            "providerId": "deepseek",
            "apiBase": "https://api.deepseek.com",
            "credential": "stored-secret",
            "modelId": "deepseek-chat",
        }

    class FakeUpstream:
        status_code = 200
        headers = {"content-type": "text/event-stream"}

        async def aiter_raw(self):
            yield b'data: {"ok":true}\n\n'

        async def aclose(self):
            captured["upstreamClosed"] = True

    class FakeClient:
        def __init__(self, *, timeout):
            captured["timeout"] = timeout

        def build_request(self, method, url, *, content, headers):
            captured.update(
                method=method,
                url=url,
                content=content,
                headers=headers,
            )
            return object()

        async def send(self, request, *, stream):
            captured["stream"] = stream
            return FakeUpstream()

        async def aclose(self):
            captured["clientClosed"] = True

    monkeypatch.setattr(promptcard_runtime, "resolve_pi_native_proxy", fake_resolve)
    monkeypatch.setattr(promptcard_runtime.httpx, "AsyncClient", FakeClient)
    app = FastAPI()
    app.include_router(promptcard_runtime.router)

    with TestClient(app) as client:
        response = client.post(
            "/api/promptcard/runtime/internal/pi-proxy/connection-1/chat/completions",
            headers={
                "Authorization": "Bearer must-not-forward",
                "X-PromptCard-Internal-Token": "internal-test-token",
            },
            json={"model": "deepseek-chat", "stream": True},
        )

    assert response.status_code == 200
    assert captured["url"] == "https://api.deepseek.com/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer stored-secret"
    assert captured["stream"] is True
    assert captured["upstreamClosed"] is True
    assert captured["clientClosed"] is True


def test_media_analysis_endpoint_keeps_selected_asset_boundary(monkeypatch):
    async def fake_analyze(body, request):
        assert body.asset_id == "asset-selected"
        assert body.content_type == "image/png"
        return {
            "threadId": "media-thread-1",
            "text": "低饱和电影光。",
            "proposals": [],
            "diagnostics": {"attachmentCount": 1},
        }

    monkeypatch.setattr(promptcard_runtime.runtime_service, "analyze_media", fake_analyze)
    app = FastAPI()
    app.include_router(promptcard_runtime.router)

    with TestClient(app) as client:
        response = client.post(
            "/api/promptcard/runtime/media-analysis",
            json={
                "assetId": "asset-selected",
                "contentType": "image/png",
                "analysisType": "style",
                "content": "分析风格",
            },
        )

    assert response.status_code == 200
    assert response.json()["diagnostics"]["attachmentCount"] == 1
