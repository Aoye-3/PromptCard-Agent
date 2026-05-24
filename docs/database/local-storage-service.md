# Local Storage Service

`promptcard_storage` is a local FastAPI service that owns durable JSON storage for PromptCard data.

## Files

- `data/projects.json`: active projects.
- `data/project-trash.json`: deleted projects.
- `data/prompt-library-presets.json`: active Prompt Library presets.
- `data/prompt-library-trash.json`: deleted Prompt Library presets.

All writes use a temp file plus `os.replace`, so a failed write does not leave a half-written JSON file in place.

## Data Ownership

Projects and Prompt Library presets are no longer browser-owned data. `src/utils/storage.ts` remains the frontend compatibility facade, but project and preset methods call `/storage-api/*`.

`localforage` is still allowed for runtime UI cache and legacy data migration paths such as prompt history, settings, templates, and one-time browser cache import.

## Revisions

`IPromptProject` includes required `revision: number`. `IPreset` includes optional `revision?: number` for TypeScript compatibility; the service normalizes missing legacy values to `1`.

Every successful update increments the item revision. Stale writes return conflict instead of merging fields automatically.

## Agent Access

Agent Runtime tools read projects and presets through the storage API. Direct write tools require a revision. Prompt Library model output still defaults to proposal mode; user approval remains the normal durable write path.
