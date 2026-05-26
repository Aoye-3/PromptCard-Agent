# Stack

## Frontend

- Vite
- React
- TypeScript
- Tailwind CSS
- lucide-react
- Zustand
- localforage for UI cache and legacy browser data migration

## Backend

- Python Agent Runtime under `agent-runtime/`
- FastAPI gateway
- DeerFlow-derived runtime internals
- Local storage service for projects and Prompt Library presets
- SQLite for Agent Runtime state

## Tooling and Scripts

Common commands:

```powershell
npm.cmd run dev
npm.cmd run dev:with-agent
npm.cmd run storage:dev
npm.cmd run agent:dev
npm.cmd run agent:check
npm.cmd run lint
npm.cmd test -- --run
npm.cmd run build
```

PowerShell scripts derive the project root from `$PSScriptRoot`. `scripts/start-dev-with-agent.ps1` probes storage, Agent Runtime, and frontend health before starting new processes. Healthy services are reused.

`API-Key.txt` remains in the workspace root because runtime scripts include `F:\.Agent-PromptCardManager\API-Key.txt` as a default local secret path. Do not commit it.
