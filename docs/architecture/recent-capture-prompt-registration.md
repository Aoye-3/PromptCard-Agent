# Recent Capture To Prompt Registration

## Status

Implemented for screenshot and pasted-image captures. Automated frontend and storage tests cover single, separate-batch, merged-batch, metadata conversion, revision conflicts, missing assets, repeat registration, rollback, and shared asset identity. Windows end-to-end manual acceptance remains open; recording is not implemented.

## Boundary

Recent Captures is the raw, Agent-hidden review inbox. Prompt Library is the curated, Agent-visible store. Moving an item across that boundary always requires a user-confirmed registration action.

## Transaction

`POST /api/recent-captures/register-to-prompt-library` supports two modes:

- `separate`: each Capture produces one Prompt preset.
- `merged`: all selected Captures become one Prompt preset with multiple `meta.media` entries.

The storage service reads every Capture and asset inside one SQLite transaction, validates revisions and prior registration, validates non-empty Prompt fields, inserts new Presets at the front of Prompt Library, and updates Capture registration links. Any failure rolls back Preset inserts, sort-order changes, and Capture updates together.

`registeredPromptId` is the registration authority. `status` remains a workflow/display field and must not be used to infer whether registration occurred. A Capture can register only once in the first version; subsequent editing happens on the existing Prompt preset.

## Metadata Conversion

Each Prompt media entry uses `source: "asset"` and the existing Capture `assetId`. `meta.recentCaptureSources` preserves `captureId`, purpose, role, note, source platform/URL, capture time, and origin. Default role mapping is character/prop to subject, scene to scene, composition to camera, lighting to lighting, color/style/mood to style, and other to custom. Mixed merged roles default to custom.

The registration response returns the inserted Presets and updated Captures. The frontend refreshes both the Preset Store and Recent Captures, disables repeat registration, and exposes navigation to the registered Prompt.

## Independent Canvas Link

Canvas placement creates a unique image node but retains the same asset ID. `linkedProjectId` and `linkedCanvasNodeId` are independent of `registeredPromptId`; an already-registered Capture stays registered after placement. Asset diagnostics includes active and Trash Presets, so trashing a Prompt does not incorrectly orphan its media.

## Capture Record Removal And Asset Lifetime

The Media inbox separates selection, editing, and removal. Selecting a row only refreshes the detail panel; the explicit Edit action opens the media analysis dialog. The destructive row action is labelled **Remove record** because `DELETE /api/recent-captures/{id}` removes only the revision-checked Recent Capture metadata row.

Removing a Capture does not remove Prompt media, Canvas nodes, the asset database row, or the physical file. This is required because all three consumers may share one `assetId`. If no consumers remain, asset diagnostics reports the asset as unreferenced. Reference-aware permanent asset deletion and cascading removal from Prompt/Canvas are not implemented; they require a separate dependency preview and destructive confirmation flow.

## Agent Boundary

Recent Captures is not part of the global Agent context. Registration does not grant the Agent access to the inbox; it creates a curated Prompt preset, and only that preset participates in the existing Prompt Library context path.

## Related Decision

See [ADR-006](../decisions/ADR-006-explicit-capture-registration-and-shared-asset-identity.md) for the transaction and asset-identity rationale.
