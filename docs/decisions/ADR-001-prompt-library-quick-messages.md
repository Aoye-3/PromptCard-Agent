# ADR-001: Store Free Canvas Quick Messages as Prompt Library Presets

## Status

Accepted

## Date

2026-06-26

## Context

Free Canvas had project-local quick messages stored under `settings.meta.freeCanvasQuickTextPresets`. That made quick messages useful inside the canvas, but unavailable from the main Prompt Library. The product now needs a project-outside management entry so users can create, edit, delete, restore, search, and filter quick messages from the Prompt Library while keeping the existing Free Canvas drawer behavior.

The existing durable Prompt Library contract is `IPreset`. Presets already support CRUD, Trash, restore, usage count, search, and ordering through `preset.store` and `/storage-api/presets`.

## Decision

Represent quick messages as normal Prompt Library presets with a dedicated category:

- `type: "custom"`
- `category: "quick-message"`
- `label`: quick message name
- `content`: quick message body
- `meta.quickMessage.legacyId`: legacy settings id, used only for idempotent migration

`meta.quickMessage.note` may exist on older records, but it is a historical field only. New quick-message UI and helper writes do not expose, search, preserve, or write notes.

The Prompt Library category filter treats `quick-message` as a dedicated UI category. Normal card-type categories still match by `preset.type`, but `custom` excludes quick-message presets so they do not appear or count twice. The `all` category includes quick messages.

Free Canvas reads and writes the same preset records through `preset.store`. Creating a text node from a quick message still uses the preset body as a red `source: "preset"` text segment.

## Alternatives Considered

### Add a new `CardType`

- Pros: The category might look like the existing Prompt Library type filters.
- Cons: Quick messages are not PromptCards and should not become a first-class card schema variant.
- Rejected: It would expand the card model for a UI management need and increase migration surface.

### Add a new SQLite table or storage endpoint

- Pros: Quick messages could have a bespoke schema.
- Cons: The existing preset store already provides the needed lifecycle, Trash, ordering, search, and storage behavior.
- Rejected: A new persistence model would duplicate Prompt Library behavior and create more synchronization work between Free Canvas and Prompt Library.

### Keep using settings as the durable source

- Pros: Minimal code movement.
- Cons: Settings are not the maintained durable Prompt Library source and do not support full Prompt Library management behavior.
- Rejected: This keeps quick messages trapped inside a canvas-specific path and fails the project-outside management requirement.

## Consequences

- No SQLite schema migration is required for quick messages.
- No new `CardType` is introduced.
- `settings.meta.freeCanvasQuickTextPresets` remains a legacy compatibility source only.
- `preset.store.init()` performs idempotent migration by preserving each old id in `meta.quickMessage.legacyId`.
- Quick-message edit surfaces omit notes. Saving through the shared helper strips old `meta.quickMessage.note` while keeping supported metadata such as `legacyId` and `meta.media`.
- Future quick-message UI work should use `src/domain/prompt-library/quick-messages.ts` helpers instead of reimplementing category checks or legacy normalization.
- Builder or Agent surfaces may consume quick-message presets, but Prompt Library remains the project-outside management home.

## Verification

Relevant checks:

```powershell
npm.cmd test -- --run src/domain/prompt-library/quick-messages.test.ts src/components/PromptLibraryPreviewMode.test.ts src/stores/preset-order.test.ts src/stores/preset.store.test.ts src/domain/free-canvas/free-canvas-project.test.ts
npm.cmd test -- --run
npm.cmd run lint
npm.cmd run build
npm.cmd run storage:test
```
