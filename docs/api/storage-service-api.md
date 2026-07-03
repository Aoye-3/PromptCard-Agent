# Storage Service API

The local storage service is the durable source of truth for projects, Prompt Library presets, image asset metadata, and Recent Capture metadata. The frontend reaches it through the Vite proxy prefix `/storage-api/*`; the service itself exposes `/api/*` on port `8002`.

## Health

`GET /health` returns `serviceVersion`, `schemaVersion`, `storage`, `database`, `pid`, and capabilities including `sqlite`, `assets`, `presetBatch`, `browserImportIdempotency`, `backup`, and `recentCaptures`.

- `GET /health`

Returns service status and the active data directory.

## Assets

- `POST /api/assets`
- `GET /api/assets/{asset_id}`
- `GET /api/assets/diagnostics`

Asset uploads send the bytes as the request body, the MIME type in `Content-Type`, and the original filename in `X-File-Name`. The service accepts signature-validated image and video asset types supported by the asset store. The current app path stores files up to 20 MB and returns:

```json
{
  "id": "generated-id.png",
  "filename": "storyboard.png",
  "contentType": "image/png",
  "size": 12345
}
```

The generated ID is safe to persist in project metadata and Recent Capture metadata. The read endpoint serves the original bytes with their stored content type. Invalid types, empty or oversized bodies return `400`; unknown or malformed IDs return `404`.

`GET /api/assets/diagnostics` checks the asset manifest and reference graph. Recent Capture `assetId` values are treated as live references, so screenshots that have not been placed on a project canvas are not reported as unreferenced solely because they are capture-only assets.

## Recent Captures

- `GET /api/recent-captures`
- `GET /api/recent-captures/{id}`
- `POST /api/recent-captures`
- `PUT /api/recent-captures/{id}`

Recent Capture records are metadata rows that point at existing assets by `assetId`. The MVP writes screenshot captures only; recording/video capture remains a future surface. A stored item has this UI-facing shape:

```json
{
  "id": "capture-1",
  "assetId": "generated-id.png",
  "kind": "screenshot",
  "status": "saved",
  "purpose": "reference",
  "role": null,
  "title": "Screenshot",
  "prompt": "",
  "userNote": "",
  "sourcePlatform": "",
  "sourceUrl": "",
  "contentType": "image/png",
  "size": 12345,
  "width": 640,
  "height": 360,
  "capturedAt": 1770000000000,
  "origin": "floating-toolbar"
}
```

Creates accept a complete capture metadata payload and return the stored item with service timestamps and `revision`. Updates require the current `revision` and replace only supplied mutable fields. Stale revisions return `409` with the current item. Unknown asset IDs return `404`; malformed payloads return `400`.

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

Errors use FastAPI's `detail` envelope with `code`, `message`, optional `detail`, and optional `current`. Defined codes include `not_found`, `duplicate_item`, `revision_conflict`, `invalid_payload`, and `invalid_asset`.
