# ADR-014: Keep Subject And Material Libraries Project-Scoped

## Status

Accepted

## Date

2026-07-23

## Context

Free Canvas needs reusable images without creating an implicit global media pool. Subjects must be available as explicit image-generation references, while ordinary materials are a visual organization aid and canvas-placement source.

## Decision

- Store folders and resources in independent SQLite schema-v7 tables keyed by `project_id`.
- Reject every resource read or write unless the owning project is active. Missing, trashed, and cross-project identifiers all surface as `404`.
- Keep a subject as one image with no folder. A subject can be explicitly appended to the current Composer draft as a `reference-image`; this opens the image-generation panel but never submits a request.
- Keep materials in an arbitrary-depth `parent_id` folder tree. Folders are metadata only: moving a resource changes visual organization and does not copy or move asset bytes.
- Give material cards a project-scoped native drag payload in addition to the existing library-layout payload. Dropping a material from the active project onto the canvas copies its preview identity and saved dimensions into a normal image node at the pointer location; it does not upload another asset, move the resource row, or change folder layout. Subject cards never expose this canvas-placement payload.
- Keep external-file drops partitioned into three independent surfaces: the expanded resource-list content imports into the active Subject/Material library location, the central canvas creates ordinary image nodes, and the right image-generation workbench appends reference images to the current Composer draft. A handled drop must not bubble into another surface, and no drop submits an image-generation request.
- Preserve resource rows while a project is in Trash and cascade-delete their metadata only when the project row is permanently deleted.
- Strongly reference original, preview, and provider-input assets. Deleting a resource removes only its metadata row.
- Submit drag-and-drop layout changes in one optimistic-concurrency transaction. Any stale revision rejects and rolls back the entire layout.

## Alternatives Considered

### Global shared library

- Advantage: one upload could be reused across every project.
- Rejected: it weakens the explicit project boundary, makes deletion ownership ambiguous, and risks accidental cross-project context in image generation.

### Store resources inside project JSON

- Advantage: no new tables or API surface.
- Rejected: folder/layout edits would contend with full project saves, asset diagnostics could not query references directly, and atomic revision checks would apply at the wrong granularity.

### Add a drag-and-drop dependency

- Advantage: richer sensors and sortable primitives.
- Rejected: the required folder and card interactions fit the repository's existing native HTML drag-and-drop pattern and do not justify another runtime dependency.

## Consequences

Projects cannot see, attach, or place another project's resources, and there is no global sharing workflow. The frontend owns transient expansion, folder-collapse, hover-preview, per-surface file-drop overlays, and internal resource-drag state; these reset when entering or switching projects and must also clear after a completed or cancelled drop. Cross-project sharing or multi-image subject groups require a separate decision.
