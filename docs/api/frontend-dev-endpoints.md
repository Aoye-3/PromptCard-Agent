# Frontend Dev Endpoints

These endpoints exist only in the Vite development server.

Implementation lives in `vite/plugins/promptcard-dev-storage.ts`; `vite.config.ts` only registers the plugins.

## Prompt Library

```text
GET /__promptcard/presets
PUT /__promptcard/presets
```

`GET` reads the legacy JSON migration source. `PUT` returns `410 Gone`; durable Prompt Library writes use `/storage-api/presets` and SQLite.

## Projects

```text
GET /__promptcard/projects
PUT /__promptcard/projects
```

`GET` reads the legacy JSON migration source. `PUT` returns `410 Gone`; durable project writes use `/storage-api/projects` and SQLite.

## Dev Server Control

```text
POST /__promptcard/dev-server/shutdown
```

Used by the local settings panel to close the development server. This is not a production API.
