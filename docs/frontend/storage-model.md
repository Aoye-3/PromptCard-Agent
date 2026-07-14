# Storage Model

Frontend persistence is exposed through `src/utils/storage.ts`.

`src/utils/storage.ts` is intentionally a facade: it preserves the existing app-facing API while delegating project and Prompt Library durability to the local storage service through `src/storage/storage-service-client.ts`.

In editable desktop development, the storage service writes to the ignored repository `data/` directory. Frontend code still uses `/storage-api/*` and does not open repository files directly; the path contract belongs to launchers and the Storage Service.

## Browser Storage

`localforage` is no longer the durable source for projects, workspace, or Prompt Library presets. It remains available for UI-only cache, prompt history, settings, templates, and one-time migration of legacy browser data.

The following browser-side records remain outside the filesystem profile for now:

- localforage `history`, `templates`, `settings`, `cards`, `examples`, and legacy migration flags.
- localStorage `prompt_card_config` for the older AI settings panel.
- localStorage `promptcard-ui-language`.
- localStorage `promptcard-agent-sessions-v1`.

Future settings work may migrate these records, but source update logic must already treat them as user-owned data.

`settings.meta.freeCanvasQuickTextPresets` is a legacy compatibility source only. On Prompt Library initialization, old Free Canvas quick messages are migrated into `/storage-api/presets` records using the existing `IPreset` shape, with `category: "quick-message"` and `meta.quickMessage.legacyId` for idempotency. Legacy note fields may be read during normalization but are intentionally discarded during migration. New quick-message writes use the Prompt Library preset store and do not write back to settings.

## Development File Storage

The primary durable endpoint is:

- `/storage-api/*` -> `${PROMPTCARD_STORAGE_URL}/api/*`

When the Vite dev server is available, legacy helpers expose read-only migration views:

- `/__promptcard/presets`
- `/__promptcard/projects`

`PUT` to either legacy endpoint returns `410`. Project and preset writes never fall back to JSON or browser storage.

The storage client uses structured `StorageHttpError`, a ten-second timeout, and status-based `404` handling. Revision conflicts remain a separate typed error used by the project save coordinator.

The Vite middleware implementation for these endpoints lives in `vite/plugins/promptcard-dev-storage.ts`. `vite.config.ts` only wires the plugins into the dev server.

## Image Assets

Free-canvas images, floating screenshots, and clipboard images are uploaded through `/storage-api/assets`. Project JSON, Prompt preset metadata, and Recent Capture metadata store the returned `assetId`, never Base64 image data. Original and cropped nodes can therefore share one durable file without increasing project write size; cropped nodes add only normalized crop coordinates and their source node reference.

## Recent Captures

Recent Capture metadata is stored through `/storage-api/recent-captures` and exposed in the frontend facade as `storage.recentCaptures`. Durable records use `RecentCaptureItem`; media UI converts them to `RecentCaptureItemViewModel` before rendering.

The Media screen loads Recent Captures from the storage service instead of fixtures. It also listens for the `recent-captures:changed` browser event so a new native screenshot or clipboard import appears without reloading the whole app. Image previews resolve their URL with `storage.assets.url(assetId)`.

Native toolbar screenshots keep the normal screenshot fields plus `origin.engine: "xcap"`, the toolbar display name, and the actual crop rectangle in original-frame pixels. The uncropped frame and the transient PNG data URL are never durable records; only the uploaded asset and Recent Capture metadata are persisted.

Raw Recent Capture records are capture inbox items only. They are not automatically added to Prompt Library, Agent context, or a project canvas. Registration calls one transactional endpoint with Capture IDs, revisions, and user-confirmed Prompt fields; it creates Presets and updates `registeredPromptId` atomically. Single, separate-batch, and merged-batch modes all preserve the original `assetId` in `meta.media`.

Screenshot and pasted-image records can be placed on an active Free Canvas. Placement creates a new Canvas node but uploads no file and creates no asset row. `linkedProjectId` and `linkedCanvasNodeId` are independent from registration fields, so Canvas placement does not register a Prompt and cannot erase an existing registration.

The Recent Captures list keeps row selection separate from editing: selection updates the detail panel, while the explicit Edit action opens the analysis dialog. Its **Remove record** action calls the revision-checked Recent Capture DELETE endpoint. This removes only the inbox metadata row; Prompt media, Canvas nodes, the asset row, and the physical file remain unchanged. An asset with no remaining consumers is surfaced by diagnostics rather than deleted implicitly.

## Project Normalization

Project reads normalize data before returning it to the UI. Normalization includes:

- defaulting legacy projects to `type: "card"`
- ensuring `pages` and `cards` are arrays
- migrating legacy storyboard `rows` into `sequences`
- creating a missing `threeStage` payload for three-stage projects
- sorting by `lastOpenedAt`, then `updatedAt`

## Change Guidance

Storage changes should include tests for revision conflicts, Trash behavior, migration, Recent Capture metadata, asset diagnostics, and project normalization. Avoid writing project, preset, or Recent Capture data directly from UI components.

Quick-message changes do not require a storage-service schema change. They should be verified through preset-store migration tests, Prompt Library category filtering tests, quick-message note-retirement tests, and Free Canvas insertion tests.

Delayed saves must distinguish durable content from storage metadata. UI code should not apply a late storage response as a full project replacement after the user has continued editing. Preserve the current local payload, merge only safe metadata such as `revision` and `lastOpenedAt`, and update save status only when the response still matches the edit sequence that started the save.

## Project Write Coordination

All project creates, autosaves, manual saves, renames, and last-opened updates use the project save coordinator.

- Writes are isolated per project and strictly serial.
- The in-flight request, newest pending request, and retained failed request each own a complete project snapshot.
- Pending writes are coalesced by replacing them with the newest complete local snapshot, never by merging partial updates onto an older snapshot.
- Creation remains a single `POST`; edits made during creation wait for its revision and continue with `PUT`.
- On `409`, the coordinator adopts the server revision and retries the newest local snapshot up to three attempts.
- On network failure, local state is unchanged and the newest request is retained for a later flush.
- Save status is isolated by project and may become `saved` only when its edit sequence is current and its queue is empty.
- Revision and timestamp acknowledgements must not trigger another autosave by themselves.
