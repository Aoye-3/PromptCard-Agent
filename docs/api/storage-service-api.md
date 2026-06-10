# Storage Service API

The local storage service is the durable source of truth for projects and Prompt Library presets. The frontend reaches it through the Vite proxy prefix `/storage-api/*`; the service itself exposes `/api/*` on port `8002`.

## Health

- `GET /health`

Returns service status and the active data directory.

## Projects

- `GET /api/projects`
- `GET /api/projects/{id}`
- `POST /api/projects`
- `PUT /api/projects/{id}`
- `POST /api/projects/trash`
- `GET /api/projects/trash`
- `POST /api/projects/trash/restore`
- `DELETE /api/projects/trash`

Project writes require a `revision` in the request body:

```json
{
  "revision": 3,
  "updates": {
    "title": "Updated title"
  }
}
```

If the revision is stale, the service returns `409` with the current item in the response detail. The frontend project save coordinator adopts the returned revision and retries the newest complete local project snapshot, serially, up to three attempts. Local editable content is authoritative during this retry and is never replaced by the conflict payload.

Network failures and exhausted retries leave the newest local snapshot pending. A later automatic or manual save retries it; the UI reports failure without rolling back local edits.

## Prompt Library

- `GET /api/presets`
- `GET /api/presets/{id}`
- `POST /api/presets`
- `PUT /api/presets/{id}`
- `POST /api/presets/reorder`
- `POST /api/presets/{id}/increment-usage`
- `POST /api/presets/trash`
- `GET /api/presets/trash`
- `POST /api/presets/trash/restore`
- `DELETE /api/presets/trash`

Preset updates and usage increments also require the current `revision`. Empty preset storage is seeded by the service from `public/prompt-library-presets.json`; the frontend no longer creates durable default presets.

## Trash Payloads

Project and preset Trash entries are stored separately from active collections:

```json
{
  "id": "preset-1",
  "deletedAt": 1770000000000,
  "deletedBy": "user",
  "deleteReason": "optional",
  "payload": {}
}
```

Active list endpoints never return Trash entries.

## Migration

- `POST /api/migrations/browser-cache`

The frontend calls this once for legacy browser `projects`, `workspace`, and `presets`, then writes a browser migration marker. After that marker exists, project and preset reads use only the storage service.
