# Tooling and Scripts

## Frontend

```powershell
npm.cmd run dev
npm.cmd run tauri:dev
npm.cmd run test -- --run
npm.cmd run build
```

## Agent Runtime

```powershell
npm.cmd run agent:check
npm.cmd run agent:dev
npm.cmd run dev:with-agent
```

The PowerShell scripts derive the project root from `$PSScriptRoot`, so the project folder can be renamed without changing their core path logic. They do not load PromptCard provider credentials from `API-Key.txt` or provider environment variables. Model Management stores credentials in the operating-system keyring; `npm.cmd run agent:check` verifies that keyring and the pinned Ark SDK are available.

`scripts/start-dev-with-agent.ps1` is the full-stack local orchestrator. It uses `scripts/dev-port-runtime.ps1` to resolve local ports, writes `logs/dev-runtime.json`, exports the matching environment variables, and probes storage, Agent Runtime, and frontend health before starting new work.

Port inputs:

- `PROMPTCARD_FRONTEND_PORT`: optional strict frontend port. Without it, the frontend prefers `3000` and falls forward when busy.
- `PROMPTCARD_AGENT_PORT`: optional strict Agent Runtime port. Without it, the orchestrator chooses a free local port.
- `PROMPTCARD_STORAGE_PORT`: optional strict storage port. Without it, the orchestrator chooses a free local port.
- `PROMPTCARD_AGENT_URL` and `PROMPTCARD_STORAGE_URL`: exported by the orchestrator for Vite proxy targets.
- `PROMPTCARD_STORAGE_HEALTH_URL`: exported for the PromptCard Runtime status check.
- `PROMPTCARD_IMAGE_GENERATION_NODE_V1`: trusted server rollout gate for new image-generation requests; disabled by default.

The startup script accepts injectable health URLs, timeout seconds, frontend command parameters, and runtime manifest path for Vitest coverage. The defaults preserve the normal `npm.cmd run dev:with-agent` and `start.bat` behavior.

`npm.cmd run tauri:dev` starts the Tauri desktop dev shell. Tauri delegates service startup to `npm.cmd run desktop:dev-services`, which reuses `logs/dev-runtime.json` when launched from `scripts/launch-desktop-shell.ps1`.
