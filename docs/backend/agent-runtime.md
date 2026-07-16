# Agent Runtime Backend

The maintained Agent backend consists of two small local services.

## Python Gateway

Location: `agent-runtime/backend/app/gateway/`

Responsibilities:

- FastAPI browser boundary under `/api/promptcard/runtime/*`
- process-local browser session cookie and CSRF protection
- model catalog, connections, assignments, and OS-keyring credentials
- Volcengine Ark Python SDK calls
- Media Library image loading
- existing image-generation routing and lifecycle
- internal authentication between local services

The app mounts only PromptCard Runtime, Model Management, and Image Generation routers. DeerFlow-native auth, thread, run, tool, skill, sandbox, channel, and memory routes have been removed.

## pi Text Runtime

Location: `text-agent-runtime/`

Responsibilities:

- pi agent loop using `@earendil-works/pi-agent-core`
- short in-memory session history
- Prompt Library snapshot search
- proposal-only tools for Canvas text and Prompt Library creation
- multimodal message forwarding through the Gateway's Ark adapter

The pi service does not hold model credentials and cannot write to Canvas, Storage, or the filesystem.

## Request Flow

1. The frontend posts to the Python Gateway.
2. The Gateway validates browser session and CSRF state.
3. The Gateway forwards a bounded request to pi with an internal token.
4. pi decides whether to search the provided Prompt Library snapshot or emit one allowed proposal.
5. pi sends the model context back to the Gateway's internal Ark endpoint.
6. The Gateway resolves `chat.primary`, reads its keyring credential, and calls Ark.
7. The Gateway validates returned proposals again before returning them to the frontend.
8. The user explicitly applies or rejects each proposal.

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
- `PROMPTCARD_GATEWAY_INTERNAL_URL`: pi to Python internal Ark endpoint base.
- `PROMPTCARD_INTERNAL_TOKEN`: shared local-service token.
- `PROMPTCARD_TEXT_MODEL`: optional Ark chat model ID; defaults to `doubao-seed-2-0-lite-260215`.
- `PROMPTCARD_STORAGE_HEALTH_URL`: Storage health endpoint.
- `PROMPTCARD_LIBRARY_FILE`: development Prompt Library compatibility snapshot.

Provider credentials are configured through Model Management and stored in the operating-system keyring.
