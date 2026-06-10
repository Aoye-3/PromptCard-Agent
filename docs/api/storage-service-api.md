# Storage Service API

The local storage service is the durable source of truth for projects and Prompt Library presets. The frontend reaches it through the Vite proxy prefix `/storage-api/*`; the service itself exposes `/api/*` on port `8002`.

## Health

`GET /health` returns `serviceVersion`, `schemaVersion`, `storage`, `database`, `pid`, and capabilities including `sqlite`, `assets`, `presetBatch`, `browserImportIdempotency`, and `backup`.

- `GET /health`

Returns service status and the active data directory.

## Image Assets

- `POST /api/assets`
- `GET /api/assets/{asset_id}`
- `GET /api/assets/diagnostics`

Asset uploads send the image bytes as the request body, the MIME type in `Content-Type`, and the original filename in `X-File-Name`. The service accepts static PNG, JPEG, and WebP files up to 20 MB and returns:

```json
{
  "id": "generated-id.png",
  "filename": "storyboard.png",
  "contentType": "image/png",
  "size": 12345
}
```

The generated ID is safe to persist in project metadata. The read endpoint serves the original bytes with their stored image content type. Invalid types, empty or oversized bodies return `400`; unknown or malformed IDs return `404`.

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
- `PUT /api/presets/batch`
- `POST /api/presets/reorder`
- `POST /api/presets/{id}/increment-usage`
- `POST /api/presets/trash`
- `GET /api/presets/trash`
- `POST /api/presets/trash/restore`
- `DELETE /api/presets/trash`

Preset updates and usage increments require the current revision. The batch endpoint atomically replaces the active Prompt Library: every supplied existing item must have its current revision, new IDs are inserted, and omitted active items move to Trash.

## Trash Payloads

Project and preset Trash entries are API projections over records whose SQLite status is `trash`:

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

The request includes `migrationId`. Repeating a completed ID returns `alreadyApplied: true` without importing again. The complete import is transactional.

## Errors

Errors use FastAPI's `detail` envelope with `code`, `message`, optional `detail`, and optional `current`. Defined codes include `not_found`, `duplicate_item`, `revision_conflict`, and `invalid_asset`.
