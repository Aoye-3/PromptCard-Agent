# Agent Runtime API

The maintained frontend contract is the PromptCard Runtime Boundary. In development, Vite proxies:

```text
/agent-api/* -> http://127.0.0.1:8001/api/*
```

## PromptCard Runtime Boundary

### `GET /agent-api/promptcard/runtime/status`

Returns a compact health view for the embedded runtime:

```json
{
  "runtime": { "ok": true, "service": "promptcard-runtime-boundary" },
  "auth": { "ok": true, "adminCount": 1 },
  "models": { "ok": true, "count": 1 },
  "tools": { "ok": true, "count": 10 },
  "storage": { "ok": true, "payload": { "ok": true } }
}
```

### `POST /agent-api/promptcard/runtime/bootstrap`

Creates or reuses the app-managed PromptCard admin user and sets the runtime session cookie. This replaces frontend calls to DeerFlow auth internals.

### `GET /agent-api/promptcard/runtime/catalog`

Returns the PromptCard UI catalog:

```json
{
  "models": [],
  "skills": [],
  "tools": [],
  "builtins": [],
  "subagentEnabled": true,
  "agents": []
}
```

### `POST /agent-api/promptcard/runtime/messages`

Request:

```json
{
  "threadId": "optional-existing-thread",
  "content": "用户消息",
  "mode": "card-workspace",
  "workspaceContext": {
    "contextId": "card:project:0",
    "mode": "card-workspace",
    "projectId": "project",
    "projectTitle": "Project",
    "snapshot": {}
  }
}
```

Response:

```json
{
  "threadId": "runtime-thread-id",
  "text": "assistant text",
  "proposals": [],
  "diagnostics": { "proposalCount": 0 }
}
```

The backend owns thread creation, prompt construction, DeerFlow run execution, assistant text extraction, and proposal parsing.

## Compatibility Routes

DeerFlow-native routes such as `/agent-api/threads`, `/agent-api/models`, `/agent-api/tools`, `/agent-api/skills`, `/agent-api/agents`, and `/agent-api/v1/auth/*` remain available for compatibility and internal adapter use. PromptCard frontend features should prefer the boundary routes above.
