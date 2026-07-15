# Image Generation and Model Management

## Scope and invariants

PromptCard uses provider-neutral model connections and durable, local image-generation history. Canvas nodes bind `connectionId + modelId`; the browser never receives a provider credential or talks directly to a provider SDK.

The Gateway must start, report health, and serve the model catalog without any configured credential. Credentials are read only for a valid model invocation. A valid request with no credential fails as `credential_missing`; keyring failure is `credential_store_unavailable`.

## Data flow

1. The canvas submits a normalized prompt document, local reference `assetId` values, optional point/bounding-box regions, resolution, output format, `connectionId`, and `modelId` to the PromptCard Runtime Boundary.
2. The Gateway creates a queued run in PromptCard Storage, transitions it to running, then validates connection metadata, catalog capability, prompt/region references, and decoded local image assets.
3. Only after validation does the Gateway retrieve the connection credential from the operating-system keyring and construct the selected provider adapter.
4. The Seedream adapter compiles ordered image mentions and region markup, then calls the Volcengine Ark SDK.
5. The result fetcher accepts only the exact official HTTPS CDN host, revalidates and pins a public DNS address on every redirect hop, preserves Host/TLS SNI, limits downloads to 25 MB and 40 megapixels, and verifies PNG/JPEG/WebP bytes with Pillow.
6. PromptCard Storage stores the generated file as a local asset, creates a `generatedResult` Recent Capture, and commits the run as succeeded. Failures commit a normalized failed state. Provider URLs and credentials are never persisted.

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

PromptCard Storage migrates schema v2 to v3 in place by creating `image_generation_runs` and its project/node order indexes, then recording migration 3. The migration does not delete projects, captures, presets, or assets.

## History capacity, backup, and restore

Generation runs use `queued -> running -> succeeded|failed`; terminal rows are immutable. They remain queryable after a canvas node or project is removed because history is an independent consistency boundary. List requests are cursor-paginated and accept 1-100 rows per page. There is no automatic total-count or age-based pruning, so permanent-history capacity is the available disk space for SQLite plus generated assets.

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

## Common operational errors

| Code | Meaning / action |
| --- | --- |
| `credential_missing` | Configure the selected connection; startup remains healthy. |
| `credential_store_unavailable` | Fix/unlock the OS keyring and rerun `agent:check`. |
| `connection_disabled`, `provider_model_mismatch` | Enable the connection or bind a model belonging to that provider. |
| `unsupported_resolution`, `too_many_images`, `missing_reference`, `region_coordinate_out_of_range` | Correct the request before credential access/provider invocation. |
| `rate_limited`, `timeout`, `provider_request_failed` | Retry according to `retryable`; inspect provider account/quota without logging secrets. |
| `unsafe_image_url`, `image_download_failed`, `invalid_image_data` | Provider output failed the remote-result security/decoding boundary. |
| `storage_write_failed`, `terminal_persistence_failed` | Verify PromptCard Storage health and disk space before retrying. |

## Adding a second image provider

1. Add provider metadata and model capability records to the catalog. Keep UI decisions capability-based rather than branching on provider names.
2. Implement `ImageGenerationProvider` to translate the normalized request, compile provider-specific prompts, enforce output count, and normalize errors without raw secrets.
3. Extend the provider factory/connection validation for the new provider. Keep credential access behind `ConnectionResolver` and keyring.
4. Add an exact result-host allowlist or a provider-owned localization strategy; never weaken DNS pinning, redirect checks, byte/pixel limits, or MIME/decode validation.
5. Add contract, adapter, orchestration, redaction, and end-to-end tests before exposing the model in the canvas.
6. Document capability differences and operational dependencies here and in the backend catalog docs.

## Rollout and rollback

Use the hidden `imageGenerationNodeV1` feature flag to stage UI exposure: catalog/model migration first, mock-provider verification second, then the real node only when `image.primary` has a valid connection. Disabling the flag or provider entry stops new UI generations but leaves catalog-compatible connection metadata, run history, Recent Captures, and assets readable.

Never roll PromptCard Storage back from schema v3 to v2. A code rollback must preserve forward-compatible reading of the v3 table or keep the current Storage service running until compatible code is restored.
