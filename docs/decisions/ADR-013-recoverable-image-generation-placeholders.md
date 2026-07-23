# ADR-013: Use Stable Run IDs For Recoverable Image Generation Placeholders

- Status: Accepted
- Date: 2026-07-19
- Owners: PromptCard frontend, Agent Runtime, and PromptCard Storage

## Context

The project Image Generation Agent originally created or placed an ordinary image node only after the synchronous Runtime request completed. While the provider was running, the canvas had no durable object representing the request. A user could not choose the future result's position, a failure had no stable canvas representation, and a reload could not reliably correlate the optimistic right-panel turn with the Storage run and pending placement.

The existing durable run and placement model already provides the recovery authority. The missing contract was one stable identity shared before the provider call and a placeholder that could be persisted without introducing a new canvas node kind or a new database schema.

The same repair exposed a separate boundary mismatch: Agent Runtime sent successful provider accounting as `providerUsage`, while PromptCard Storage accepts that state-patch field as `usage`. A provider response containing accounting data could therefore fail during terminal persistence after the output had already been localized.

## Decision

1. The foreground frontend generates `runId` before submission using the exact form `image-run-<32 lowercase hexadecimal characters>`. Runtime accepts this optional value, validates it strictly, and uses it unchanged. Runtime still generates an ID when legacy callers omit it.
2. After local validation and reference preparation, the frontend creates one ordinary image placeholder with ID `free-image-generation-${runId}` and persists the project before invoking Runtime. A failed placeholder save stops the workflow before any provider request.
3. The durable node metadata is `generationRunId`, `conversationId`, `generationState`, `generationErrorCode` when failed, `source: image-generation-conversation`, and `generatedResult: true` only when succeeded.
4. Running placeholders are movable and resizable but not deletable. Image editing and secondary-creation controls remain unavailable until the node reaches a terminal state.
5. Success fills the matching node in place and changes only its local asset fields and generation metadata. Failure retains the matching node and a normalized safe error code. Neither transition replaces the node frame or silently retries the provider.
6. Project-load reconciliation reads durable runs by `generationRunId`. Pending placement processing hydrates an existing matching node and persists it before marking the placement `placed`. It creates a result node only when an older successful run has no placeholder. Repeated reconciliation is idempotent.
7. Successful Runtime state patches send optional provider accounting through the Storage field `usage`. `providerUsage` is not a parallel compatibility alias.
8. The image-generation HTTP endpoint remains synchronous, and the Storage schema and existing run state machine remain unchanged.

## Consequences

- The run identity now spans the optimistic turn, canvas node, Runtime request, Storage run, output asset, and placement without an ID-replacement step.
- Users can arrange the pending result and keep that frame when the generated asset arrives.
- Running, succeeded, and failed states recover from project data plus Storage after a reload; legacy runs still place successfully through the fallback path.
- Project persistence is now a prerequisite for spending provider capacity on a foreground generation request.
- A terminal failed placeholder remains user-visible until the user deletes it or explicitly retries from history as a new run.
- Old clients that omit `runId` remain supported, but they do not gain the pre-request placeholder correlation automatically.

## Alternatives considered

### Replace the synchronous endpoint with `202 Accepted` and polling

Rejected for this repair because durable runs and placements already support recovery. Changing the transport would expand the API and cancellation semantics without being required for a movable placeholder.

### Create the canvas node only from the completion callback

Rejected because it provides no stable position or failure object during the provider request and still depends on in-memory completion.

### Use a temporary frontend ID and replace it with the Runtime ID

Rejected because ID replacement complicates optimistic history, node updates, placement deduplication, and reload recovery. One stable ID removes that join.

### Remove the placeholder on failure

Rejected because it hides where the requested result belonged and removes useful failure feedback. Failed nodes are terminal and deletable instead.

## Relationship to earlier decisions

This ADR extends [ADR-010](./ADR-010-project-image-generation-conversations.md). Durable pending placement remains the recovery authority for successful conversation runs; the new placeholder is the foreground representation that can be hydrated by that placement rather than a competing placement mechanism.
