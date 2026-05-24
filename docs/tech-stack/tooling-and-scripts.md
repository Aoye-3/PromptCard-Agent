# Tooling and Scripts

## Frontend

```powershell
npm.cmd run dev
npm.cmd run test -- --run
npm.cmd run build
```

## Agent Runtime

```powershell
npm.cmd run agent:check
npm.cmd run agent:dev
npm.cmd run dev:with-agent
```

The PowerShell scripts derive the project root from `$PSScriptRoot`, so the project folder can be renamed without changing their core path logic.

`API-Key.txt` remains in the workspace root because the runtime scripts include `F:\.Agent-PromptCardManager\API-Key.txt` as a default local secret path.

`scripts/start-dev-with-agent.ps1` probes storage, Agent Runtime, and frontend health before starting new work. Healthy storage and Agent Runtime processes are reused; a healthy frontend at `http://127.0.0.1:3000/` makes the script exit successfully instead of launching another strict-port Vite process.

The startup script accepts injectable health URLs, timeout seconds, and frontend command parameters for Vitest coverage. The defaults preserve the normal `npm.cmd run dev:with-agent` and `start.bat` behavior.
