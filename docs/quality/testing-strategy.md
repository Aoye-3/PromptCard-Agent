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
- pi proposal policy for selected/no-selection Canvas text behavior
- PromptCard Runtime boundary and local internal-token authentication
- Media Library one-image multimodal analysis boundary
- Agent workspace context building
- Agent store `sendMessage()` proposal return behavior
- local startup script parsing and health-check branching
- SQLite JSON migration, backup, revision, concurrency, Trash transaction, browser import idempotency, and asset metadata
- storage HTTP client timeout, structured-error, revision-conflict, missing-item, and asset-upload contracts
- injectable FastAPI storage route contracts for assets, errors, preset batches, and browser migration
- free-canvas image asset service behavior, including batch upload failure
- project Image Generation conversations, legacy read-only generator normalization, structured `@` references, source/reference roles, size/region/annotation validation, project-scoped lifecycle reconciliation, permanent history UI, and generated-result Media reuse
- model catalog/connection/assignment contracts, OS keyring storage and transactional legacy migration
- Seedream prompt/provider mapping, standard/fast optimization, URL/Base64 response handling, multilingual Prompt preservation, sanitized errors, secure result download, input/concurrency limits, and terminal run persistence
- PromptCard Storage schema v3→v4→v5 migration, original/derived image import, project conversation/run pagination, placement state machine, output/original/derived strong references, and Runtime-to-Storage SQLite integration

Tests are run through Vitest.

Vitest excludes `tests/e2e/**` so Playwright specs are not collected by the unit-test runner.

## Recommended Verification Matrix

Before merging implementation work, run:

```powershell
npm.cmd run build
npm.cmd test -- --run
.\agent-runtime\backend\.venv\Scripts\python.exe -m pytest promptcard_storage/tests -q -p no:cacheprovider
npm.cmd run lint
```

For Agent Runtime work, also run:

```powershell
npm.cmd run agent:check
.\agent-runtime\backend\.venv\Scripts\python.exe -m pytest agent-runtime\backend\tests -q -p no:cacheprovider
.\agent-runtime\backend\.venv\Scripts\python.exe -m ruff check agent-runtime\backend\app agent-runtime\backend\tests
```

The full Runtime Ruff gate currently passes for `app` and `tests`; the image-generation E2E Runtime fixture is checked separately.

For startup script work, run:

```powershell
npm.cmd test -- --run scripts/start-dev-with-agent.test.ts scripts/launch-desktop-shell.test.ts
```

For browser-facing changes, start the local stack and read the active browser URL from:

```powershell
Get-Content logs\dev-runtime.json
```

The Playwright smoke suite runs through:

```powershell
npm.cmd run test:e2e
```

The project image-generation integration uses dedicated F:-local ports, a real PromptCard Storage SQLite process, the real Runtime image router/service, and a dependency-injected fake provider/result fetcher. The normal pair also verifies model-management gating:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.playwright-browsers"
npx.cmd playwright test tests/e2e/model-management.spec.ts tests/e2e/image-generation-node.spec.ts --workers=1
```

`playwright.image-generation.config.ts` remains available when only the project image-generation conversation spec is needed.

In restricted sandbox environments, Chromium launch may require elevated execution permissions.

The focused image-generation commands are the regression gate for this feature. The Runtime full suite also contains live-model, POSIX/Docker, symlink-privilege, and cross-platform path tests; record those environment failures separately instead of attributing them to Seedream changes. Repository ESLint currently has no errors but may fail its warning budget; see the maintained [implementation status](../Plan/005-seedream-image-node-frontend-implementation-status.md).

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
- Local session bootstrap completes without showing a second login form.
- Text models load under `PI 原生` and SDK integration groups with no image-model leakage.
- Both a PI-native provider descriptor and an SDK-backed provider descriptor register through the pi provider collection; an assigned compatible text model returns an assistant response.
- Prompt library proposal JSON is parsed into a pending proposal.
- Approving a proposal updates the Prompt library through preset store methods.
- Rejecting a proposal does not mutate the Prompt library.

### Agent Collaboration Flow

- Select one Canvas text node, ask the Agent to improve it, and confirm only a pending `free_canvas_text_update` for that exact node appears.
- Reject the proposal and confirm Canvas is unchanged.
- Apply the proposal and confirm the selected text node changes.
- Clear Canvas selection, ask the Agent to write from Prompt Library context, and confirm a pending `free_canvas_text_create` appears.
- Confirm no Canvas mutation occurs before Apply.
- When runtime is disconnected, the panel shows a readable error while Canvas editing and Image Generation remain usable.

### Media Analysis Flow

- Select one image in Media Library and run style analysis.
- Confirm the request contains only that asset ID/content type.
- Confirm the response is read-only and contains no Canvas or Prompt Library proposal.
- Confirm non-image media is rejected until video analysis is implemented.

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
- Label deferred pi/Text Agent capabilities as roadmap instead of current behavior.
- For storage changes, verify strict JSON migration, SQLite integrity, deterministic concurrent writes, transactional Trash and batch operations, structured errors, failed-request retention, and idempotent browser migration. Projects and Prompt Library presets have no JSON or browser write fallback.
- `storage:test` must use unittest discovery so new SQLite and asset test modules cannot be silently omitted. FastAPI contract tests explicitly skip when their optional dependency is unavailable and must also pass in the repository Agent backend environment.
- Save-concurrency Playwright tests must echo the request's real project ID and type. Use a request-start barrier before releasing delayed responses; fixed sleeps do not prove stale-response ordering.
- Free-canvas image coverage must verify supported asset validation, path traversal rejection, drag-and-drop node creation, minimal image rendering, manual horizontal and vertical crop lines, line deletion, cancel behavior, and non-destructive derived-node creation.
- For Agent collaboration changes, verify that Prompt Library and Canvas writes both require explicit approval.
- For image-generation changes, verify the trusted server feature gate rejects before run creation/credential access, the browser never calls a provider directly, total inputs stay at or below ten, and all terminal paths persist either `succeeded` or `failed` without remote URLs or raw secrets.

## Roadmap / Not Yet Implemented

- The automated image-generation integration uses a dependency-injected provider and deterministic local image result. Real Windows Credential Locker + live Ark coverage remains a release-time manual smoke test.
- Agent live-model tests depend on the selected provider's configured keyring credential and should not run in generic CI without secret configuration.
- Durable Agent proposal audit tests are not applicable until such storage exists.
