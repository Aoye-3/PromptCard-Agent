# Data Flow

## Project Data

Project data is represented by `IPromptProject`. Card projects mainly use `pages`; storyboard projects use the normalized `storyboard` shape; three-stage projects use the `threeStage` shape.

Three-stage projects use a page-based form model under `threeStage.pages`. Each page contains ordered independent `form` items for character, storyboard, video-prompt, and optional object boards. The legacy top-level `threeStage.character`, `threeStage.storyboard`, `threeStage.videoPrompt`, `selectedStage`, and `selectedFieldId` fields remain compatibility mirrors and are synchronized from the selected page/form during normalization and UI updates.

Loading now goes through the local `promptcard_storage` service. Active and Trash project rows live in `data/promptcard.sqlite3`; the old project JSON files are read-only migration sources. Browser project cache is imported once through an idempotent migration endpoint and is not used as an ongoing project source.

Project normalization is pure domain logic in `src/domain/projects/project-normalization.ts`. It is responsible for defaulting legacy card projects, migrating legacy flat storyboard rows into the sequence model, creating missing three-stage payloads, repairing known display-text mojibake, and sorting by recent activity. UI components and stores should call the storage facade instead of duplicating this logic.

Three-stage page normalization and mutations are pure helpers in `src/domain/three-stage/three-stage-pages.ts`. UI handlers should use those helpers for page duplication, independent form creation, deletion, ordering, selected-form changes, and legacy-field synchronization.

## Prompt Library Data

Prompt Library presets use `IPreset`. UI and Agent approval flows should call preset store methods instead of writing storage directly.

The local storage service owns Prompt Library rows in `data/promptcard.sqlite3`. The old Prompt JSON files are read-only migration sources. A completely empty database is seeded by the service from the bundled preset JSON, and the frontend no longer seeds durable presets.

Frontend project and preset storage calls use `/storage-api/*`, proxied to the storage service. The older Vite dev JSON endpoints are read-only compatibility helpers; their write methods return `410`.

## Agent Collaboration Data

The frontend sends a bounded workspace snapshot to the Agent Runtime. The runtime response may include structured JSON proposals:

- `workspace_card_create`
- `workspace_card_update`
- `storyboard_update`
- `prompt_library_write_proposal`

Card workspace proposals can be auto-applied by the collaboration panel. Prompt Library proposals require user approval before durable mutation.

Storyboard workspace changes use pure row/sequence helpers from `src/domain/storyboard/storyboard-operations.ts` so UI handlers remain focused on user events and rendering.

Three-stage workspace snapshots include selected page, selected item, selected form, and selected form type. `selectedPairId` is retained as `null` for compatibility. Video prompt context must be built from the selected form itself and must not include a paired storyboard summary.
