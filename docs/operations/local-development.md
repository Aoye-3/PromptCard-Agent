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
- `tauri:dev`: start the desktop dev shell; closing its window also stops the local PromptCard services it uses.
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

- `GET /__promptcard/presets`
- `GET /__promptcard/projects`

These endpoints are read-only legacy migration helpers. Their `PUT` forms return `410`; durable writes use `/storage-api`.

## Runtime Process Health

`npm.cmd run dev:with-agent` checks service health before starting background processes:

- storage: `http://127.0.0.1:8002/health`
- Agent Runtime: `http://127.0.0.1:8001/health`
- frontend: `http://127.0.0.1:3000/`

Storage reuse requires service version `2.0.0`, schema version `1`, SQLite capability, and the expected data directory. Frontend reuse also fetches the Vite entry module and rejects a server that exposes raw CommonJS React modules instead of optimized dependencies. An incompatible listener is stopped only when its command line or parent proves ownership by this repository; unknown port owners are never killed automatically.

The health endpoints above are the source of truth for local startup success. Historical `logs/*.log` files may exist from older runs, but the current hidden background startup path does not require redirected stdout/stderr logs.

When `%LOCALAPPDATA%\PromptCardAgentRuntime\.venv` already exists, the startup scripts run that environment's `python.exe` and `uvicorn.exe` directly. `uv run` remains the fallback for first-time environment creation.

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

When running `npm.cmd run dev:with-agent`, an existing frontend is reused only when both the HTML shell and transformed entry module pass validation. A broken project-owned Vite listener is replaced; an unknown port owner is reported and left untouched.

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

If the raw Agent process starts but this endpoint fails, run `npm.cmd run agent:check` and inspect the terminal output first.

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
