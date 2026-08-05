# Agent Runtime Backend

The maintained Agent backend consists of two small local services.

## Python Gateway

Location: `agent-runtime/backend/app/gateway/`

Responsibilities:

- FastAPI browser boundary under `/api/promptcard/runtime/*`
- process-local browser session cookie and CSRF protection
- model catalog, connections, assignments, and OS-keyring credentials
- secure PI-native provider forwarding with Python-owned credentials
- SDK-backed text adapters, with Volcengine Ark as the first adapter
- Media Library image loading
- project conversation coordination through PromptCard Storage
- first-party capability binding, one-shot external Skill resolution, and tool-dependency validation
- existing image-generation routing and lifecycle
- internal authentication between local services

The app mounts only PromptCard Runtime, Model Management, and Image Generation routers. DeerFlow-native auth, thread, run, tool, skill, sandbox, channel, and memory routes have been removed.

## pi Text Runtime

Location: `text-agent-runtime/`

Responsibilities:

- pi agent loop using `@earendil-works/pi-agent-core`
- request-scoped normalized conversation history supplied by Gateway
- explicit, request-scoped Prompt Library snapshot search
- proposal-only tools for Canvas text, Prompt Library creation, and Media Prompt preview
- PI `createProvider`/`createModels` registration for PI-native and SDK-backed text families
- multimodal message forwarding through the selected text provider

The pi service does not hold model credentials and cannot write to Canvas, Storage, or the filesystem.

## Request Flow

1. The frontend posts to the Python Gateway.
2. The Gateway validates browser session and CSRF state.
3. For project chat, Gateway validates the conversation scope, loads bounded SQLite history, and resolves the feature plus one-shot Skill snapshots. Media chat instead forwards bounded temporary history from the current dialog.
4. The Gateway forwards normalized history, current context, allowed tools, and bounded Skill snapshots to pi with an internal token.
5. pi exposes Prompt Library search only for an explicit `prompt-library` request; other project chat receives an empty library and no search tool. It may otherwise emit one proposal allowed by the request policy.
6. Gateway resolves the persistent conversation's model binding against the current connection whitelist and readiness state. A previously unbound conversation adopts and persists `chat.primary` on first use. pi receives the non-secret, request-scoped descriptor and never resolves a browser-supplied arbitrary model ID.
7. PI-native calls use PI's API implementation through the secure Gateway proxy; SDK-backed calls dispatch through the Gateway text adapter registry.
8. The Gateway validates returned proposals again and persists the project turn, proposal status, tool summary, exact Skill revision/digest, and actual model snapshot. Media responses are not persisted.
9. The user explicitly applies or rejects each proposal.

## Prompt Library lookup boundary

Canvas Prompt Library lookup is a distinct, read-only request mode, not ambient Agent knowledge:

- Normal Agent discussion, `complete`, and `rewrite` requests neither inject nor search Prompt Library data.
- The frontend sends Prompt records only when `canvasNodeContext.mode` is `prompt-library`, with a hard maximum of 200 items. Each record may include its associated `meta.media` data.
- `buildInvocation` keeps at most the first 100 items and enables `search_prompt_library`; the search tool reads only that bounded request snapshot.
- The mode requires `targetNodeId: null`. Gateway grants no Canvas emit tool, the pi policy has no allowed Canvas proposal kind, and returned Canvas write proposals are discarded.
- The mode does not write Prompt Library data. The separate `prompt-library-agent` permission scope retains its existing proposal-only creation contract and must not be confused with Canvas read-only lookup.

The embedded Agent UI keeps conversation history in its own scroll container and renders user turns on the right and Agent turns on the left. Validation failures remain visible above the conversation area: the frontend recognizes Prompt Library item-limit errors and otherwise displays a whitespace-normalized, 240-character summary of the original Runtime error.

## Commands

```powershell
npm.cmd run agent:check
npm.cmd run agent:dev
npm.cmd run text-agent:dev
npm.cmd run dev:with-agent
```

`agent:dev` starts the Python Gateway. `text-agent:dev` starts only pi. `dev:with-agent` starts Storage, pi, Gateway, and the frontend with one shared internal token.

## Configuration

- `PROMPTCARD_RUNTIME_STATE_DIR`: model connection metadata root.
- `PROMPTCARD_TEXT_AGENT_URL`: Python Gateway to pi base URL.
- `PROMPTCARD_GATEWAY_INTERNAL_URL`: pi to Python internal runtime base.
- `PROMPTCARD_INTERNAL_TOKEN`: shared local-service token.
- `PROMPTCARD_STORAGE_HEALTH_URL`: Storage health endpoint.
- `PROMPTCARD_LIBRARY_FILE`: development Prompt Library compatibility snapshot.

Provider credentials are configured through Model Management and stored in the operating-system keyring.

## Provider extension points

- PI-native text provider: add provider/catalog metadata and select a PI API implementation in `text-agent-runtime/src/provider-runtime.ts`.
- SDK-backed text provider: add provider/catalog metadata and register a Python `TextProviderAdapter` under `app/gateway/text_generation/providers/`.
- Image provider: implement the image-generation provider interface only. Do not route image requests through either text extension point.

Provider connections are reusable account metadata. Assignments remain modality-specific as `chat.primary` and `image.primary`.

For Ark chat, one inference API Key may serve multiple release-catalog models. A connection's `agentChatModelIds` is the project-Agent whitelist; the Runtime catalog exposes only those models together with connection/provider identity, capability metadata, availability reason, and default status. The pinned Ark Runtime SDK invokes the explicit `modelId`; it does not provide account model discovery for the same inference credential.
