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
