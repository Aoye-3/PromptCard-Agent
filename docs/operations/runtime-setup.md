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
2. In Model Management, choose a provider under `PI 原生` or `方舟 SDK` and create its connection.
3. Save and successfully test the connection.
4. Assign one compatible chat model from that connection to `chat.primary`.
5. Keep the credential in the operating-system keyring.

The browser and pi runtime never receive the provider credential. PI-native calls use PI's provider API through the authenticated Gateway proxy; SDK-backed calls use a separate Gateway adapter. The Python Gateway reads the keyring value only for the selected invocation.

The connection-level model list is the maintained supported catalog for the provider. An Ark inference API Key does not enumerate private account endpoints; adding that capability later requires a separately modeled AK/SK management credential.

## Configure Image Generation

The existing image-generation setup is unchanged:

1. Create and test a Volcengine Ark connection.
2. Assign Seedream to `image.primary`.
3. Enable `PROMPTCARD_IMAGE_GENERATION_NODE_V1` for real generation.

Text Agent startup failure must not alter stored image conversations, runs, assets, or Canvas placements.

One Ark connection may appear on both pages, but its bindings remain separate. Selecting an Ark chat model does not change `image.primary`, and the image selector must show only image entries under `方舟 SDK`.

## Health Checks

- Storage: `GET <storageHealthUrl>`
- Python Gateway: `GET <agentHealthUrl>` returns `service: "promptcard-runtime"`
- pi text Agent: `GET <textAgentHealthUrl>` returns `service: "promptcard-pi-text-agent"` and `orchestrator: "pi"`

## Verification

```powershell
npm.cmd run agent:check
npx.cmd vitest run scripts/start-dev-with-agent.test.ts
.\agent-runtime\backend\.venv\Scripts\python.exe -m pytest agent-runtime\backend\tests -q -p no:cacheprovider
.\agent-runtime\backend\.venv\Scripts\python.exe -m unittest discover -s promptcard_storage/tests -p "test_*.py"
npm.cmd run build
npm.cmd run test:e2e
```

Live provider calls require a configured keyring credential and are a release smoke test, not a generic CI prerequisite.

The browser gate is zero-cost: `test:e2e` starts the workspace Storage service, Fake Runtime, and Vite on `38102`, `38101`, and `38100`. Use `npm.cmd run test:e2e -- -c playwright.image-generation.config.ts` for the image-node and multi-view subset; it intentionally excludes model-management. Do not substitute a direct Playwright CLI command because the runner is responsible for propagating the real test exit code, returning `124` on its timeout, and releasing the service ports in `finally`.
