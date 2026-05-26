# Storage

## Overview

Durable project and Prompt Library data is owned by the local `promptcard-storage` service. The frontend reaches it through the Vite proxy at `/storage-api/*` and the client in `src/storage/storage-service-client.ts`.

`localforage` is not the primary durable store for projects or Prompt Library presets. It remains available for local UI cache data:

- prompt history snapshots
- settings
- templates
- one-time migration markers for legacy browser data

## Durable Data Paths

Known local development files:

- `data/projects.json`
- `data/prompt-library-presets.json`

These files are written by the storage service and development helpers. Treat them as local app data, not source schemas.

## Development Endpoints

Primary durable API:

- `/storage-api/*` -> `http://127.0.0.1:8002/api/*`

Compatibility-only Vite helpers:

- `GET/PUT /__promptcard/presets`
- `GET/PUT /__promptcard/projects`

Project and preset writes do not fall back to browser storage. If the storage service is unavailable, durable operations should fail visibly.

## Schema Notes

Frontend models:

- `IPromptProject`: top-level project record with type-specific payloads
- `IPage` and `ICard`: card project pages and cards
- `IStoryboardProject`: sequence/shot storyboard data
- `IThreeStageProject`: three structured prompt sections
- `IPreset`: Prompt Library preset contract

Loading normalizes legacy project data before the UI uses it:

- default legacy projects to `type: "card"`
- ensure `pages` and `cards` are arrays
- migrate legacy storyboard `rows` into `sequences`
- create missing three-stage payloads for three-stage projects
- sort projects by `lastOpenedAt`, then `updatedAt`

## Agent Runtime SQLite

Agent Runtime state belongs to the Python runtime under `agent-runtime/` and is configured by `agent-runtime/config.yaml`. It is separate from frontend project and Prompt Library storage.

## Change Guidance

Storage changes should include tests for:

- revision conflicts
- Trash behavior
- migration and normalization
- storage-service API behavior
- browser-cache compatibility where relevant

Avoid writing project or preset data directly from UI components.
