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
- `PROMPTCARD_IMAGE_GENERATION_NODE_V1`: trusted Agent Runtime rollout gate for real image generation; disabled unless set to `true`, `1`, `yes`, or `on`.

## Enabling Image Generation

1. Run `npm.cmd run agent:check` and keep any repair/cache paths inside the current F: workspace.
2. Start PromptCard without a credential; health and model catalog must still load.
3. In Model Management, create a Volcengine Ark connection and assign Seedream to `image.primary`. The credential is saved to the OS keyring.
4. Enable the frontend user-settings flag `meta.featureFlags.imageGenerationNodeV1` for the rollout cohort.
5. Restart Agent Runtime with `PROMPTCARD_IMAGE_GENERATION_NODE_V1=true`.

The server gate is checked before run creation, credential lookup, or SDK invocation. Turning it off is the safe first rollback step and does not remove model metadata, history, assets, or Recent Captures.
