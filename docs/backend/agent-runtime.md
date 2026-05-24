# Agent Runtime

The Agent Runtime is an optional Python service under `agent-runtime/`. It is derived from DeerFlow and exposed to the frontend through Vite proxy routes.

Local startup is handled by:

```powershell
npm.cmd run agent:dev
npm.cmd run dev:with-agent
```

Config is loaded from `agent-runtime/config.yaml`. Runtime-generated state should stay outside normal source control expectations.
