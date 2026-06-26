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

`npm.cmd run dev:with-agent` also allocates local service ports and writes:

```text
logs/dev-runtime.json
```

Use that manifest for the active frontend, Agent Runtime, and storage URLs. The frontend stays on `/agent-api` and `/storage-api`; Vite proxies those routes to the manifest-backed `PROMPTCARD_AGENT_URL` and `PROMPTCARD_STORAGE_URL`.

Environment overrides:

- `PROMPTCARD_FRONTEND_PORT`: strict frontend port; defaults to preferred `3000` with fallback when unset.
- `PROMPTCARD_AGENT_PORT`: strict Agent Runtime port; defaults to a free local port when unset.
- `PROMPTCARD_STORAGE_PORT`: strict storage service port; defaults to a free local port when unset.
- `PROMPTCARD_DEV_RUNTIME_MANIFEST`: custom manifest path; defaults to `logs/dev-runtime.json`.
