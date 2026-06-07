# Builder Template Library

## Purpose

The builder template library is the frontend display surface for prompt-building modes. It is a page inside the Projects area, not a modal, so the app header, bottom navigation, and project utilities remain visible. It is not the Prompt Library preset store and it should not own editor state.

Current builder templates live in `src/domain/builder-templates/builder-templates.ts`. Each template represents a parent prompt-building mode module, such as card builder, storyboard builder, or three-stage builder. A parent mode can declare child modules that compose its workflow.

## Architecture Boundary

The intended boundary is:

```text
builder template registry -> template library page -> project creation adapter -> builder screen
```

The registry describes available parent modes and their child modules. The template library page lists available modes and renders an interactive temporary preview of the selected mode in the main workspace. The project creation adapter creates the right `IPromptProject` shape from a selected template id, optionally seeded from that template's temporary preview snapshot. Builder screens continue to own editing behavior.

Do not couple these layers:

- Builder template definitions must not import React components.
- Project creation should branch on the selected template id or project type in one adapter, not inside every button.
- New builder modes should register a parent template and module tree first, then add a creation adapter and screen route.

## Interactive Temporary Preview

`TemplateLibraryScreen` uses `BuilderModePreviewFrame` to render the real builder surface for each builder mode in preview mode. The preview is intentionally temporary:

- Users can edit fields, add cards/rows/pages, and try normal prompt-building interactions.
- Each template id owns a separate in-memory preview snapshot while the template library page is mounted.
- Clicking "create from this template" seeds the new project from the active template's temporary snapshot.
- Leaving the template library clears those temporary snapshots because they are held only in `TemplateLibraryScreen` state.
- Preview save actions are disabled/no-op and must not call project storage, prompt history storage, autosave, or file persistence.
- Agent Runtime side-effect surfaces stay disabled in preview mode; local prompt injection and structured editing remain available.

This keeps browsing and try-before-create behavior useful without writing durable data before the user explicitly creates a project.

## Module Model

A builder template has:

- stable `id`
- target `projectType`
- display metadata for the library
- default project title prefix
- capability labels
- `modules`, a tree of reusable parent/child prompt-building modules

This keeps “which modes exist” separate from “how a mode edits state.” Future custom mode persistence should store serializable builder module definitions, not copied editor component logic.

## Current Templates

- `free-canvas`: top-level free canvas builder backed by a three-stage project. It uses React Flow for the production canvas and stores PromptCard-owned media nodes in project metadata. tldraw is only a reference for shape/store design and must not be added as a production dependency without a separate licensing decision.
- `card`: card-page workspace with card fields, prompt injection adapter, and Agent collaboration adapter.
- `storyboard`: storyboard sequence workspace with shot fields and Agent detail workspace.
- `three-stage`: three-section workspace with field editor and field-level prompt injection adapter.

## Free Canvas Template Contract

`free-canvas` intentionally keeps `projectType: "three-stage"` and writes `meta.builderTemplateId: "free-canvas"` during project creation. This avoids a storage migration while allowing the app router to open the free canvas screen instead of the standard three-stage screen.

The free canvas screen treats `threeStage.pages/items/forms` as the source of truth. React Flow nodes and edges are a view projection:

- form node positions are stored in each form's `meta.canvas.position`;
- media nodes are stored under `threeStage.meta.freeCanvas.mediaNodes`;
- media nodes are project-local and do not grant Prompt Library write permissions;
- future image API outputs should be inserted as `imageAsset` media nodes with provenance metadata.
