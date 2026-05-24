# Frontend Dev Endpoints

These endpoints exist only in the Vite development server.

Implementation lives in `vite/plugins/promptcard-dev-storage.ts`; `vite.config.ts` only registers the plugins.

## Prompt Library

```text
GET /__promptcard/presets
PUT /__promptcard/presets
```

Backed by `data/prompt-library-presets.json`.

`PUT` validates that every preset has string `id`, `type`, `category`, `label`, `content`, numeric `usageCount`, and object `meta`.

## Projects

```text
GET /__promptcard/projects
PUT /__promptcard/projects
```

Backed by `data/projects.json`.

`PUT` validates that every project has string `id` and `title`, one of `card`, `storyboard`, or `three-stage` as `type`, array `pages`, numeric timestamps, numeric `currentPage`, and object `meta`.

## Dev Server Control

```text
POST /__promptcard/dev-server/shutdown
```

Used by the local settings panel to close the development server. This is not a production API.
