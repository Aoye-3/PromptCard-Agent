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
```

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

## Roadmap / Not Yet Implemented

- End-to-end browser tests are lightweight smoke coverage. Broader interaction coverage should be added around high-risk browser workflows.
- Agent live-model tests depend on a local DeepSeek key and should not run in generic CI without secret configuration.
- Durable Agent proposal audit tests are not applicable until such storage exists.
