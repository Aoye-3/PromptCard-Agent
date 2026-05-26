# Testing Strategy

## Current Test Areas

Vitest covers:

- prompt parsing and composition
- storage facade behavior
- project normalization and merge behavior
- storyboard operations
- three-stage field definitions
- builder template registry contracts
- interactive temporary builder previews
- Prompt Library refresh, ordering, table actions, and edit form safety
- shared prompt injection filtering and rendering
- Agent runtime service parsing and Agent store proposal behavior
- local startup script parsing and health-check branching

Python unittest covers the local storage service store.

## Required Verification

Before merging to `main`, run:

```powershell
npm.cmd run lint
npm.cmd test -- --run
npm.cmd run build
python -m unittest promptcard_storage.tests.test_store
git diff --check
```

For Agent Runtime changes:

```powershell
npm.cmd run agent:check
```

For browser-facing changes, smoke test `http://127.0.0.1:3000/`. In restricted sandbox environments, Chromium launch may require elevated execution permissions.

## Acceptance Scenarios

### Project Flow

- Create card, storyboard, and three-stage projects.
- Open the template library and confirm it keeps the shell visible.
- Confirm template previews are interactive temporary builder previews.
- Edit a template preview and create a project from it; confirm the project is seeded from that preview snapshot.
- Confirm leaving the template library does not write prompt history.
- Save and reopen projects.

### Prompt Library Flow

- Load initial presets.
- Search by label and content.
- Add, edit, delete, Trash, restore, and permanently delete presets.
- Confirm existing Prompt edit opens read-only, then unlocks after clicking modify.
- Copy Prompt content from the edit dialog without saving.
- Reorder within a concrete category.
- Move an item to the top of the current category.
- Confirm search, all-category view, and Trash do not expose category reorder controls.
- Confirm UI updates immediately after create/update/reorder without a page refresh.

### Agent Flow

- Runtime status moves from unknown to connected when Agent Runtime is available.
- A PromptCard runtime message returns assistant text.
- Prompt library proposal JSON is parsed into a pending proposal.
- Approving a proposal updates presets through preset store methods.
- Rejecting a proposal leaves presets unchanged.
- Card workspace proposals can auto-apply in the card collaboration panel.

## Quality Gates

- Do not commit secrets.
- Do not commit generated virtual environments, uv caches, local runtime databases, or unrelated local data churn.
- Keep docs aligned with current code behavior.
- Label incomplete Agent/DeerFlow capabilities as roadmap or not yet implemented.
- For storage changes, verify storage service behavior and browser-cache compatibility.
- For Prompt Library changes, verify in-memory store refresh behavior.

## Roadmap

- End-to-end browser tests are still lightweight smoke coverage.
- Live model tests depend on a local key and should not run in generic CI without secret configuration.
- Durable Agent proposal audit tests are not applicable until such storage exists.
