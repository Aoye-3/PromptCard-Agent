# Storage Model

Frontend persistence is exposed through `src/utils/storage.ts`.

`src/utils/storage.ts` is intentionally a facade: it preserves the existing app-facing API while delegating project and Prompt Library durability to the local storage service through `src/storage/storage-service-client.ts`.

## Browser Storage

`localforage` is no longer the durable source for projects, workspace, or Prompt Library presets. It remains available for UI-only cache, prompt history, settings, templates, and one-time migration of legacy browser data.

## Development File Storage

The primary durable endpoint is:

- `/storage-api/*` -> `http://127.0.0.1:8002/api/*`

When the Vite dev server is available, legacy helpers still expose:

- `/__promptcard/presets`
- `/__promptcard/projects`

Project and preset writes do not fall back to browser storage. If the storage service is unavailable, those durable operations fail visibly.

The Vite middleware implementation for these endpoints lives in `vite/plugins/promptcard-dev-storage.ts`. `vite.config.ts` only wires the plugins into the dev server.

## Project Normalization

Project reads normalize data before returning it to the UI. Normalization includes:

- defaulting legacy projects to `type: "card"`
- ensuring `pages` and `cards` are arrays
- migrating legacy storyboard `rows` into `sequences`
- creating a missing `threeStage` payload for three-stage projects
- sorting by `lastOpenedAt`, then `updatedAt`

## Change Guidance

Storage changes should include tests for revision conflicts, Trash behavior, migration, and project normalization. Avoid writing project or preset data directly from UI components.
