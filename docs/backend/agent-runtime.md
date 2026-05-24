# Agent Runtime Backend

The Agent Runtime is a Python service under `agent-runtime/`. It is DeerFlow-derived, but PromptCard-Manager integrates through a PromptCard-owned boundary.

## Main Modules

- `app/gateway/app.py`: FastAPI app composition and router mounting.
- `app/gateway/routers/promptcard_runtime.py`: HTTP boundary under `/api/promptcard/runtime/*`.
- `app/gateway/promptcard_runtime.py`: PromptCard adapter service, prompt construction, DeerFlow orchestration, text extraction, proposal parsing, and workspace-id validation.
- `app/gateway/routers/*`: DeerFlow-native routes retained for internal use and compatibility.
- `packages/harness/deerflow/tools/promptcard_library.py`: PromptCard tools exposed to the model for reading/proposing Prompt Library and project changes.

## Runtime Flow

1. Frontend posts a message to `/agent-api/promptcard/runtime/messages`.
2. Vite proxies to `127.0.0.1:8001/api/promptcard/runtime/messages`.
3. The PromptCard adapter creates or reuses a DeerFlow thread.
4. The adapter builds the PMAgent prompt with workspace context and a bounded Prompt Library snapshot.
5. DeerFlow runs `lead_agent` with `deepseek-chat`.
6. The adapter extracts assistant text and normalizes safe PromptCard proposals.
7. The frontend receives text plus proposals and applies UI rules.

## Startup

Use these commands from the repository root:

```powershell
npm.cmd run agent:dev
npm.cmd run dev:with-agent
npm.cmd run agent:check
```

`dev:with-agent` now treats storage and Agent Runtime as idempotent background services: if health checks pass, the existing service is reused. Logs are written to `logs/storage-service.log`, `logs/storage-service.err.log`, `logs/agent-runtime.log`, and `logs/agent-runtime.err.log`.

## Configuration

`agent-runtime/config.yaml` configures the local model, tool surface, skills path, SQLite runtime state, and enabled DeerFlow features. Secrets are read by scripts and exported as environment variables; never commit keys or copy them into docs.

## Compatibility

The DeerFlow-native Gateway API remains available. PromptCard frontend code should not couple to its thread/run/auth wire format directly; use `/api/promptcard/runtime/*` instead.
