# Development and Operations

## Local Commands

Use these commands from the project root:

```powershell
npm.cmd run dev
npm.cmd run dev:with-agent
npm.cmd run storage:dev
npm.cmd run agent:dev
npm.cmd run agent:check
npm.cmd run build
npm.cmd run test -- --run
```

Command purposes:

- `dev`: start the Vite frontend on port 3000 with strict port behavior.
- `dev:with-agent`: start or reuse the storage service, Agent Runtime, and Vite frontend.
- `storage:dev`: start only the local storage service on `127.0.0.1:8002`.
- `agent:dev`: start only the Agent Runtime.
- `agent:check`: validate Agent Runtime config loading.
- `startup:test`: start from `start.bat` and verify the full local startup flow.
- `build`: run TypeScript and production Vite build.
- `test -- --run`: run Vitest once.

## Development Server Control

The settings panel under the `Me` screen includes a local **Close development server** action. It calls:

```text
POST /__promptcard/dev-server/shutdown
```

This endpoint is implemented by Vite middleware and exists only while the Vite dev server is running. It sends a successful response and then closes the server process.

## Dev File Endpoints

Vite dev middleware also exposes:

- `GET/PUT /__promptcard/presets`
- `GET/PUT /__promptcard/projects`

These endpoints write JSON files under `data/` and are compatibility-only local development helpers. Durable frontend storage should use the storage service through `/storage-api`.

## Runtime Process Health

`npm.cmd run dev:with-agent` checks service health before starting background processes:

- storage: `http://127.0.0.1:8002/health`
- Agent Runtime: `http://127.0.0.1:8001/health`
- frontend: `http://127.0.0.1:3000/`

If storage or Agent Runtime is already healthy, the script reuses it instead of starting another hidden process. If the Vite frontend is already healthy, the script exits successfully instead of trying to start a second strict-port Vite process. If a background service must be started, logs are written under `logs/`:

- `logs/storage-service.log`
- `logs/storage-service.err.log`
- `logs/agent-runtime.log`
- `logs/agent-runtime.err.log`

The `*.err.log` files contain process stderr, not only fatal errors. Uvicorn and Python warnings may appear there during a healthy startup, so the health endpoints above are the source of truth for local startup success.

The frontend uses `vite --strictPort`; port 3000 conflicts still fail loudly when the existing listener is not the healthy local frontend.

### Blank Browser After Startup

A blank browser at `http://localhost:3000/` with successful health checks usually means the HTML shell loaded but the React bundle did not render. Inspect the current Vite transform errors:

```powershell
Get-Content logs\dev-server.err.log -Tail 120
```

Recent root cause seen locally: `src/components/ThreeStageBuilder.tsx` had an unterminated string constant, so Vite served the page shell but could not transform the application module. Confirm the source is currently valid with:

```powershell
npm.cmd run build
```

If the build passes and health checks pass, close the old browser tab or stop the existing port 3000 listener before rerunning `npm.cmd run dev:with-agent`; the startup script reuses an already healthy frontend listener.

### Full Startup Test

Run this when changing startup scripts or investigating a blank local app:

```powershell
npm.cmd run startup:test
```

The test starts from `start.bat`, skips the interactive pause through `PROMPTCARD_START_SKIP_PAUSE=1`, and verifies:

- storage service health: `http://127.0.0.1:8002/health`
- Agent Runtime health: `http://127.0.0.1:8001/health`
- Vite frontend health: `http://127.0.0.1:3000/`
- frontend HTML includes the Vite React entry module
- browser render check shows the project screen without console errors

If Playwright cannot launch in the current environment, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-start-from-bat.ps1 -SkipBrowserCheck
```

## Runtime Hygiene

Keep generated runtime dependencies and caches out of the repository. The Agent scripts are configured to avoid recreating heavy Python environments inside `agent-runtime/`:

- Python virtual environment: `%LOCALAPPDATA%\PromptCardAgentRuntime\.venv`
- uv cache: system temp under `promptcard-agent-uv-cache`
- DeepSeek key source resolution order:
  1. `PROMPTCARD_AGENT_API_KEY_FILE`
  2. `F:\.Agent-PromptCardManager\API-Key.txt`
  3. `F:\.FinalProject\API-Key.txt`

Never commit API keys, local runtime caches, virtual environments, or generated DeerFlow data.

## Troubleshooting

### Port 3000 Is Already In Use

Find the listener:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

Stop only the known development server process, then restart `npm.cmd run dev`. Because Vite uses strict port mode, this conflict must be fixed before the frontend can start.

When running `npm.cmd run dev:with-agent`, a healthy existing frontend at `http://127.0.0.1:3000/` is reused and the command exits successfully. Investigate the listener only when the frontend URL does not return a successful response.

### Agent Backend Disconnected

Run:

```powershell
npm.cmd run agent:check
```

Then start or reuse the runtime:

```powershell
npm.cmd run agent:dev
```

Check that one supported key source exists and contains a usable DeepSeek-style key. Prefer setting `PROMPTCARD_AGENT_API_KEY_FILE` when running outside the default local workspace. Do not print the key.

For the PromptCard boundary API, check:

```powershell
curl.exe --http1.0 http://localhost:3000/agent-api/promptcard/runtime/status
```

If the raw Agent process starts but this endpoint fails, inspect `logs/agent-runtime.err.log` first.

### Agent Check Fails Before Runtime Loads

If `npm.cmd run agent:check` fails with a missing key message, verify the key path resolution order above. A successful config check prints model/tool configuration only, not the secret.

### Missing Playwright Browser

Browser verification may fail if Playwright browsers are not installed. Install them only when needed for browser testing:

```powershell
npx.cmd playwright install
```

### CSS Minify Warning

The build may report a CSS warning around slash-containing generated width classes such as `.w-2/3`. This warning should be tracked separately from documentation work unless it blocks a release.

### Agent Runtime Became Too Large

Check for repo-local virtual environments or caches under `agent-runtime/`. The intended lightweight state keeps virtual environments and uv caches outside the repository.

## Roadmap / Not Yet Implemented

- There is no production operations runbook for hosting the Agent Runtime.
- There is no automated cleanup command for all generated local runtime state.
