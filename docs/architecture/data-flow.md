# Data Flow

## Project Data

Project data is represented by `IPromptProject`. Card projects mainly use `pages`; storyboard projects use the normalized `storyboard` shape; three-stage projects use the `threeStage` shape.

Loading now goes through the local `promptcard_storage` service. `data/projects.json` is the active project store and `data/project-trash.json` is the project Trash store. Browser project cache is imported once through the migration endpoint and is not used as an ongoing project source.

Project normalization is pure domain logic in `src/domain/projects/project-normalization.ts`. It is responsible for defaulting legacy card projects, migrating legacy flat storyboard rows into the sequence model, creating missing three-stage payloads, repairing known display-text mojibake, and sorting by recent activity. UI components and stores should call the storage facade instead of duplicating this logic.

## Prompt Library Data

Prompt Library presets use `IPreset`. UI and Agent approval flows should call preset store methods instead of writing storage directly.

The local storage service owns `data/prompt-library-presets.json` and `data/prompt-library-trash.json`. Empty preset storage is seeded by the service from the bundled preset JSON. The frontend no longer seeds durable presets.

Frontend project and preset storage calls use `/storage-api/*`, proxied to the storage service. The older Vite dev JSON endpoints remain compatibility helpers, but they are no longer the primary app persistence path.

## Agent Collaboration Data

The frontend sends a bounded workspace snapshot to the Agent Runtime. The runtime response may include structured JSON proposals:

- `workspace_card_create`
- `workspace_card_update`
- `storyboard_update`
- `prompt_library_write_proposal`

Card workspace proposals can be auto-applied by the collaboration panel. Prompt Library proposals require user approval before durable mutation.

Storyboard workspace changes use pure row/sequence helpers from `src/domain/storyboard/storyboard-operations.ts` so UI handlers remain focused on user events and rendering.
