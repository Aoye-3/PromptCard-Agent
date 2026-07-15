# Agent Runtime API

The maintained frontend contract is the PromptCard Runtime Boundary. In development, Vite proxies:

```text
/agent-api/* -> ${PROMPTCARD_AGENT_URL}/api/*
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

## Model Management

Model management separates provider definitions, model capabilities, named connections, and use-case assignments. The only maintained slots are `chat.primary` and `image.primary`. Connection credentials are written to the operating-system keyring and never returned by these APIs.

### `GET /agent-api/promptcard/runtime/model-catalog`

Returns provider definitions and model catalog entries. The current image entry is `doubao-seedream-5-0-pro-260628` with capability metadata for modes, reference count, regions, resolutions, ratios, custom-size limits, output count, and streaming.

### `GET /agent-api/promptcard/runtime/model-connections`

Returns `{ "connections": [...] }`. A connection response contains:

```json
{
  "id": "uuid",
  "providerId": "volcengine-ark",
  "displayName": "Seedream production",
  "apiBase": "https://ark.cn-beijing.volces.com/api/v3",
  "enabled": true,
  "credentialConfigured": true,
  "credentialMask": "<masked>",
  "createdAt": 1784000000000,
  "updatedAt": 1784000000000,
  "lastTest": {
    "ok": true,
    "checkedAt": 1784000001000,
    "message": "Connection ok."
  }
}
```

`credentialRef` is internal persisted metadata and is not returned. The credential value is never returned.

### `POST /agent-api/promptcard/runtime/model-connections`

Creates a connection and returns the masked response above:

```json
{
  "providerId": "volcengine-ark",
  "displayName": "Seedream production",
  "apiBase": "https://ark.cn-beijing.volces.com/api/v3",
  "enabled": true,
  "credential": "user-entered-secret"
}
```

The endpoint is exact-provider-endpoint only. It rejects alternate schemes, hosts, ports, query strings, fragments, and embedded credentials. If keyring storage is unavailable, creation fails; there is no plaintext fallback.

### `PUT /agent-api/promptcard/runtime/model-connections/{id}`

Replaces the mutable connection fields using the same request shape. Omitting `credential` preserves the current keyring value; an empty value removes it. An assigned connection cannot be disabled or moved to another provider.

### `DELETE /agent-api/promptcard/runtime/model-connections/{id}`

Deletes unassigned connection metadata and its keyring credential. Assigned connections return `409 connection_is_assigned` until their slot is changed.

### `POST /agent-api/promptcard/runtime/model-connections/{id}/test`

Tests the stored credential from Agent Runtime and records `lastTest`. The response is `{ "success": true|false, "message": "..." }`; raw provider or credential errors are not returned.

### `GET /agent-api/promptcard/runtime/model-assignments`

Returns `{ "assignments": [...] }` where each item contains `slot`, `connectionId`, and `modelId`.

### `PUT /agent-api/promptcard/runtime/model-assignments/{slot}`

Assigns a compatible enabled connection and model:

```json
{
  "connectionId": "uuid",
  "modelId": "doubao-seedream-5-0-pro-260628"
}
```

Provider and modality must match the selected slot.

### Deprecated model-config compatibility routes

`GET/PUT /agent-api/promptcard/runtime/model-config` and `POST /agent-api/promptcard/runtime/model-config/test` remain only as DeepSeek migration compatibility routes. New UI and integrations must use model connections and assignments. Compatibility writes still store credentials through keyring; they are not authorization for browser-local credential storage.

## Image Generation

### `POST /agent-api/promptcard/runtime/image-generations`

The frontend sends normalized intent and local asset IDs. The Runtime creates the run ID, localizes the provider result, and returns no provider URL:

```json
{
  "projectId": "project-1",
  "nodeId": "image-generator-1",
  "connectionId": "uuid",
  "modelId": "doubao-seedream-5-0-pro-260628",
  "mode": "region-edit",
  "promptDocument": {
    "version": 1,
    "segments": [
      { "type": "text", "text": "Replace the material on " },
      { "type": "reference", "referenceId": "subject", "label": "subject" }
    ]
  },
  "inputs": [
    { "referenceId": "subject", "assetId": "local-input.png", "order": 0 }
  ],
  "regions": [
    { "type": "bbox", "referenceId": "subject", "x1": 100, "y1": 120, "x2": 700, "y2": 800 }
  ],
  "resolution": "2K",
  "aspectRatio": "smart",
  "outputFormat": "png",
  "watermark": false
}
```

For `aspectRatio: "custom"`, positive integer `width` and `height` are required and must satisfy the selected model capability limits.

Success:

```json
{
  "runId": "image-run-generated-id",
  "state": "succeeded",
  "assetId": "generated-local-asset.png",
  "captureId": "generated-result-capture",
  "contentType": "image/png",
  "width": 2048,
  "height": 2048
}
```

New requests require `PROMPTCARD_IMAGE_GENERATION_NODE_V1=true`; otherwise the endpoint returns `403 image_generation_disabled` before creating a run or reading a credential. Validation/provider/storage failures use a sanitized `detail` object with `code`, `message`, `retryable`, and, after run creation, `runId`. Capacity and rate-limit errors return `429`; retryable infrastructure errors return `503`; other request/provider errors return `422`.

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
