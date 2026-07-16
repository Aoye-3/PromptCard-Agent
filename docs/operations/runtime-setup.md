# Runtime Setup

## Check And Start

From the repository root:

```powershell
npm.cmd run agent:check
npm.cmd run dev:with-agent
```

For isolated development:

```powershell
npm.cmd run storage:dev
npm.cmd run text-agent:dev
npm.cmd run agent:dev
npm.cmd run dev
```

`dev:with-agent` allocates local ports and writes `logs/dev-runtime.json`. The manifest contains frontend, Storage, Python Gateway, and pi text Agent URLs.

## Environment Overrides

- `PROMPTCARD_FRONTEND_PORT`
- `PROMPTCARD_STORAGE_PORT`
- `PROMPTCARD_AGENT_PORT`
- `PROMPTCARD_TEXT_AGENT_PORT`
- `PROMPTCARD_DEV_RUNTIME_MANIFEST`
- `PROMPTCARD_RUNTIME_STATE_DIR`
- `PROMPTCARD_IMAGE_GENERATION_NODE_V1`

The combined launcher generates `PROMPTCARD_INTERNAL_TOKEN` when it is absent. Do not persist or expose this token to browser code.

## Configure The Text Model

1. Start the stack without credentials; health and catalog endpoints must still load.
2. In Model Management, create a `volcengine-ark` connection.
3. Save and successfully test the connection.
4. Assign `doubao-seed-2-0-lite-260215` or another compatible Ark chat model to `chat.primary`.
5. Keep the credential in the operating-system keyring.

The browser and pi runtime never receive the credential. The Python Gateway reads it only when invoking Ark.

## Configure Image Generation

The existing image-generation setup is unchanged:

1. Create and test a Volcengine Ark connection.
2. Assign Seedream to `image.primary`.
3. Enable `PROMPTCARD_IMAGE_GENERATION_NODE_V1` for real generation.

Text Agent startup failure must not alter stored image conversations, runs, assets, or Canvas placements.

## Health Checks

- Storage: `GET <storageHealthUrl>`
- Python Gateway: `GET <agentHealthUrl>` returns `service: "promptcard-runtime"`
- pi text Agent: `GET <textAgentHealthUrl>` returns `service: "promptcard-pi-text-agent"` and `orchestrator: "pi"`

## Verification

```powershell
npm.cmd run agent:check
npx.cmd vitest run scripts/start-dev-with-agent.test.ts
.\agent-runtime\backend\.venv\Scripts\python.exe -m pytest agent-runtime\backend\tests -q -p no:cacheprovider
npm.cmd run build
```

Live Ark calls require a configured keyring credential and are a release smoke test, not a generic CI prerequisite.
