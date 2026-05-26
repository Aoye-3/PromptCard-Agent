# Agent Runtime Backend

## Overview

The Agent Runtime is a Python service under `agent-runtime/`. It is DeerFlow-derived, but PromptCard-Manager integrates through a PromptCard-owned API boundary.

Frontend code should call `/agent-api/promptcard/runtime/*` through Vite proxying, not DeerFlow-native thread/run/auth routes directly.

## Main Modules

- `app/gateway/app.py`: FastAPI app composition and router mounting
- `app/gateway/routers/promptcard_runtime.py`: PromptCard HTTP boundary
- `app/gateway/promptcard_runtime.py`: prompt construction, DeerFlow orchestration, text extraction, proposal parsing, and workspace-id validation
- `packages/harness/deerflow/tools/promptcard_library.py`: PromptCard tools exposed to the model for reading and proposing Prompt Library/project changes

## Runtime Flow

1. Frontend posts a message to `/agent-api/promptcard/runtime/messages`.
2. Vite proxies to `127.0.0.1:8001/api/promptcard/runtime/messages`.
3. The PromptCard adapter creates or reuses a DeerFlow thread.
4. The adapter builds the PMAgent prompt with workspace context and a bounded Prompt Library snapshot.
5. DeerFlow runs `lead_agent` with the configured model.
6. The adapter extracts assistant text and normalizes safe PromptCard proposals.
7. The frontend receives text plus proposals and applies UI rules.

## Auth, CSRF, Skills, and Tools

Runtime auth and CSRF concerns stay behind the PromptCard boundary. Frontend PromptCard code should consume the status/auth information exposed by the runtime store instead of coupling to raw DeerFlow auth internals.

Skills and tools are configured by the runtime and summarized in the Agent Dashboard. Tool results may propose Prompt Library writes, but durable Prompt Library changes still require the frontend approval flow.

## Startup

Use these commands from the repository root:

```powershell
npm.cmd run agent:dev
npm.cmd run dev:with-agent
npm.cmd run agent:check
```

`dev:with-agent` treats storage and Agent Runtime as idempotent background services. If health checks pass, existing services are reused.

Logs:

- `logs/storage-service.log`
- `logs/storage-service.err.log`
- `logs/agent-runtime.log`
- `logs/agent-runtime.err.log`

## Configuration and Runtime State

`agent-runtime/config.yaml` configures the local model, tool surface, skills path, SQLite runtime state, and enabled DeerFlow features. Secrets are read by scripts and exported as environment variables; never commit keys or copy them into docs.

Agent Runtime SQLite state is separate from frontend project storage and Prompt Library storage.

## Compatibility

The DeerFlow-native Gateway API remains available for runtime internals and compatibility. PromptCard frontend features should use the PromptCard runtime boundary.
