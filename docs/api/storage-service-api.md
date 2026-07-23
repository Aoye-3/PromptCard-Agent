# Storage Service API

The local storage service is the durable source of truth for projects, Prompt Library presets, asset metadata/bytes, Recent Capture metadata, image-generation conversations/runs, and canvas placements. The frontend reaches it through the Vite proxy prefix `/storage-api/*`; the service itself exposes `/api/*` on port `8002`.

## Health

`GET /health` returns `serviceVersion`, `schemaVersion`, `storage`, `database`, `pid`, and capabilities including `sqlite`, `assets`, `presetBatch`, `browserImportIdempotency`, `backup`, and `recentCaptures`. Full image input/derivation support requires schema version `5`.

- `GET /health`

Returns service status and the active data directory.

## Assets

- `POST /api/assets`
- `GET /api/assets/{asset_id}`
- `GET /api/assets/diagnostics`

Asset uploads send the bytes as the request body, the MIME type in `Content-Type`, and the original filename in `X-File-Name`. The service accepts signature-validated image and video asset types supported by the asset store. The service stores files up to 200 MB and returns:

```json
{
  "id": "generated-id.png",
  "filename": "storyboard.png",
  "contentType": "image/png",
  "size": 12345
}
```

The generated ID is safe to persist in project metadata and Recent Capture metadata. The read endpoint serves the original bytes with their stored content type. Invalid types, empty or oversized bodies return `400`; unknown or malformed IDs return `404`.

`GET /api/assets/diagnostics` checks the asset manifest and reference graph. Active and Trash projects, active and Trash Prompt presets, and Recent Captures all participate in the reference scan. Registering or placing a capture therefore does not require a copied asset.

Succeeded image-generation runs also participate in the reference scan through `outputAssetIds`. Deleting a project or capture record must not make a historical generated output appear orphaned.

### Image import and derivatives

- `POST /api/image-assets/import`
- `POST /api/image-assets/derivations`
- `GET /api/image-assets/derivations/{sourceAssetId}`

Import accepts raw JPEG, PNG, WebP, BMP, TIFF, GIF, HEIC, and HEIF bytes. The request sends the MIME type in `Content-Type`, the URL-encoded original filename in `X-File-Name`, and the image bytes as the body. It validates the declared signature, 30 MB maximum, 36 million-pixel maximum, sides greater than 14, and `1:16–16:1` aspect ratio. The response returns the permanent original plus preview/provider-input assets and decoded dimensions:

```json
{
  "originalAsset": { "id": "original.heic", "contentType": "image/heic" },
  "previewAsset": { "id": "preview.jpg", "contentType": "image/jpeg" },
  "providerInputAsset": { "id": "provider.jpg", "contentType": "image/jpeg" },
  "width": 3024,
  "height": 4032
}
```

PNG/JPEG/WebP can be reused directly when no orientation conversion is required. BMP/TIFF/GIF/HEIC/HEIF are converted to a standard provider derivative; GIF/TIFF use the first frame/page, EXIF orientation is applied, alpha uses PNG, and opaque content uses high-quality JPEG.

The derivation POST records `sourceAssetId`, `derivedAssetId`, kind (`preview`, `provider-input`, or `annotation-flattened`), transform metadata, and an optional non-destructive annotation document. The GET endpoint returns `{ "derivations": [...] }` for the source asset. Both assets remain strong references. There is intentionally no derivative DELETE endpoint.

## Image Generation Runs

- `POST /api/image-generation-runs`
- `PATCH /api/image-generation-runs/{id}/state`
- `GET /api/image-generation-runs?projectId=&nodeId=&conversationId=&cursor=&limit=`
- `GET /api/image-generation-runs/{id}?projectId=`

There is intentionally no `DELETE` endpoint.

Runs are append-only request snapshots with a strict state machine:

```text
queued -> running -> succeeded
                  -> failed
```

Creation requires project, connection, provider, model, normalized request snapshot, an empty `outputAssetIds` list, and at least one of `conversationId` or legacy `nodeId`. The first conversation run atomically creates its conversation row with the queued run. Run detail and list reads require a matching `projectId`; cross-project IDs return `404`. State patches may only contain fields allowed for their target state. A succeeded patch uses `usage` for optional provider accounting; `providerUsage` is not an accepted state-patch field. Terminal records are immutable, and duplicate IDs return `409`.

## Image Generation Conversations And Placements

- `GET /api/image-generation-conversations?projectId=&cursor=&limit=`
- `GET /api/image-generation-conversations/{conversationId}?projectId=`
- `GET /api/image-generation-conversations/{conversationId}/runs?projectId=&cursor=&limit=`
- `GET /api/image-generation-placements?projectId=&state=pending`
- `PATCH /api/image-generation-placements/{runId}`

Conversation list/detail/run reads require the matching `projectId`. A mismatch returns `404` and does not disclose whether another project owns the conversation. Conversation summaries include the title, timestamps, latest run/state, preview asset, and turn count. The title is derived from the first non-empty prompt (32 visible characters) or a dated `图片创作` fallback.

A successful conversation run creates one permanent placement. Placement supports only `pending -> placed`; the patch body is `{ "state": "placed", "canvasNodeId": "..." }`. The frontend first hydrates the node carrying the same `generationRunId`, or creates a fallback result node for a legacy run, then persists the project. It marks the placement `placed` only after that save succeeds, so a retry remains idempotent and cannot acknowledge an unpersisted canvas update. There is no placement or conversation `DELETE` endpoint. Legacy node-only runs do not create placements.

A succeeded patch must reference assets already registered in the same Storage service. Those output IDs become strong historical references. Project/node removal and permanent project Trash deletion do not cascade into generation runs, output assets, or generated-result captures.

List results are ordered by `createdAt DESC, id DESC`, accept optional project/node filters, and use an opaque `nextCursor`. `limit` must be between 1 and 100. A retry or “generate again” action always creates another run rather than replacing the earlier record.

Storage rejects credential-, token-, URL-, URI-, and path-like field names anywhere inside persisted generation payloads. Prompt text may contain those ordinary words; the restriction applies to field names and sensitive structure, not user prose.

## Recent Captures

- `GET /api/recent-captures`
- `GET /api/recent-captures/{id}`
- `POST /api/recent-captures`
- `PUT /api/recent-captures/{id}`
- `DELETE /api/recent-captures/{id}`
- `POST /api/recent-captures/register-to-prompt-library`

Recent Capture records are metadata rows that point at existing assets by `assetId`. The current image intake accepts native screenshots and clipboard PNG/JPEG/WebP images. Recording/video capture remains gated behind Windows desktop acceptance. A stored item has this UI-facing shape:

```json
{
  "id": "capture-1",
  "assetId": "generated-id.png",
  "kind": "screenshot",
  "status": "recent",
  "purpose": "inspirationReference",
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
  "origin": { "type": "floating-toolbar", "engine": "xcap" },
  "registeredPromptId": null,
  "registeredAt": null,
  "linkedProjectId": null,
  "linkedCanvasNodeId": null,
  "revision": 1
}
```

The Media UI labels deletion as **Remove record**. `DELETE /api/recent-captures/{id}` requires `{ "revision": <current revision> }` and only removes the metadata row. It intentionally does not delete the shared asset file or any Prompt Library/Canvas consumer that already references the same `assetId`; an asset left without consumers remains visible to asset diagnostics for later cleanup. Permanent asset deletion is not part of this endpoint.

Creates accept a complete capture metadata payload and return the stored item with service timestamps and `revision`. Updates require the current `revision` and replace only supplied mutable fields. Stale revisions return `409` with the current item. Malformed payloads return `400`.

Registration is one SQLite transaction. `mode: "separate"` creates one preset per Capture; `mode: "merged"` creates one preset whose `meta.media` contains every selected asset. Each request item carries Capture `id` and `revision`, while user-confirmed label/content/type fields are supplied per item or in the merged `prompt` object. The response is `{ "presets": [...], "captures": [...] }`. Missing captures/assets, stale revisions, blank Prompt fields, or already-registered captures roll back the entire batch. Preset `meta.media[].assetId` is copied by reference, while `meta.recentCaptureSources` preserves Capture provenance.

Separate request:

```json
{
  "mode": "separate",
  "captures": [
    { "id": "capture-1", "revision": 2, "label": "Hero", "content": "cinematic hero portrait", "type": "subject" }
  ]
}
```

Merged request:

```json
{
  "mode": "merged",
  "captures": [
    { "id": "capture-1", "revision": 2 },
    { "id": "capture-2", "revision": 1 }
  ],
  "prompt": { "label": "Reference set", "content": "use the reviewed reference set", "type": "custom" }
}
```

Registration returns `400` for invalid modes, empty/blank Prompt fields, or already-registered items; `404` for missing Capture or asset records; and `409` for stale revisions. A failure response never contains a partially inserted Preset or partially updated Capture.

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
