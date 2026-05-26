# Data Flow

## Project Data

Project data is represented by `IPromptProject`. Card projects mainly use `pages`; storyboard projects use the normalized `storyboard` shape; three-stage projects use the `threeStage` shape.

Loading now goes through the local `promptcard_storage` service. `data/projects.json` is the active project store and `data/project-trash.json` is the project Trash store. Browser project cache is imported once through the migration endpoint and is not used as an ongoing project source.

Project normalization is pure domain logic in `src/domain/projects/project-normalization.ts`. It is responsible for defaulting legacy card projects, migrating legacy flat storyboard rows into the sequence model, creating missing three-stage payloads, repairing known display-text mojibake, and sorting by recent activity. UI components and stores should call the storage facade instead of duplicating this logic.

## Prompt Library Data

Prompt Library presets use `IPreset`. UI and Agent approval flows should call preset store methods instead of writing storage directly.

The local storage service owns `data/prompt-library-presets.json` and `data/prompt-library-trash.json`. Empty preset storage is seeded by the service from the bundled preset JSON. The frontend no longer seeds durable presets.

Frontend project and preset storage calls use `/storage-api/*`, proxied to the storage service. The older Vite dev JSON endpoints remain compatibility helpers, but they are no longer the primary app persistence path and do not drive realtime frontend refresh.

Prompt injection is a reusable frontend flow:

```text
IPreset -> prompt injection module -> builder adapter -> target state
```

The prompt injection module filters and presents presets. Builder adapters decide how an action mutates state, such as appending to a card, replacing a focused three-stage field, or creating a new card. This keeps Prompt Library data reusable across card, three-stage, storyboard, and future builder modes.

## Builder Template Data

Builder templates describe parent prompt-building mode modules. They are maintained separately from Prompt Library presets and separately from concrete editor stores.

Current flow:

```text
BuilderTemplate -> template library UI -> project creation adapter -> IPromptProject -> builder screen
```

Readonly preview flow:

```text
BuilderTemplate -> readonly preview renderer
```

The template registry may declare child modules for a mode, such as card fields, field-level prompt injection, storyboard shot rows, or Agent collaboration adapters. Those declarations are descriptive and serializable; they must not import React screens, Zustand stores, or storage clients.

The project creation adapter in `src/App.tsx` is the bridge from template id to storage factory. This keeps the template library extensible without coupling it to the implementation details of card, storyboard, or three-stage builders.

The readonly preview renderer is not part of the project state flow. It must not create `IPromptProject` records, mutate presets, call autosave, or mount real builder screens.

## Agent Collaboration Data

The frontend sends a bounded workspace snapshot to the Agent Runtime. The runtime response may include structured JSON proposals:

- `workspace_card_create`
- `workspace_card_update`
- `storyboard_update`
- `prompt_library_write_proposal`

Card workspace proposals can be auto-applied by the collaboration panel. Prompt Library proposals require user approval before durable mutation.

Storyboard workspace changes use pure row/sequence helpers from `src/domain/storyboard/storyboard-operations.ts` so UI handlers remain focused on user events and rendering.
