# Operations Runbook

## Local Commands

Run from the repository root:

```powershell
npm.cmd run dev
npm.cmd run dev:with-agent
npm.cmd run storage:dev
npm.cmd run agent:dev
npm.cmd run agent:check
npm.cmd run build
npm.cmd test -- --run
```

Command purposes:

- `dev`: Vite frontend on port 3000 with strict port behavior
- `dev:with-agent`: start or reuse storage, Agent Runtime, and frontend
- `storage:dev`: local storage service on `127.0.0.1:8002`
- `agent:dev`: Agent Runtime
- `agent:check`: validate Agent Runtime configuration
- `build`: TypeScript and production Vite build
- `test -- --run`: one-shot Vitest suite

## Health Checks

`dev:with-agent` checks:

- storage: `http://127.0.0.1:8002/health`
- Agent Runtime: `http://127.0.0.1:8001/health`
- frontend: `http://127.0.0.1:3000/`

Healthy existing services are reused. Logs are written under `logs/`.

## Development Server Control

The `Me` settings panel exposes **Close development server**. It calls:

```text
POST /__promptcard/dev-server/shutdown
```

This endpoint exists only in the Vite dev server middleware.

## Secrets Policy

Never commit API keys, runtime caches, virtual environments, or generated DeerFlow data.

Default DeepSeek key lookup order:

1. `PROMPTCARD_AGENT_API_KEY_FILE`
2. `F:\.Agent-PromptCardManager\API-Key.txt`
3. `F:\.FinalProject\API-Key.txt`

## Troubleshooting

### Port 3000 Is Already In Use

Find the listener:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

Because Vite uses strict port mode, a non-healthy existing listener must be stopped before starting the frontend.

### Agent Backend Disconnected

Run:

```powershell
npm.cmd run agent:check
npm.cmd run agent:dev
```

Check the PromptCard boundary:

```powershell
curl.exe --http1.0 http://localhost:3000/agent-api/promptcard/runtime/status
```

Inspect `logs/agent-runtime.err.log` if the raw process starts but the boundary fails.

### Missing Playwright Browser

Install browsers only when browser testing needs them:

```powershell
npx.cmd playwright install
```

### CSS Minify Warning

Build may report a CSS warning around slash-containing generated width classes such as `.w-2/3`. Track that separately unless it blocks release.

## Roadmap

- No production hosting runbook exists for Agent Runtime yet.
- No automated cleanup command exists for all generated local runtime state yet.
