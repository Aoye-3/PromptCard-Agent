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

- `dev`: start the Vite frontend.
- `dev:with-agent`: start the storage service, Agent Runtime, and frontend helper flow.
- `storage:dev`: start only the local storage service on `127.0.0.1:8002`.
- `agent:dev`: start only the Agent Runtime.
- `agent:check`: validate Agent Runtime config loading.
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

These endpoints write JSON files under `data/` and are used as local development persistence helpers.

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

Stop only the known development server process, then restart `npm.cmd run dev`.

### Agent Backend Disconnected

Run:

```powershell
npm.cmd run agent:check
```

Then start the runtime:

```powershell
npm.cmd run agent:dev
```

Check that one supported key source exists and contains a usable DeepSeek-style key. Prefer setting `PROMPTCARD_AGENT_API_KEY_FILE` when running outside the default local workspace. Do not print the key.

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
