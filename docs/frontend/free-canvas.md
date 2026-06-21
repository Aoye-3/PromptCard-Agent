# Free Canvas Workspace

Free Canvas is a standalone builder project type: `IPromptProject.type === "free-canvas"`.
It is no longer a three-stage template variant and does not use `threeStage.pages`,
three-stage forms, Page constraints, or `threeStage.meta.freeCanvas` as its source of truth.

## Data Model

- Free Canvas content lives in `project.freeCanvas`.
- `IFreeCanvasProject.nodes` stores text, image, and arrow nodes.
- `IFreeCanvasProject.edges` stores user-created React Flow connections.
- The default project is empty: no nodes, no edges, no required Page/Form fallback.
- Old projects with `type: "three-stage"` and `meta.builderTemplateId: "free-canvas"` are migrated on load:
  - three-stage form outputs become normal text nodes;
  - legacy media nodes become standalone image/text/arrow nodes;
  - valid legacy edges are remapped to migrated node IDs.

## Text Nodes

Text nodes store visible text as ordered segments:

- `source: "preset"` segments are template text and default to red.
- `source: "user"` segments are user-authored text and default to black.
- The UI presents both as one editable-looking node; color is the only visible distinction.
- Agent edits are restricted to user segments through `free_canvas_text_update`.

Quick message presets are user-level local settings under `settings.meta.freeCanvasQuickTextPresets`.
Each preset is only a text string. Clicking a quick message creates a new text node with the
preset content as a red `preset` segment; later typing creates or updates black `user` text.

## Images and Edges

- Image uploads still go through the image asset service and store durable `assetId` references.
- Image nodes keep width, height, optional crop rectangles, and source node metadata.
- Removing any node removes connected Free Canvas edges.
- Deleting the final node is valid and leaves an empty canvas.

## Agent Context

Free Canvas uses `free-canvas-workspace` Agent context. The snapshot includes selected node,
all bounded nodes, edges, and text fields split into:

- `displayText`
- `presetText`
- `userText`
- `segments`

Builder chatboxes remain workspace scoped and do not grant Prompt Library write permissions.

## Verification

```powershell
npm.cmd run test -- --run src/domain/free-canvas/free-canvas-project.test.ts src/utils/agent-workspace.test.ts src/services/agent-runtime-service.test.ts src/utils/storage.test.ts
npm.cmd run build
```

Manual checks should cover creating an empty Free Canvas project, adding free text, adding a
quick-message text node, changing text size/color, deleting the last node, dropping an image,
connecting nodes, and approving a `free_canvas_text_update` proposal.
