# Image Generation and Model Management

## Scope and invariants

PromptCard uses provider-neutral model connections and durable, local image-generation history. New work is submitted from the project-level Image Generation Agent tab; a conversation turn binds `connectionId + modelId` and is independent from every earlier turn. Legacy `image-generator` canvas nodes are read-only previews. The browser never receives a stored provider credential or talks directly to a provider SDK. [ADR-008](../decisions/ADR-008-provider-neutral-image-generation.md) records the provider boundary, while [ADR-010](../decisions/ADR-010-project-image-generation-conversations.md) records the conversation and placement boundary.

The Gateway must start, report health, and serve the model catalog without any configured credential. Credentials are read only for a valid model invocation. A valid request with no credential fails as `credential_missing`; keyring failure is `credential_store_unavailable`.

The Agent panel separates `Text models` and `Image generation models`, but both pages consume one provider-neutral snapshot of providers, catalog entries, connections, and assignments. Each page filters by modality and owns its default slot (`chat.primary` or `image.primary`). The Ark endpoint is fixed and read-only in the normal UI; connection forms support cancel, save-only, and save-and-test.

The model catalog is the only source of frontend capability controls. Inspector code must not infer ratios, resolutions, region tools, formats, or reference limits from the Seedream model ID. [ADR-009](../decisions/ADR-009-capability-driven-image-model-readiness.md) records the readiness and diagnostics boundary.

## Readiness and diagnostics

An assignment is valid only when all of these conditions hold:

1. The connection is enabled and has a keyring credential.
2. Provider, model, modality, and assignment slot match.
3. The persisted latest connection test succeeded.
4. The provider runtime dependency is ready; Ark requires the exact compatible SDK version.

Changing provider, API base, credential, or enabled state invalidates the recorded test result. Test results do not expire by time; a later material configuration change or explicit test replaces them.

`GET /api/promptcard/runtime/image-generation-status` performs read-only re-detection. It reports the Runtime flag, keyring availability, provider readiness, and Ark package/installed/required/compatible state. It never installs dependencies or returns a command, local path, stack, credential, or raw provider body. Provider readiness is `ready`, `missing`, `incompatible`, or `check_failed`.

Connection deletion is dependency-aware. Assignment references are authoritative, while the current Gateway cannot yet query all canvas-node references from PromptCard Storage. It therefore reports `canvasNodeCount: null` and `canvasNodeCountAvailable: false`; the frontend fails closed instead of treating an unknown count as zero.

## Data flow

1. The project Image Generation tab submits only the current turn's normalized prompt document, local reference `assetId` values, optional point/bounding-box regions, resolution, output format, `connectionId`, `modelId`, and `conversationId` through the browser boundary `POST /agent-api/promptcard/runtime/image-generations`. The Gateway owns the internal `/api/promptcard/runtime/image-generations` route. Browser code must not send Runtime requests through Vite's vendor-facing `/api` proxy. It does not send prior messages. Legacy callers may send `nodeId` instead. The Runtime generates the immutable run ID; clients do not choose it.
2. The Gateway creates a queued run in PromptCard Storage, transitions it to running, then validates connection metadata, catalog capability, prompt/region references, decoded local image assets, and request limits.
3. Only after validation does the Gateway retrieve the connection credential from the operating-system keyring and construct the selected provider adapter.
4. The Seedream adapter compiles ordered image mentions and region markup, then calls the Volcengine Ark SDK.
5. The result fetcher accepts only the exact official HTTPS CDN host, revalidates and pins a public DNS address on every redirect hop, preserves Host/TLS SNI, limits downloads to 25 MB and 40 megapixels, and verifies PNG/JPEG/WebP bytes with Pillow.
6. PromptCard Storage stores the generated file as a local asset, creates a `generatedResult` Recent Capture, and commits the run as succeeded. Failures commit a normalized failed state. Provider URLs and credentials are never persisted.

The request may contain at most ten total input images and 50 MB of loaded input asset bytes. The Runtime permits two concurrent generations per connection and four globally. These are trusted server limits; frontend validation is only an earlier usability check.

Run snapshots and API errors may contain technical identifiers and normalized error codes, but never credentials, authorization headers, provider URL query strings, local filesystem paths, or raw exception text.

## Credential storage and platform requirements

Connection metadata lives at `$DEER_FLOW_HOME/promptcard-model-connections.json`. It contains provider/model assignments and a `credentialRef`; the secret is stored by Python `keyring` under service `dev.promptcard.manager.shell` and username `connection:<connectionId>`.

The runtime account must have an available keyring backend:

- Windows: Credential Locker for the same interactive user that runs the Gateway.
- macOS: Keychain access for the Gateway user.
- Linux: an unlocked Secret Service or KWallet session. Headless services need an explicitly provisioned supported backend; plaintext fallback is not acceptable.

Run `npm.cmd run agent:check`. It imports `keyring` and the Ark SDK and prints a workspace-local repair command if dependencies are incomplete. The command sets `UV_CACHE_DIR`, `UV_PYTHON_INSTALL_DIR`, and `UV_PROJECT_ENVIRONMENT` inside this F: repository before running `uv sync`.

Do not use `API-Key.txt`, parse `sk-` strings, set `DEEPSEEK_API_KEY`/`ARK_API_KEY` in maintained PromptCard launchers, or persist credentials in `.env`, localStorage, IndexedDB, project JSON, SQLite, logs, or generated assets.

## Migration and transactional rollback

Legacy `$DEER_FLOW_HOME/promptcard-model-config.json` data is migrated idempotently into a deterministic DeepSeek connection plus the `chat.primary` assignment. When the legacy record contains `apiKey`, migration writes it to keyring, verifies both keyring and connection state, then removes `apiKey` from the legacy JSON. If any step fails, connection bytes, the legacy file, and the previous keyring value are restored; an incomplete rollback is surfaced explicitly.

PromptCard Storage migrates schema v3 to v4 in place by adding permanent project conversations, nullable `conversation_id`/`node_id` run ownership, project/conversation indexes, and canvas placements. Old runs are deterministically grouped by `projectId + nodeId`; migration never creates placement work for old successful runs. The migration does not delete projects, captures, presets, or assets and must not be rolled back to v3.

## History capacity, backup, and restore

Generation runs use `queued -> running -> succeeded|failed`; terminal rows are immutable. Project conversations are projections over immutable run snapshots rather than a duplicated chat transcript. A blank conversation exists only in frontend memory; its first queued run and conversation row are created in one Storage transaction. Conversations and runs remain queryable after a canvas node or project is removed because history is an independent consistency boundary. List requests are cursor-paginated and accept 1-100 rows per page. There is no automatic total-count or age-based pruning, so permanent-history capacity is the available disk space for SQLite plus generated assets.

Each successful conversation run creates a `pending` canvas placement. When that project is active, the frontend checks for an existing ordinary image node with the same `generationRunId`, creates one near the real viewport center only when absent, persists the project, and advances the placement to `placed`. Returning to a project resumes pending work; deleting an already placed node never reopens the placement. Canvas selection, edge changes, reload, and node edits never invoke the provider.

PromptCard Storage backups include the SQLite database, assets directory, and a manifest. From the repository root:

```powershell
python -m promptcard_storage.maintenance --data-dir data backup backups\manual-image-generation
python -m promptcard_storage.maintenance --data-dir data restore backups\manual-image-generation
```

Stop writers before restore. Restore validates schema/integrity and creates a pre-restore snapshot when live storage exists. The Storage backup does not contain operating-system keyring secrets or `$DEER_FLOW_HOME/promptcard-model-connections.json`; after moving to another OS user/profile, restore non-secret connection metadata separately and re-enter credentials through model management.

## Seedream 5.0 Pro contract

| Capability | Supported contract |
| --- | --- |
| Modes | `generate`, `edit`, `region-edit` |
| Reference images | 0-10, unique `referenceId` and order; prompt mentions compile to ordered image labels |
| Regions | point or bounding box, integer coordinates 0-999; bounding-box minimums must be less than maximums |
| Resolution | 1K or 2K |
| Output | exactly one PNG or JPEG; no streaming |
| Watermark | boolean request option |
| Native mask/cancel/4K | not advertised by the current adapter |

Region edit uses Seedream prompt markup tied to a reference image. It is not a native binary mask-upload workflow.

The frontend exposes four user workflows over the three provider modes:

- text to image -> `generate` without required image input;
- reference generation -> `generate` with ordered reference images;
- smart edit -> `edit` with a source image;
- region edit -> `region-edit` with a source image and point/bounding-box instruction.

A non-empty local PromptDocument overrides an upstream prompt connection; upstream text is used only when the local document is empty. Structured `@` tokens persist stable `referenceId` values. Reordering modifies `inputOrder`, and the Runtime compiler derives the current `图N` labels from that order.

## Common operational errors

| Code | Meaning / action |
| --- | --- |
| `credential_missing` | Configure the selected connection; startup remains healthy. |
| `credential_store_unavailable` | Fix/unlock the OS keyring and rerun `agent:check`. |
| `connection_disabled`, `connection_not_tested`, `connection_test_failed` | Enable and successfully test the selected connection before assigning it. |
| `assignment_missing`, `provider_model_mismatch` | Select a compatible provider/model for the requested modality slot. |
| `ark_sdk_missing`, `ark_sdk_incompatible`, `ark_sdk_check_failed` | Repair the workspace-managed dependency outside the API, then re-run diagnostics. |
| `invalid_size`, `invalid_input`, `missing_reference`, `region_coordinate_out_of_range` | Correct the request before credential access/provider invocation. |
| `rate_limited`, `timeout`, `service_unavailable`, `generation_failed` | Retry according to `retryable`; inspect provider account/quota without logging secrets. |
| `unsafe_image_url`, `image_download_failed`, `invalid_image_data` | Provider output failed the remote-result security/decoding boundary. |
| `storage_write_failed`, `terminal_persistence_failed` | Verify PromptCard Storage health and disk space before retrying. |
| `image_generation_disabled` | Enable the trusted server rollout flag only after dependencies and a connection are ready. |
| `input_images_too_large` | Reduce the aggregate bytes of all source/reference images below 50 MB. |
| `generation_busy`, `generation_capacity_reached` | Wait for the per-connection or global concurrency slot to become available. |

## Adding a second image provider

1. Add provider metadata and model capability records to the catalog. Keep UI decisions capability-based rather than branching on provider names.
2. Implement `ImageGenerationProvider` to translate the normalized request, compile provider-specific prompts, enforce output count, and normalize errors without raw secrets.
3. Extend the provider factory/connection validation for the new provider. Keep credential access behind `ConnectionResolver` and keyring.
4. Add an exact result-host allowlist or a provider-owned localization strategy; never weaken DNS pinning, redirect checks, byte/pixel limits, or MIME/decode validation.
5. Add contract, adapter, orchestration, redaction, and end-to-end tests before exposing the model in the canvas.
6. Document capability differences and operational dependencies here and in the backend catalog docs.

## Rollout and rollback

New generation requires both rollout gates:

- frontend user settings: `meta.featureFlags.imageGenerationNodeV1 === true`;
- Agent Runtime environment: `PROMPTCARD_IMAGE_GENERATION_NODE_V1=true`.

The Runtime itself treats an absent server flag as disabled and checks it before run creation, credential access, or provider invocation. The combined development launcher sets the server flag to `1` when no explicit override is present; production deployment must opt into its own rollout. The frontend flag defaults on in development and off in production unless a persisted setting overrides it. Run `npm.cmd run agent:check`, create and successfully test a Volcengine Ark connection, and assign it to `image.primary` before real-provider smoke testing. Disabling either gate stops new UI generations but leaves existing nodes, connection metadata, run history, Recent Captures, and assets readable.

Never roll PromptCard Storage back from schema v4 to v3. A code rollback must preserve forward-compatible reading of conversations, runs, and placements or keep the current Storage service running until compatible code is restored.
