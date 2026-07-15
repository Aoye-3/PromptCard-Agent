from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.promptcard_runtime import build_runtime_prompt, parse_agent_workspace_proposals
from app.gateway.routers import promptcard_runtime


def test_parse_agent_workspace_proposals_filters_unknown_card_ids():
    text = """
```json
{
  "kind": "agent_workspace_proposals",
  "proposals": [
    {
      "kind": "workspace_card_update",
      "id": "keep",
      "agentName": "DeepSeek Agent",
      "updates": [{"cardId": "card-1", "content": "Updated"}],
      "rationale": "ok",
      "status": "pending",
      "createdAt": 1
    },
    {
      "kind": "workspace_card_update",
      "id": "drop",
      "agentName": "DeepSeek Agent",
      "updates": [{"cardId": "missing-card", "content": "Nope"}],
      "rationale": "bad",
      "status": "pending",
      "createdAt": 2
    }
  ]
}
```
"""
    workspace_context = {
        "snapshot": {
            "cards": [{"id": "card-1", "type": "subject", "content": ""}],
        }
    }

    proposals = parse_agent_workspace_proposals(text, workspace_context=workspace_context)

    assert [proposal["id"] for proposal in proposals] == ["keep"]
    assert proposals[0]["updates"] == [{"cardId": "card-1", "content": "Updated"}]


def test_workspace_permission_scope_rejects_prompt_library_write_proposals():
    text = """
```json
{
  "kind": "prompt_library_write_proposal",
  "proposal": {
    "id": "library-write",
    "agentName": "DeepSeek Agent",
    "operation": "create",
    "targetPresetId": null,
    "presetDraft": {
      "type": "style",
      "category": "agent",
      "label": "Library only",
      "content": "Must not be executable from workspace chat"
    },
    "rationale": "wrong scope",
    "status": "pending",
    "createdAt": 1
  }
}
```
"""

    proposals = parse_agent_workspace_proposals(
        text,
        permission_scope="workspace-chatbot-agent",
    )

    assert proposals == []


def test_prompt_library_permission_scope_allows_prompt_library_write_proposals():
    text = """
```json
{
  "kind": "prompt_library_write_proposal",
  "proposal": {
    "id": "library-write",
    "agentName": "DeepSeek Agent",
    "operation": "create",
    "targetPresetId": null,
    "presetDraft": {
      "type": "style",
      "category": "agent",
      "label": "Library only",
      "content": "Prompt Library owns this write"
    },
    "rationale": "right scope",
    "status": "pending",
    "createdAt": 1
  }
}
```
"""

    proposals = parse_agent_workspace_proposals(
        text,
        permission_scope="prompt-library-agent",
    )

    assert [proposal["id"] for proposal in proposals] == ["library-write"]


def test_prompt_library_permission_scope_rejects_update_and_archive_proposals():
    text = """
```json
{
  "kind": "agent_workspace_proposals",
  "proposals": [
    {
      "kind": "prompt_library_write_proposal",
      "id": "create",
      "agentName": "DeepSeek Agent",
      "operation": "create",
      "targetPresetId": null,
      "presetDraft": {
        "type": "style",
        "category": "agent",
        "label": "Create",
        "content": "Allowed"
      },
      "rationale": "additive",
      "status": "pending",
      "createdAt": 1
    },
    {
      "kind": "prompt_library_write_proposal",
      "id": "update",
      "agentName": "DeepSeek Agent",
      "operation": "update",
      "targetPresetId": "preset-1",
      "presetDraft": {
        "type": "style",
        "category": "agent",
        "label": "Update",
        "content": "Rejected"
      },
      "rationale": "not allowed",
      "status": "pending",
      "createdAt": 2
    },
    {
      "kind": "prompt_library_write_proposal",
      "id": "archive",
      "agentName": "DeepSeek Agent",
      "operation": "archive",
      "targetPresetId": "preset-2",
      "presetDraft": {
        "type": "style",
        "category": "agent",
        "label": "Archive",
        "content": "Rejected"
      },
      "rationale": "not allowed",
      "status": "pending",
      "createdAt": 3
    }
  ]
}
```
"""

    proposals = parse_agent_workspace_proposals(
        text,
        permission_scope="prompt-library-agent",
    )

    assert [proposal["id"] for proposal in proposals] == ["create"]


def test_workspace_runtime_prompt_documents_prompt_library_write_boundary(monkeypatch):
    monkeypatch.setattr("app.gateway.promptcard_runtime._load_presets", lambda: [])

    prompt = build_runtime_prompt(
        "improve current card",
        workspace_context={"contextId": "card:project:0", "snapshot": {"cards": []}},
        permission_scope="workspace-chatbot-agent",
    )

    assert "Prompt Library writes are forbidden in this workspace chatbot scope" in prompt
    assert "prompt_library_write_proposal" in prompt


def test_prompt_library_runtime_prompt_allows_library_write_proposals(monkeypatch):
    monkeypatch.setattr("app.gateway.promptcard_runtime._load_presets", lambda: [])

    prompt = build_runtime_prompt(
        "split these prompts into presets",
        permission_scope="prompt-library-agent",
    )

    assert "Prompt Library scope" in prompt
    assert "Only create new Prompt Library presets" in prompt
    assert "prompt_library_write_proposal" in prompt


def test_messages_endpoint_uses_promptcard_runtime_service(monkeypatch):
    async def fake_send_message(body, request):
        assert body.thread_id is None
        assert body.content == "补全选中卡片"
        assert body.mode == "card-workspace"
        assert body.session_key == "workspace:card:project-1"
        assert body.project_id == "project-1"
        assert body.workspace_context["contextId"] == "card:project-1:0"
        return {
            "threadId": "thread-1",
            "text": "agent response",
            "proposals": [],
            "diagnostics": {"runtime": "ok"},
        }

    monkeypatch.setattr(promptcard_runtime.runtime_service, "send_message", fake_send_message)
    app = FastAPI()
    app.include_router(promptcard_runtime.router)

    with TestClient(app) as client:
        response = client.post(
            "/api/promptcard/runtime/messages",
            json={
                "content": "补全选中卡片",
                "mode": "card-workspace",
                "sessionKey": "workspace:card:project-1",
                "projectId": "project-1",
                "workspaceContext": {
                    "contextId": "card:project-1:0",
                    "mode": "card-workspace",
                    "projectId": "project-1",
                    "projectTitle": "Project",
                    "snapshot": {"cards": [{"id": "card-1"}]},
                },
            },
        )

    assert response.status_code == 200
    assert response.json()["threadId"] == "thread-1"


def test_parse_three_stage_field_update_filters_unknown_fields():
    text = """
```json
{
  "kind": "agent_workspace_proposals",
  "proposals": [
    {
      "kind": "three_stage_field_update",
      "id": "keep",
      "agentName": "DeepSeek Agent",
      "stageKey": "characterBoard",
      "fieldId": "characterCore",
      "mode": "replace",
      "content": "Sharper character",
      "rationale": "ok",
      "status": "pending",
      "createdAt": 1
    },
    {
      "kind": "three_stage_field_update",
      "id": "drop",
      "agentName": "DeepSeek Agent",
      "stageKey": "characterBoard",
      "fieldId": "missingField",
      "mode": "replace",
      "content": "Nope",
      "rationale": "bad",
      "status": "pending",
      "createdAt": 2
    }
  ]
}
```
"""
    workspace_context = {
        "snapshot": {
            "selectedStage": "characterBoard",
            "selectedFieldId": "characterCore",
            "sections": {
                "characterBoard": {
                    "fields": {"characterCore": "Existing"}
                }
            },
        }
    }

    proposals = parse_agent_workspace_proposals(
        text,
        workspace_context=workspace_context,
        permission_scope="workspace-chatbot-agent",
    )

    assert [proposal["id"] for proposal in proposals] == ["keep"]
    assert proposals[0]["kind"] == "three_stage_field_update"
    assert proposals[0]["content"] == "Sharper character"


def test_status_endpoint_returns_promptcard_runtime_sections(monkeypatch):
    async def fake_status(request):
        return {
            "runtime": {"ok": True},
            "auth": {"ok": True},
            "models": {"ok": True, "count": 1},
            "tools": {"ok": True, "count": 2},
            "storage": {"ok": True},
        }

    monkeypatch.setattr(promptcard_runtime.runtime_service, "status", fake_status)
    app = FastAPI()
    app.include_router(promptcard_runtime.router)

    with TestClient(app) as client:
        response = client.get("/api/promptcard/runtime/status")

    assert response.status_code == 200
    assert response.json()["runtime"]["ok"] is True
    assert set(response.json()) == {"runtime", "auth", "models", "tools", "storage"}


def test_bootstrap_endpoint_delegates_to_promptcard_runtime_service(monkeypatch):
    async def fake_bootstrap(request, response):
        response.set_cookie("access_token", "test-token")
        return {"user": {"email": "admin@promptcard.dev"}, "expires_in": 3600}

    monkeypatch.setattr(promptcard_runtime.runtime_service, "bootstrap", fake_bootstrap)
    app = FastAPI()
    app.include_router(promptcard_runtime.router)

    with TestClient(app) as client:
        response = client.post("/api/promptcard/runtime/bootstrap", json={})

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "admin@promptcard.dev"
    assert "access_token" in response.headers["set-cookie"]
