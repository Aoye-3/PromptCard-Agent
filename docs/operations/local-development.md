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

- `dev`: start the Vite frontend. It reads `PROMPTCARD_FRONTEND_PORT` when set and otherwise defaults to port `3000`.
- `dev:with-agent`: allocate local ports, start or reuse the storage service, Agent Runtime, and Vite frontend, then write `logs/dev-runtime.json`.
- `tauri:dev`: start the desktop dev shell; closing its window also stops the local PromptCard services it uses.
- `storage:dev`: start only the local storage service. It reads `PROMPTCARD_STORAGE_HOST` and `PROMPTCARD_STORAGE_PORT`, defaulting to `127.0.0.1:8002`.
- `agent:dev`: start only the Agent Runtime. It reads `GATEWAY_HOST` and `GATEWAY_PORT`, defaulting to `127.0.0.1:8001`.
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

`npm.cmd run dev:with-agent` is the source of truth for full-stack local startup. It chooses ports on `127.0.0.1`, writes them to `logs/dev-runtime.json`, exports matching environment variables, and then checks service health before starting background processes.

Runtime manifest shape:

```json
{
  "frontendUrl": "http://127.0.0.1:<frontend-port>/",
  "agentUrl": "http://127.0.0.1:<agent-port>",
  "agentHealthUrl": "http://127.0.0.1:<agent-port>/health",
  "storageUrl": "http://127.0.0.1:<storage-port>",
  "storageHealthUrl": "http://127.0.0.1:<storage-port>/health"
}
```

Storage reuse requires service version `2.0.0`, schema version `2`, SQLite capability, and the expected data directory. Frontend reuse also fetches the Vite entry module and rejects a server that exposes raw CommonJS React modules instead of optimized dependencies.

The manifest health URLs are the source of truth for local startup success. Historical `logs/*.log` files may exist from older runs, but the current hidden background startup path does not require redirected stdout/stderr logs.

When `agent-runtime/backend/.venv` already exists, the startup scripts run that environment's `python.exe` and `uvicorn.exe` directly. `uv run` remains the fallback for first-time environment creation and uses the repository-local `.uv-cache`.

Port selection behavior:

- frontend defaults to port `3000`; if that port is busy and `PROMPTCARD_FRONTEND_PORT` is not set, startup automatically tries the next available local port.
- agent and storage use dynamic local ports during `dev:with-agent`.
- explicit `PROMPTCARD_FRONTEND_PORT`, `PROMPTCARD_AGENT_PORT`, or `PROMPTCARD_STORAGE_PORT` values are strict; startup fails if the selected port is occupied.
- Vite proxies `/agent-api` and `/storage-api` using `PROMPTCARD_AGENT_URL` and `PROMPTCARD_STORAGE_URL`, so frontend business code keeps same-origin relative routes.
- Storage health is the one special storage proxy: `/storage-api/health` maps to `<storageUrl>/health`, while normal `/storage-api/*` calls map to `<storageUrl>/api/*`.

### Blank Browser After Startup

A blank browser at the `frontendUrl` from `logs/dev-runtime.json` with successful health checks usually means the HTML shell loaded but the React bundle did not render. Inspect the current Vite transform errors:

```powershell
Get-Content logs\dev-server.err.log -Tail 120
```

Recent root cause seen locally: `src/components/ThreeStageBuilder.tsx` had an unterminated string constant, so Vite served the page shell but could not transform the application module. Confirm the source is currently valid with:

```powershell
npm.cmd run build
```

If the build passes and health checks pass, open the `frontendUrl` from `logs/dev-runtime.json`. A stale browser tab may still point at an older port.

### Full Startup Test

Run this when changing startup scripts or investigating a blank local app:

```powershell
npm.cmd run startup:test
```

The test starts from `start.bat`, skips the interactive pause through `PROMPTCARD_START_SKIP_PAUSE=1`, and verifies:

- storage service health from `logs/dev-runtime.json`
- Agent Runtime health from `logs/dev-runtime.json`
- Vite frontend health from `logs/dev-runtime.json`
- frontend HTML includes the Vite React entry module
- browser render check shows the project screen without console errors

If Playwright cannot launch in the current environment, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-start-from-bat.ps1 -SkipBrowserCheck
```

## Runtime Hygiene

Keep generated runtime dependencies and caches ignored. The Agent scripts keep generated Python/runtime state inside ignored repository-local paths:

- Python virtual environment: `agent-runtime/backend/.venv`
- uv cache: `.uv-cache`
- runtime port manifest: `logs/dev-runtime.json`
- generated Tauri dynamic dev config: `logs/tauri.dev-runtime.conf.json`
- PromptCard model connection metadata: `$DEER_FLOW_HOME/promptcard-model-connections.json`
- PromptCard model credentials: operating-system keyring entries managed through Model Management

The maintained launchers do not require `API-Key.txt`, `DEEPSEEK_API_KEY`, or `ARK_API_KEY`. The stack must start without model credentials; a credential is read from keyring only for a validated invocation. Never commit API keys, local runtime caches, virtual environments, or generated DeerFlow data.

## Troubleshooting

### Frontend Port Is Already In Use

For `npm.cmd run dev`, find the listener:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

Stop only the known development server process, then restart `npm.cmd run dev`, or set `PROMPTCARD_FRONTEND_PORT` to another available port.

When running `npm.cmd run dev:with-agent`, an unspecified frontend port conflict automatically falls forward from `3000`. If `PROMPTCARD_FRONTEND_PORT` is set, that explicit port is strict and must be free.

Read the active URL from:

```powershell
Get-Content logs\dev-runtime.json
```

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
$runtime = Get-Content logs\dev-runtime.json -Raw | ConvertFrom-Json
curl.exe --http1.0 "$($runtime.frontendUrl)agent-api/promptcard/runtime/status"
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

Check for unexpected generated files outside the ignored runtime paths. The intended local state is `agent-runtime/backend/.venv`, `.uv-cache`, `agent-runtime/.deer-flow`, `data/`, and `logs/`.

## Roadmap / Not Yet Implemented

- There is no production operations runbook for hosting the Agent Runtime.
- There is no automated cleanup command for all generated local runtime state.
