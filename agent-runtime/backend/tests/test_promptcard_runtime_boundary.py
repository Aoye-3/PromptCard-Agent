from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.gateway.model_management.catalog import model_by_id
from app.gateway.model_management.connection_store import default_connection_store_path
from app.gateway.promptcard_runtime import (
    PromptCardRuntimeMessageRequest,
    _allowed_tool_names,
    _resolve_canvas_node_context,
    validate_agent_proposals,
)
from app.gateway.routers import promptcard_runtime


def test_prompt_library_search_tool_is_only_available_in_explicit_retrieval_mode():
    completion = PromptCardRuntimeMessageRequest.model_validate({
        "content": "Complete it",
        "permissionScope": "workspace-chatbot-agent",
        "canvasNodeContext": {
            "mode": "complete", "targetNodeId": "text-1",
            "referenceNodeIds": [], "mentions": [],
        },
    })
    retrieval = PromptCardRuntimeMessageRequest.model_validate({
        "content": "Find matching prompts",
        "permissionScope": "workspace-chatbot-agent",
        "canvasNodeContext": {
            "mode": "prompt-library", "targetNodeId": None,
            "referenceNodeIds": [], "mentions": [],
        },
    })

    assert _allowed_tool_names(completion) == {"emit_canvas_text_update"}
    assert _allowed_tool_names(retrieval) == {"search_prompt_library"}


def test_prompt_library_retrieval_context_is_read_only():
    body = PromptCardRuntimeMessageRequest.model_validate({
        "content": "Find matching prompts", "projectId": "project-1",
        "workspaceContext": {
            "projectId": "project-1",
            "snapshot": {"nodes": [
                {"id": "text-1", "kind": "text", "title": "Reference"},
            ]},
        },
        "canvasNodeContext": {
            "mode": "prompt-library", "targetNodeId": None,
            "referenceNodeIds": ["text-1"],
            "mentions": [{"nodeId": "text-1", "label": "Reference"}],
        },
    })

    resolved = _resolve_canvas_node_context(body)

    assert resolved["mode"] == "prompt-library"
    assert resolved["target"] is None
    assert resolved["references"] == [{"nodeId": "text-1", "name": "Reference"}]


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
    assert validated[0]["editMode"] == "rewrite_all"


def test_explicit_canvas_context_forces_append_and_rejects_reference_updates():
    context = {
        "snapshot": {
            "nodes": [
                {"id": "text-1", "kind": "text", "revision": 3, "presetText": "Template", "userText": "Target"},
                {"id": "text-2", "kind": "text", "revision": 4, "presetText": "", "userText": "Reference"},
            ]
        }
    }
    canvas_context = {
        "mode": "complete", "targetNodeId": "text-1", "referenceNodeIds": ["text-2"], "mentions": []
    }
    proposals = [
        {"kind": "free_canvas_text_update", "id": "keep", "nodeId": "text-1", "userText": "Added"},
        {"kind": "free_canvas_text_update", "id": "drop", "nodeId": "text-2", "userText": "Changed"},
    ]

    validated = validate_agent_proposals(
        proposals,
        workspace_context=context,
        permission_scope="workspace-chatbot-agent",
        canvas_node_context=canvas_context,
    )

    assert [proposal["id"] for proposal in validated] == ["keep"]
    assert validated[0]["editMode"] == "append"
    assert validated[0]["baseContentDigest"].startswith("sha256:")


def test_explicit_canvas_context_discards_model_controlled_edit_fields():
    context = {"snapshot": {"nodes": [{
        "id": "text-1", "kind": "text", "revision": 3,
        "presetText": "Template", "userText": "Target",
    }]}}
    canvas_context = {
        "mode": "complete", "targetNodeId": "text-1",
        "referenceNodeIds": [], "mentions": [],
        "targetNode": context["snapshot"]["nodes"][0],
        "referenceNodes": [],
    }

    validated = validate_agent_proposals(
        [{
            "kind": "free_canvas_text_update", "id": "keep", "nodeId": "text-1",
            "editMode": "rewrite_selection", "mode": "replace",
            "selection": {"start": 0, "end": 6, "selectedText": "Target"},
            "baseNodeRevision": 999, "templateDigest": "sha256:forged",
            "baseContentDigest": "sha256:forged", "userText": "Added",
        }],
        workspace_context=context,
        permission_scope="workspace-chatbot-agent",
        canvas_node_context=canvas_context,
    )

    assert validated[0]["nodeId"] == "text-1"
    assert validated[0]["editMode"] == "append"
    assert "mode" not in validated[0]
    assert "selection" not in validated[0]
    assert validated[0]["baseNodeRevision"] == 3
    assert validated[0]["templateDigest"] != "sha256:forged"
    assert validated[0]["baseContentDigest"] != "sha256:forged"


def test_explicit_canvas_rewrite_selection_preserves_the_requested_range():
    context = {"snapshot": {"nodes": [{
        "id": "text-1", "kind": "text", "revision": 3,
        "presetText": "Template", "userText": "cold blue light",
    }]}}
    canvas_context = {
        "mode": "rewrite", "targetNodeId": "text-1", "referenceNodeIds": [], "mentions": [],
        "selection": {
            "start": 0,
            "end": 4,
            "selectedText": "cold",
            "baseContentDigest": "sha256:" + hashlib.sha256(b"cold blue light").hexdigest(),
        },
    }

    validated = validate_agent_proposals(
        [{"kind": "free_canvas_text_update", "id": "rewrite", "nodeId": "text-1", "userText": "warm"}],
        workspace_context=context,
        permission_scope="workspace-chatbot-agent",
        canvas_node_context=canvas_context,
    )

    assert validated[0]["editMode"] == "rewrite_selection"
    assert validated[0]["selection"] == {"start": 0, "end": 4, "selectedText": "cold"}


def test_explicit_canvas_context_without_target_rejects_all_canvas_mutations():
    validated = validate_agent_proposals(
        [{"kind": "free_canvas_text_create", "id": "create", "userText": "New"}],
        workspace_context={"snapshot": {"nodes": []}},
        permission_scope="workspace-chatbot-agent",
        canvas_node_context={"mode": "complete", "targetNodeId": None, "referenceNodeIds": [], "mentions": []},
    )

    assert validated == []


def test_canvas_context_requires_the_request_project_snapshot():
    body = PromptCardRuntimeMessageRequest.model_validate({
        "content": "Complete it",
        "projectId": "project-1",
        "workspaceContext": {
            "projectId": "project-2",
            "snapshot": {"nodes": [{"id": "text-1", "kind": "text"}]},
        },
        "canvasNodeContext": {
            "mode": "complete", "targetNodeId": "text-1",
            "referenceNodeIds": [], "mentions": [],
        },
    })

    with pytest.raises(HTTPException) as error:
        _resolve_canvas_node_context(body)

    assert error.value.status_code == 409
    assert error.value.detail == "canvas_node_context_project_mismatch"


@pytest.mark.parametrize("reference_ids", ["text-2", ["text-2"] * 11])
def test_canvas_context_rejects_invalid_reference_collections(reference_ids):
    body = PromptCardRuntimeMessageRequest.model_validate({
        "content": "Complete it", "projectId": "project-1",
        "workspaceContext": {
            "projectId": "project-1",
            "snapshot": {"nodes": [
                {"id": "text-1", "kind": "text"},
                {"id": "text-2", "kind": "text"},
            ]},
        },
        "canvasNodeContext": {
            "mode": "complete", "targetNodeId": "text-1",
            "referenceNodeIds": reference_ids, "mentions": [],
        },
    })

    with pytest.raises(HTTPException) as error:
        _resolve_canvas_node_context(body)

    assert error.value.status_code == 422
    assert error.value.detail == "canvas_node_context_nodes_invalid"


def test_canvas_context_uses_snapshot_names_and_rejects_unattached_mentions():
    body = PromptCardRuntimeMessageRequest.model_validate({
        "content": "Use @Reference", "projectId": "project-1",
        "workspaceContext": {
            "projectId": "project-1",
            "snapshot": {"nodes": [
                {"id": "text-1", "kind": "text", "title": "Target"},
                {"id": "text-2", "kind": "text", "title": "Reference"},
                {"id": "text-3", "kind": "text", "title": "Not attached"},
            ]},
        },
        "canvasNodeContext": {
            "mode": "complete", "targetNodeId": "text-1",
            "referenceNodeIds": ["text-2"],
            "mentions": [{"nodeId": "text-2", "label": "Spoofed"}],
        },
    })

    resolved = _resolve_canvas_node_context(body)

    assert resolved["mentions"] == [{"nodeId": "text-2", "label": "Reference"}]
    assert resolved["target"] == {"nodeId": "text-1", "name": "Target"}
    assert resolved["references"] == [{"nodeId": "text-2", "name": "Reference"}]

    body.canvas_node_context["mentions"] = [{"nodeId": "text-3", "label": "Not attached"}]
    with pytest.raises(HTTPException) as error:
        _resolve_canvas_node_context(body)
    assert error.value.detail == "canvas_node_context_mentions_invalid"


def test_canvas_selection_requires_exact_text_and_content_digest():
    text = "cold blue light"
    body = PromptCardRuntimeMessageRequest.model_validate({
        "content": "Rewrite it", "projectId": "project-1",
        "workspaceContext": {
            "projectId": "project-1",
            "snapshot": {"nodes": [{
                "id": "text-1", "kind": "text", "userText": text,
            }]},
        },
        "canvasNodeContext": {
            "mode": "rewrite", "targetNodeId": "text-1",
            "referenceNodeIds": [], "mentions": [],
            "selection": {
                "start": 0, "end": 4, "selectedText": "cold",
                "baseContentDigest": "sha256:stale",
            },
        },
    })

    with pytest.raises(HTTPException) as error:
        _resolve_canvas_node_context(body)

    assert error.value.status_code == 409
    assert error.value.detail == "canvas_node_context_selection_stale"


def test_canvas_selection_uses_browser_utf16_offsets():
    text = "🙂cold light"
    body = PromptCardRuntimeMessageRequest.model_validate({
        "content": "Rewrite it", "projectId": "project-1",
        "workspaceContext": {
            "projectId": "project-1",
            "snapshot": {"nodes": [{
                "id": "text-1", "kind": "text", "userText": text,
            }]},
        },
        "canvasNodeContext": {
            "mode": "rewrite", "targetNodeId": "text-1",
            "referenceNodeIds": [], "mentions": [],
            "selection": {
                "start": 2, "end": 6, "selectedText": "cold",
                "baseContentDigest": "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest(),
            },
        },
    })

    resolved = _resolve_canvas_node_context(body)

    assert resolved["selection"]["selectedText"] == "cold"


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
            "conversationId": "conversation-1",
            "requestId": "request-1",
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
    assert response.json()["conversationId"] == "conversation-1"
    assert response.json()["requestId"] == "request-1"
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


@pytest.mark.anyio
async def test_persistent_message_loads_history_skills_and_saves_turn(monkeypatch):
    calls = []

    async def fake_storage(method, path, **kwargs):
        calls.append((method, path, kwargs))
        if method == "GET" and path == "/api/agent-conversations/conversation-1":
            return {
                "id": "conversation-1", "projectId": "project-1",
                "entrypoint": "workspace-chatbot-agent", "mode": "free-canvas",
                "messages": [
                    {"role": "user", "text": "Earlier question"},
                    {"role": "assistant", "text": "Earlier answer"},
                ],
            }
        if method == "GET" and path == "/api/skills":
            return {"skills": [{
                "id": "SKL-canvas-prompt-editor", "slug": "canvas-prompt-editor",
                "source": "builtin", "capabilityId": "canvas.prompt.edit",
                "toolDependencies": ["emit_canvas_text_update"], "revision": 1,
            }]}
        if method == "GET" and path == "/api/skills/SKL-canvas-prompt-editor":
            return {
                "id": "SKL-canvas-prompt-editor", "currentRevision": 1,
                "revisions": [{"revision": 1, "digest": "sha256:canvas", "instructions": "Protect templates.", "references": []}],
            }
        if method == "POST" and path.endswith("/turns"):
            return kwargs["json"]
        raise AssertionError((method, path, kwargs))

    async def fake_invoke(payload):
        assert [message["content"][0]["text"] for message in payload["history"]] == ["Earlier question", "Earlier answer"]
        assert payload["skillSnapshots"][0]["skillId"] == "SKL-canvas-prompt-editor"
        return {"threadId": "thread-1", "text": "New answer", "proposals": [], "diagnostics": {}}

    monkeypatch.setattr("app.gateway.promptcard_runtime._storage_request", fake_storage)
    monkeypatch.setattr("app.gateway.promptcard_runtime._invoke_text_agent", fake_invoke)
    body = PromptCardRuntimeMessageRequest.model_validate({
        "conversationId": "conversation-1", "requestId": "request-1",
        "content": "New question", "projectId": "project-1", "mode": "free-canvas",
        "workspaceContext": {"projectId": "project-1", "snapshot": {
            "selectedNodeId": "text-1",
            "selectedNode": {
                "id": "text-1", "kind": "text", "revision": 3,
                "title": "Target", "presetText": "Template", "userText": "User",
            },
            "nodes": [
                {
                    "id": "text-1", "kind": "text", "revision": 3,
                    "title": "Target", "presetText": "Template", "userText": "User",
                },
                {"id": "text-2", "kind": "text", "title": "Reference"},
            ],
        }},
        "canvasNodeContext": {
            "mode": "complete", "targetNodeId": "text-1",
            "referenceNodeIds": ["text-2"],
            "mentions": [{"nodeId": "text-2", "label": "Reference"}],
        },
    })

    result = await promptcard_runtime.runtime_service.send_message(body, None)

    assert result["conversationId"] == "conversation-1"
    saved = next(call for call in calls if call[0] == "POST" and call[1].endswith("/turns"))
    assert saved[2]["json"]["requestId"] == "request-1"
    assert saved[2]["json"]["skillSnapshots"][0]["digest"] == "sha256:canvas"
    assert saved[2]["json"]["userMessage"]["canvasNodeContext"] == {
        "mode": "complete",
        "target": {"nodeId": "text-1", "name": "Target"},
        "references": [{"nodeId": "text-2", "name": "Reference"}],
        "mentions": [{"nodeId": "text-2", "label": "Reference"}],
    }
    assert "targetNode" not in saved[2]["json"]["userMessage"]["canvasNodeContext"]


@pytest.mark.anyio
async def test_persistent_message_rejects_conversation_entrypoint_mismatch(monkeypatch):
    async def fake_storage(method, path, **kwargs):
        assert method == "GET"
        return {
            "id": "conversation-1", "projectId": "project-1",
            "entrypoint": "prompt-library-agent", "mode": "free-canvas",
            "messages": [],
        }

    monkeypatch.setattr("app.gateway.promptcard_runtime._storage_request", fake_storage)
    body = PromptCardRuntimeMessageRequest.model_validate({
        "conversationId": "conversation-1", "requestId": "request-1",
        "content": "New question", "projectId": "project-1", "mode": "free-canvas",
        "permissionScope": "workspace-chatbot-agent",
    })

    with pytest.raises(HTTPException) as error:
        await promptcard_runtime.runtime_service.send_message(body, None)

    assert error.value.status_code == 409
    assert error.value.detail == "agent_conversation_entrypoint_mismatch"


@pytest.mark.anyio
async def test_persistent_message_rejects_skill_with_disallowed_tool_dependency(monkeypatch):
    async def fake_storage(method, path, **kwargs):
        if path == "/api/agent-conversations/conversation-1":
            return {
                "id": "conversation-1", "projectId": "project-1",
                "entrypoint": "workspace-chatbot-agent", "mode": "free-canvas",
                "messages": [],
            }
        if path == "/api/skills":
            return {"skills": [{
                "id": "SKL-external", "source": "external",
                "toolDependencies": ["delete_project"],
            }]}
        raise AssertionError((method, path, kwargs))

    monkeypatch.setattr("app.gateway.promptcard_runtime._storage_request", fake_storage)
    body = PromptCardRuntimeMessageRequest.model_validate({
        "conversationId": "conversation-1", "requestId": "request-1",
        "content": "Use this Skill", "projectId": "project-1", "mode": "free-canvas",
        "permissionScope": "workspace-chatbot-agent", "selectedSkillIds": ["SKL-external"],
    })

    with pytest.raises(HTTPException) as error:
        await promptcard_runtime.runtime_service.send_message(body, None)

    assert error.value.status_code == 403
    assert error.value.detail == "skill_tool_dependency_not_allowed"
