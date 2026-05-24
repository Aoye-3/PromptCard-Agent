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

Tests are run through Vitest.

Vitest excludes `tests/e2e/**` so Playwright specs are not collected by the unit-test runner.

## Recommended Verification Matrix

Before merging implementation work, run:

```powershell
npm.cmd run build
npm.cmd run test -- --run
npm.cmd run lint
```

For Agent Runtime work, also run:

```powershell
npm.cmd run agent:check
```

For browser-facing changes, use a manual or Playwright smoke test against:

```text
http://127.0.0.1:3000/
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
- Confirm the Vite dev server stops listening on port 3000.

## Quality Gates

- Do not commit secrets.
- Do not commit generated virtual environments, uv caches, or local runtime databases.
- Keep docs aligned with current code behavior.
- Label incomplete Agent/DeerFlow capabilities as roadmap instead of current behavior.
- For storage changes, verify both browser storage fallback and dev file endpoint behavior.
- For Agent collaboration changes, verify that Prompt library writes still require approval while card workspace edits can auto-apply.

## Roadmap / Not Yet Implemented

- End-to-end browser tests are lightweight smoke coverage. Broader interaction coverage should be added around high-risk browser workflows.
- Agent live-model tests depend on a local DeepSeek key and should not run in generic CI without secret configuration.
- Durable Agent proposal audit tests are not applicable until such storage exists.
