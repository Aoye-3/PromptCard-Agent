# Agent Runtime API

The maintained frontend contract is the PromptCard Runtime Boundary. In development, Vite proxies:

```text
/agent-api/* -> ${PROMPTCARD_AGENT_URL}/api/*
```

## PromptCard Runtime Boundary

Authenticated browser mutations are protected by the Runtime CSRF middleware. The maintained frontend client sends the session cookie with `credentials: "include"`, reads the CSRF cookie, and copies it to `X-CSRF-Token`. Direct callers that omit or mismatch the token receive a structured rejection before model, keyring, Storage, or provider work begins.

### `GET /agent-api/promptcard/runtime/status`

Returns a compact health view for the Python Gateway, pi text Agent, Storage, and `chat.primary` assignment:

```json
{
  "runtime": { "ok": true, "service": "promptcard-runtime", "orchestrator": "pi" },
  "auth": { "ok": true, "mode": "local-process-token" },
  "models": { "ok": true, "count": 1 },
  "tools": { "ok": true, "count": 4 },
  "storage": { "ok": true },
  "textAgent": { "ok": true, "payload": { "service": "promptcard-pi-text-agent", "orchestrator": "pi" } }
}
```

### `POST /agent-api/promptcard/runtime/bootstrap`

Creates the process-local PromptCard browser session and sets the HttpOnly runtime cookie. There is no separate DeerFlow account or login flow.

### `GET /agent-api/promptcard/runtime/catalog`

Returns the focused text-Agent catalog. The current tool surface contains Prompt Library search plus proposal emitters; generic skills and subagents are disabled.

```json
{
  "models": [],
  "skills": [],
  "tools": [],
  "builtins": [],
  "subagentEnabled": false,
  "agents": [{ "id": "promptcard-text-agent", "name": "PromptCard Text Agent" }]
}
```

## Model Management

Model management separates provider definitions, model capabilities, named connections, and use-case assignments. The only maintained slots are `chat.primary` and `image.primary`. Connection credentials are written to the operating-system keyring and never returned by these APIs.

### `GET /agent-api/promptcard/runtime/model-catalog`

Returns provider definitions and model catalog entries. The current image entry is `doubao-seedream-5-0-pro-260628` with capability metadata for modes, reference count, regions, resolutions, ratios, custom-size limits, prompt optimization, official input constraints, raster annotations, output transports, output count, and streaming.

Provider definitions declare a modality-specific integration family. The initial text families are `PI 原生` and `方舟 SDK`; the initial image family is `方舟 SDK`:

```json
{
  "providers": [
    {
      "id": "deepseek",
      "displayName": "DeepSeek",
      "defaultApiBase": "https://api.deepseek.com",
      "integrationGroups": {
        "chat": { "id": "pi-native", "displayName": "PI 原生", "kind": "pi-native" }
      }
    }
  ],
  "models": [
    {
      "id": "deepseek-chat",
      "providerId": "deepseek",
      "displayName": "DeepSeek Chat",
      "modality": "chat",
      "integrationGroup": { "id": "pi-native", "displayName": "PI 原生", "kind": "pi-native" },
      "source": "provider-catalog",
      "assignable": true
    }
  ]
}
```

The frontend must filter by `modality` before grouping by `integrationGroup`. A connection may support both chat and image models, but `chat.primary` and `image.primary` remain independent assignments.

The catalog is the frontend source of truth for image controls. UI code must consume `modes`, `resolutions`, `aspectRatios`, `customSize`, `promptOptimization`, `inputConstraints`, `annotationInputs`, `outputFormats`, `responseTransports`, `watermark`, `maxReferenceImages`, `regionInputs`, `outputCount`, and `streaming` instead of branching on a Seedream model ID.

### `GET /agent-api/promptcard/runtime/image-generation-status`

Re-runs the read-only image-runtime diagnostics and returns no installation command, local path, credential, or provider response body:

```json
{
  "serverEnabled": true,
  "checkedAt": 1752572345678,
  "credentialStore": { "available": true },
  "providers": [
    {
      "providerId": "volcengine-ark",
      "status": "ready",
      "sdk": {
        "packageName": "volcengine-python-sdk",
        "installedVersion": "5.0.36",
        "requiredVersion": "5.0.36",
        "compatible": true,
        "error": null
      }
    }
  ]
}
```

Provider status is `ready`, `missing`, `incompatible`, or `check_failed`. Calling the same GET endpoint again is the supported re-detection operation; the Runtime does not expose dependency installation or command execution.

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

Deletes unused connection metadata and its keyring credential. Before offering deletion, clients must query the dependency endpoint below. Unknown canvas dependency counts fail closed: the UI must not treat an unavailable count as zero.

### `POST /agent-api/promptcard/runtime/model-connections/{id}/test`

Tests the stored credential from Agent Runtime and records `lastTest`. The response is `{ "success": true|false, "message": "..." }`; raw provider or credential errors are not returned.

Changing provider, API base, credential, or enabled state clears the persisted successful test. A recorded test has no time-to-live; it remains valid until one of those material fields changes or a later test replaces it.

Provider probes are registered per provider. DeepSeek currently probes `/models`; Volcengine Ark uses its registered `/ping` connectivity probe. The test route does not assume every provider implements a model-list endpoint.

### `GET /agent-api/promptcard/runtime/model-connections/{id}/models`

Returns assignable catalog entries scoped to the connection's provider:

```json
{
  "connectionId": "uuid",
  "providerId": "volcengine-ark",
  "models": [
    {
      "id": "doubao-seed-2-0-lite-260215",
      "providerId": "volcengine-ark",
      "displayName": "Doubao Seed 2.0 Lite",
      "modality": "chat",
      "integrationGroup": { "id": "volcengine-ark-sdk", "displayName": "方舟 SDK", "kind": "sdk" },
      "source": "provider-catalog",
      "assignable": true
    }
  ]
}
```

`source: "provider-catalog"` means the maintained PromptCard support catalog, not private account endpoint enumeration. The current connection stores an inference API Key. Ark foundation-model and endpoint management APIs require a future, separately modeled AK/SK management credential.

### `GET /agent-api/promptcard/runtime/model-connections/{id}/dependencies`

Returns assignments and the number of persisted canvas-node references known to the Runtime:

```json
{
  "assignments": ["image.primary"],
  "canvasNodeCount": null,
  "canvasNodeCountAvailable": false
}
```

The current Gateway does not yet own a reliable Storage query for cross-project canvas references, so it reports `null/false` rather than a misleading zero. Connection deletion remains blocked in the model-management UI until that count is available and zero.

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

An assignment is accepted only when the connection is enabled, has a credential, matches the model provider and slot modality, has a latest successful connection test, and, for Ark image models, the required SDK is compatible.

### `DELETE /agent-api/promptcard/runtime/model-assignments/{slot}`

Clears the selected default slot and returns `204`. It does not delete the connection, credential, canvas nodes, history, or assets.

### Model-management error envelope

Model-management failures use a sanitized FastAPI `detail` object:

```json
{
  "detail": {
    "code": "connection_not_tested",
    "message": "The model connection must be tested before assignment.",
    "action": "test_connection",
    "retryable": false,
    "field": "connectionId"
  }
}
```

The browser client normalizes this to `{code, message, action, retryable, field?}` and maps it to safe Chinese copy. Neither layer exposes exception stacks, filesystem paths, shell commands, credentials, or raw provider bodies.

### Deprecated model-config compatibility routes

`GET/PUT /agent-api/promptcard/runtime/model-config` and `POST /agent-api/promptcard/runtime/model-config/test` remain only as legacy chat-configuration compatibility routes. New UI and integrations must use model connections and assignments. Compatibility writes still store credentials through keyring; they are not authorization for browser-local credential storage.

## Image Generation

### `POST /agent-api/promptcard/runtime/image-generations`

The frontend sends normalized intent and local asset IDs. The Runtime creates the run ID, localizes the provider result, and returns no provider URL:

```json
{
  "projectId": "project-1",
  "conversationId": "image-conversation-1",
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
    {
      "referenceId": "subject",
      "role": "source-image",
      "assetId": "provider-input.jpg",
      "sourceAssetId": "original-input.heic",
      "order": 0
    }
  ],
  "regions": [
    { "type": "bbox", "referenceId": "subject", "x1": 100, "y1": 120, "x2": 700, "y2": 800 }
  ],
  "resolution": "2K",
  "aspectRatio": "smart",
  "promptOptimization": "standard",
  "outputFormat": "png",
  "watermark": false
}
```

`conversationId` identifies a project-level Image Generation Agent conversation and does not require `nodeId`. Legacy node-bound callers may send `nodeId` instead; at least one identity is required. When a conversation already exists, Runtime verifies that it belongs to `projectId` before provider access and maps a mismatch to a sanitized not-found response. Runtime compiles only this request's prompt, inputs, regions, and settings; it never reads or appends earlier conversation runs.

For `aspectRatio: "custom"`, positive integer `width` and `height` are required and must satisfy 921600–4624220 total pixels and `1:16–16:1`. The total image count includes the source image and cannot exceed ten. At most one input may use `role: "source-image"`. `edit` and `region-edit` require a source image; `region-edit` also requires at least one point or bounding box.

`promptOptimization` is `standard` or `fast` and defaults to `standard`. The adapter sends the value through Ark `OptimizePromptOptions`. The backend may request provider output as URL or `b64_json`; this transport is not an ordinary UI parameter, and the successful Runtime response never contains either provider payload.

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

The project Image Generation tab is independent from the pi text Agent message route. It does not create a text-Agent session, call the chat model, or append previous image-generation turns to the provider prompt.

### `POST /agent-api/promptcard/runtime/messages`

Request:

```json
{
  "threadId": "optional-existing-thread",
  "content": "User message",
  "mode": "free-canvas",
  "permissionScope": "workspace-chatbot-agent",
  "sessionKey": "workspace:canvas:project",
  "projectId": "project",
  "workspaceContext": {
    "contextId": "canvas:project",
    "mode": "free-canvas",
    "projectId": "project",
    "projectTitle": "Project",
    "snapshot": {
      "selectedNodeId": "text-node-1",
      "selectedNode": {
        "id": "text-node-1",
        "kind": "text",
        "userText": "existing prompt"
      }
    }
  },
  "promptLibrary": []
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

Current proposal behavior:

- `workspace-chatbot-agent` with one selected text node may return only `free_canvas_text_update` for that exact node.
- `workspace-chatbot-agent` without a selected text node may return only `free_canvas_text_create`.
- `prompt-library-agent` may return only additive `prompt_library_write_proposal` records.
- All proposals remain pending until the frontend user selects Apply or Reject.

New PromptCard UI calls must include `sessionKey`. pi keeps bounded process-local message history and rejects an existing `threadId` when its `sessionKey`, `projectId`, or `mode` conflicts with the new request.

The Python Gateway validates the browser request and returned proposals. The pi runtime owns prompt orchestration, the PI provider collection, and proposal tools. At Agent construction time it resolves the non-secret `chat.primary` descriptor. PI-native models use PI's API implementation through the credential-injecting Gateway proxy; SDK-backed models use the Gateway text-SDK registry. Provider credentials never enter the Node process.

### `POST /agent-api/promptcard/runtime/media-analysis`

Request:

```json
{
  "threadId": "optional-existing-thread",
  "assetId": "selected-media-asset",
  "contentType": "image/png",
  "analysisType": "style",
  "content": ""
}
```

`analysisType` is `style`, `freeform`, or `prompt`. The Gateway loads exactly the requested asset from PromptCard Storage, accepts image content only, limits the asset to 30 MiB, and sends one image attachment through pi to the assigned multimodal text provider. The response has the same `threadId`, `text`, `proposals`, and `diagnostics` shape as `/messages`, but media analysis returns no mutation proposals.

Video analysis is not part of the current API behavior.

## Internal Routes

These routes are local-service-only, require `X-PromptCard-Internal-Token` at the route boundary, and are not browser integration contracts:

- `GET /api/promptcard/runtime/internal/text-model` returns the current `chat.primary` connection ID, provider ID, model descriptor, capabilities, and integration group. It returns neither `apiBase` nor a credential.
- `POST /api/promptcard/runtime/internal/pi-proxy/{connectionId}/chat/completions` is the PI-native OpenAI-compatible stream boundary. It accepts only the current PI-native assignment, exact `chat/completions` path, and exact assigned model ID; the Gateway replaces incoming authorization with the keyring credential.
- `POST /api/promptcard/runtime/internal/chat` is the SDK-backed text boundary. It accepts only an SDK integration group and dispatches through the registered `TextProviderAdapter`; Volcengine Ark is the first adapter.

A browser local-session cookie is insufficient for these routes.

## Removed Routes

DeerFlow-native thread, run, auth, model, tool, skill, agent, memory, channel, MCP, upload, and sandbox routes are removed. New integrations must use the PromptCard Runtime Boundary above.
