# Testing and Quality

## Current Test Areas

The current frontend test suite covers several core utilities and stores:

- prompt parsing
- prompt composer behavior
- storage behavior
- project normalization and project merge behavior
- storyboard sequence/row operations
- three-stage output definitions
- Vite dev endpoint payload validation
- preset ordering
- card initial state
- card persistence
- example store behavior
- Agent runtime proposal parsing
- Agent workspace context building
- Agent store `sendMessage()` proposal return behavior
- local startup script parsing and health-check branching
- SQLite JSON migration, backup, revision, concurrency, Trash transaction, browser import idempotency, and asset metadata
- storage HTTP client timeout, structured-error, revision-conflict, missing-item, and asset-upload contracts
- injectable FastAPI storage route contracts for assets, errors, preset batches, and browser migration
- free-canvas image asset service behavior, including batch upload failure
- image-generator contracts, typed edge cardinality, structured `@` references, size/region validation, project-scoped lifecycle reconciliation, permanent history UI, and generated-result Media reuse
- model catalog/connection/assignment contracts, OS keyring storage and transactional legacy migration
- Seedream prompt/provider mapping, sanitized errors, secure result download, input/concurrency limits, and terminal run persistence
- PromptCard Storage schema v3→v4 migration, project conversation/run pagination, placement state machine, output asset strong references, and Runtime-to-Storage SQLite integration

Tests are run through Vitest.

Vitest excludes `tests/e2e/**` so Playwright specs are not collected by the unit-test runner.

## Recommended Verification Matrix

Before merging implementation work, run:

```powershell
npm.cmd run build
npm.cmd run test -- --run
npm.cmd run storage:test
npm.cmd run lint
```

For Agent Runtime work, also run:

```powershell
npm.cmd run agent:check
Push-Location agent-runtime\backend
.\.venv\Scripts\python.exe -m pytest tests\test_image_generation_service.py tests\test_image_generation_storage_integration.py tests\test_seedream_prompt_compiler.py tests\test_seedream_provider.py tests\test_model_connections.py tests\test_credential_store.py -q
.\.venv\Scripts\python.exe -m ruff check app tests
Pop-Location
```

The full Runtime Ruff gate currently passes for `app` and `tests`; the image-generation E2E Runtime fixture is checked separately.

For startup script work, run:

```powershell
npm.cmd run test -- --run scripts/start-dev-with-agent.test.ts scripts/launch-desktop-shell.test.ts
```

For browser-facing changes, start the local stack and read the active browser URL from:

```powershell
Get-Content logs\dev-runtime.json
```

The Playwright smoke suite runs through:

```powershell
npm.cmd run test:e2e
```

The project image-generation integration uses dedicated F:-local ports, a real PromptCard Storage SQLite process, the real Runtime image router/service, and a dependency-injected fake provider/result fetcher:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.cache\ms-playwright"
npx.cmd playwright test --config playwright.image-generation.config.ts
```

In restricted sandbox environments, Chromium launch may require elevated execution permissions.

## Acceptance Scenarios

### Project Flow

- Create a card project.
- Add and edit cards.
- Save and reopen the project.
- Create a storyboard project.
- Add/edit sequence and shot fields.
- Create a three-stage project.
- Edit character, storyboard, and video-prompt structured fields.
- Confirm example text appears as placeholder guidance and empty fields do not appear in copied output.
- Confirm camera-bound three-stage fields can append and replace values from `camera` Prompt library presets.
- Save and reopen the three-stage project.
- Confirm project list ordering follows recent activity.

### Prompt Library Flow

- Load initial presets.
- Add a preset.
- Update a preset.
- Delete a preset.
- Reorder presets.
- Confirm usage count increments when a preset is applied.
- Confirm dev file persistence works when the Vite endpoint is available.
- Confirm whole-library replacement commits atomically through the batch endpoint.

### Agent Dashboard Flow

- Runtime status moves from unknown to connected when Agent Runtime is available.
- Auth bootstrap completes without showing a second login form.
- Models, skills, tools, and Agent summaries load.
- A DeepSeek-backed prompt returns an assistant response.
- Prompt library proposal JSON is parsed into a pending proposal.
- Approving a proposal updates the Prompt library through preset store methods.
- Rejecting a proposal does not mutate the Prompt library.

### Agent Collaboration Flow

- Open or create a card project.
- Confirm the right rail shows one two-page panel with `结构化卡片输入` and `Agent 协作`.
- In `结构化卡片输入`, preset selection and card add/replace behavior still works.
- In `Agent 协作`, send a card-editing request such as `把主体卡片改得更具体`.
- When the Agent returns `workspace_card_update` or `workspace_card_create`, the card workspace updates immediately.
- When the Agent needs clarification, it should reply conversationally without mutating cards.
- When runtime is disconnected, the chat panel should show a readable connection error and leave card editing usable.

### Development Server Shutdown

- Open `Me`.
- Open settings.
- Click **Close development server**.
- Confirm the browser shows the closed-server message.
- Confirm the Vite dev server stops listening on the `frontendUrl` port from `logs/dev-runtime.json`.

### Image Generation Flow

- Create a Volcengine Ark connection and confirm the credential field clears after submit and never appears in the DOM or API response.
- Assign `doubao-seedream-5-0-pro-260628` to `image.primary`.
- Open the project-level `图片生成` tab, explicitly inject selected text/image canvas nodes, and confirm no selection or edge change triggers a request.
- Confirm structured `@` tokens remain bound to the same asset after reordering while compiled image numbers change.
- Validate 1K/2K and custom-size limits; confirm unsupported 4K/native mask/stream controls are absent.
- Save point/bbox region intent, generate through a fake provider in automated tests, and confirm a local asset, `generatedResult` capture, and succeeded run are created.
- Retry a failed run and confirm the retry has a different run ID and both records remain visible.
- Reload/restart and confirm history/output access; permanently delete the project and confirm history and its output asset remain queryable.
- Confirm every successful run is placed once as a normal image node, then use its manual continuation menu to prefill reference generation, smart edit, or region edit without invoking the provider until Generate is clicked again.

## Quality Gates

- Do not commit secrets.
- Do not commit generated virtual environments, uv caches, or local runtime databases.
- Keep docs aligned with current code behavior.
- Label incomplete Agent/DeerFlow capabilities as roadmap instead of current behavior.
- For storage changes, verify strict JSON migration, SQLite integrity, deterministic concurrent writes, transactional Trash and batch operations, structured errors, failed-request retention, and idempotent browser migration. Projects and Prompt Library presets have no JSON or browser write fallback.
- `storage:test` must use unittest discovery so new SQLite and asset test modules cannot be silently omitted. FastAPI contract tests explicitly skip when their optional dependency is unavailable and must also pass in the repository Agent backend environment.
- Save-concurrency Playwright tests must echo the request's real project ID and type. Use a request-start barrier before releasing delayed responses; fixed sleeps do not prove stale-response ordering.
- Free-canvas image coverage must verify supported asset validation, path traversal rejection, drag-and-drop node creation, minimal image rendering, manual horizontal and vertical crop lines, line deletion, cancel behavior, and non-destructive derived-node creation.
- For Agent collaboration changes, verify that Prompt library writes still require approval while card workspace edits can auto-apply.
- For image-generation changes, verify the trusted server feature gate rejects before run creation/credential access, the browser never calls a provider directly, total inputs stay at or below ten, and all terminal paths persist either `succeeded` or `failed` without remote URLs or raw secrets.

## Roadmap / Not Yet Implemented

- The automated image-generation integration uses a dependency-injected provider and deterministic local image result. Real Windows Credential Locker + live Ark coverage remains a release-time manual smoke test.
- Agent live-model tests depend on a local DeepSeek key and should not run in generic CI without secret configuration.
- Durable Agent proposal audit tests are not applicable until such storage exists.
