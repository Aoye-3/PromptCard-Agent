# ADR-006: Register Captures Explicitly And Reuse One Asset Identity

## Status

Accepted

## Date

2026-07-14

## Context

Recent Captures is a fast, raw intake surface for native screenshots and clipboard images. Prompt Library is curated and Agent-visible, while Free Canvas is a project composition surface. Automatically treating every Capture as a Prompt would expose unreviewed material to Agent context and turn Prompt Library into a media dump.

The same image may be reviewed in Recent Captures, attached to a Prompt, and placed on Canvas. Uploading it again for each consumer would create duplicate asset rows and files, complicate diagnostics, and make deletion safety ambiguous. Batch registration also needs all-or-nothing behavior because a partially registered selection is difficult for the user to repair safely.

## Decision

Require an explicit, user-confirmed registration from Recent Captures to Prompt Library. Support one Prompt per Capture and one merged Prompt for multiple Captures through a single SQLite transaction. Validate every Capture revision, registration state, Prompt field, and asset record before committing any Preset or Capture update.

Use `registeredPromptId` as the authoritative registration link. Preserve Capture provenance under Prompt `meta.recentCaptureSources`, and place the existing Capture `assetId` directly in Prompt `meta.media`.

Free Canvas placement creates a unique node but retains the same `assetId`. Canvas linkage fields are independent of Prompt registration. Asset diagnostics must scan active and Trash Prompt presets, projects, and Recent Captures before reporting an asset as unreferenced.

Treat removal from the Recent Captures inbox as metadata removal, not asset deletion. The UI must call the action **Remove record**, require the current Capture revision, and leave Prompt media, Canvas nodes, the asset row, and physical bytes untouched. Permanent deletion is a separate future operation that must first enumerate every consumer and require an explicit cascading confirmation.

## Alternatives Considered

### Automatically create a Prompt for every Capture

- Pros: fewer clicks after capture.
- Cons: exposes unreviewed material to curated/Agent-visible storage and produces low-quality Prompt records.
- Rejected because crossing the raw-to-curated boundary must remain deliberate.

### Upload or copy the asset during registration and Canvas placement

- Pros: each consumer owns an independent file.
- Cons: duplicates bytes and asset rows, increases cleanup work, and breaks identity across the workflow.
- Rejected because all consumers can safely reference the immutable stored asset.

### Register batch items one by one

- Pros: simpler endpoint implementation.
- Cons: revision conflict or missing asset halfway through produces partial registration and unclear recovery.
- Rejected because a reviewed batch is one user action and must commit or fail as a unit.

### Delete the physical asset with the Recent Capture row

- Pros: immediate disk cleanup and a simpler user-facing concept of deletion.
- Cons: breaks Prompt and Canvas consumers that intentionally share the same `assetId`, and cannot be made safe without a complete dependency scan.
- Rejected because inbox cleanup must not silently corrupt curated or project content.

## Consequences

- Raw Recent Captures remain outside global Agent context.
- A Capture can register only once in the first version; users edit the created Prompt afterward.
- Registration requires current Capture revisions and returns updated Presets and Captures together.
- Prompt Library and Canvas do not upload or copy a Capture asset.
- Trashed Prompt presets continue to protect referenced assets from being reported as orphaned.
- Removing a Recent Capture can make an otherwise unused asset appear in diagnostics, but never deletes bytes implicitly.
- A future permanent-delete feature must be reference-aware and distinct from Remove record.
- If the product later needs one Capture linked to multiple Prompts, it requires a new relationship model rather than overloading `registeredPromptId`.

See [Recent Capture To Prompt Registration](../architecture/recent-capture-prompt-registration.md) for the runtime contract and metadata conversion.
