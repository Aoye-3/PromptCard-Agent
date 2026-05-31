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

### `GET /agent-api/promptcard/runtime/model-config`

Returns the unified DeepSeek model configuration used by the Agent Runtime. The API key is never returned in clear text:

```json
{
  "enabled": true,
  "apiBase": "https://api.deepseek.com",
  "apiKeyConfigured": true,
  "apiKeyPreview": "sk-...abcd",
  "modelName": "deepseek-chat",
  "temperature": 0.7,
  "maxTokens": 4096,
  "availableModels": [
    "deepseek-chat",
    "deepseek-reasoner"
  ]
}
```

### `PUT /agent-api/promptcard/runtime/model-config`

Saves the local DeepSeek model configuration and updates the active runtime model settings.

Request:

```json
{
  "enabled": true,
  "apiBase": "https://api.deepseek.com",
  "apiKey": "sk-...",
  "modelName": "deepseek-chat",
  "temperature": 0.7,
  "maxTokens": 4096
}
```

Fields may be omitted for partial updates. Omitting `apiKey` keeps the existing key. Sending an empty `apiKey` clears it. The response uses the same masked shape as `GET`.

### `POST /agent-api/promptcard/runtime/model-config/test`

Tests the current or supplied DeepSeek configuration from the backend. Browsers must not call DeepSeek directly.

Request:

```json
{
  "apiBase": "https://api.deepseek.com",
  "apiKey": "optional-test-key",
  "modelName": "deepseek-chat"
}
```

Response:

```json
{
  "success": true,
  "message": "DeepSeek connection ok."
}
```

Failures return `success: false` and a short diagnostic without exposing the API key.

### `POST /agent-api/promptcard/runtime/messages`

Request:

```json
{
  "threadId": "optional-existing-thread",
  "content": "User message",
  "mode": "card-workspace",
  "permissionScope": "workspace-chatbot-agent",
  "sessionKey": "workspace:card:project",
  "projectId": "project",
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

Supported workspace modes are `prompt-library`, `card-workspace`, `storyboard-workspace`, and `three-stage-workspace`. Card, storyboard, and three-stage Chatbox surfaces should use the `workspace-chatbot-agent` permission scope. Prompt Library Agent surfaces should use `prompt-library-agent`.

New PromptCard UI calls must include `sessionKey`. The backend stores `sessionKey`, `projectId`, `mode`, and `permissionScope` in DeerFlow thread metadata when creating a thread and rejects later attempts to reuse that thread from a different session or project.

The backend owns thread creation, prompt construction, configured DeepSeek model selection, DeerFlow run execution, assistant text extraction, and proposal parsing.

## Compatibility Routes

DeerFlow-native routes such as `/agent-api/threads`, `/agent-api/models`, `/agent-api/tools`, `/agent-api/skills`, `/agent-api/agents`, and `/agent-api/v1/auth/*` remain available for compatibility and internal adapter use. PromptCard frontend features should prefer the boundary routes above.
