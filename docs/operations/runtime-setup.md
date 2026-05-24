# Runtime Setup

Run Agent Runtime checks from the project root:

```powershell
npm.cmd run agent:check
```

Start the runtime:

```powershell
npm.cmd run agent:dev
```

Start frontend and runtime together:

```powershell
npm.cmd run dev:with-agent
```

The runtime scripts set `DEER_FLOW_PROJECT_ROOT`, `DEER_FLOW_HOME`, `DEER_FLOW_CONFIG_PATH`, and `PROMPTCARD_LIBRARY_FILE` based on the project root.
