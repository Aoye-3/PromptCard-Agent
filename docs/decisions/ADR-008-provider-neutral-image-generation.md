# ADR-008: Isolate Image Providers Behind Model Slots And Durable Local Runs

## Status

Accepted

## Date

2026-07-15

## Context

PromptCard needs image generation inside Free Canvas without binding project files or UI components to one provider. The first implementation uses Doubao Seedream 5.0 Pro, but later providers must be replaceable without rewriting node persistence, prompt references, history, or media reuse.

The integration also has two durable security requirements:

- provider credentials must never enter browser storage, project JSON, PromptCard SQLite, logs, or generated history;
- every generation attempt must remain auditable after node or project deletion, without retaining provider temporary URLs.

## Decision

Use four provider-neutral model-management concepts:

- `ProviderDefinition` identifies a provider and its fixed trusted endpoint;
- `ModelCatalogEntry` declares modality and capabilities;
- `ModelConnection` stores non-secret connection metadata plus a `credentialRef`;
- `ModelAssignment` binds stable use-case slots such as `chat.primary` and `image.primary`.

Secrets are stored only through the operating-system keyring. The browser sends a credential only while creating or updating a connection; responses expose only `credentialConfigured` and a non-secret mask.

Free Canvas persists a normalized `image-generator` node and structured prompt/reference intent. Agent Runtime validates that intent, resolves the assigned connection, reads the credential only after validation, and translates the request through an `ImageGenerationProvider` adapter. Seedream-specific SDK fields remain inside its adapter.

PromptCard Storage schema v3 owns append-only `image_generation_runs`. Runs follow `queued -> running -> succeeded|failed`; terminal records have no ordinary update or delete path. Successful output is localized as a normal asset and `generatedResult` Recent Capture before the run becomes `succeeded`. Project or node deletion does not delete runs or their output assets.

New generation is protected by both the UI flag `imageGenerationNodeV1` and the server flag `PROMPTCARD_IMAGE_GENERATION_NODE_V1`. Disabling either gate stops new requests without making existing history or media unreadable.

## Alternatives Considered

### Store API Keys In Browser Settings

- Pros: fewer backend endpoints and simpler early UI wiring.
- Cons: exposes secrets to localStorage/IndexedDB, browser logs, extensions, and accidental project export.
- Rejected: violates the credential boundary and makes secure desktop migration impractical.

### Use Environment Variables As The Model Registry

- Pros: conventional for a single headless service.
- Cons: cannot safely manage multiple named connections or model assignments, and forces credentials to exist at process startup.
- Rejected: PromptCard must start without credentials and retrieve them only for a validated invocation.

### Build A Seedream-Specific Canvas Node And API

- Pros: fastest path for one provider.
- Cons: provider parameters would leak into project persistence and UI branching, making replacement expensive.
- Rejected: the node stores normalized intent and capabilities; the adapter owns provider translation.

### Store Generation History Inside Project JSON

- Pros: no new Storage schema.
- Cons: deleting or overwriting a project would destroy audit history, and large histories would inflate every project save.
- Rejected: generation history is an independent consistency boundary with its own pagination and asset references.

## Consequences

- Adding a provider requires catalog metadata, a provider adapter, endpoint/output-host policy, and contract tests; it does not require a new canvas node schema.
- Keyring availability is an operational prerequisite for saving credentials. There is no plaintext fallback.
- Storage schema v3 is forward-only. Application rollback must keep v3 history readable.
- Permanent history consumes disk until a separately designed compliance-erasure workflow exists.
- Seedream 5.0 Pro currently advertises only the implemented 1K/2K, single-output, non-streaming contract. Unsupported 4K, native mask, cancellation, sequential, and grouped output features must not appear in the UI.
