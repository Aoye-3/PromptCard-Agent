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

### Interaction Rules

- Empty canvas left-drag creates a React Flow selection rectangle for multi-select.
- Hold `Space` while left-dragging the empty canvas to pan the viewport.
- Node dragging remains enabled from the node body when the node is not in an editing state.
- Text node toolbars are single-selection only. Multi-select must not show per-node edit controls.
- Text nodes created from quick messages start selected but not editing, so they can be moved or deleted immediately.
- Empty text nodes created from the toolbar still enter editing mode immediately.

## Images and Edges

- Image uploads still go through the image asset service and store durable `assetId` references.
- Image nodes keep width, height, optional crop rectangles, source node metadata, and image-local annotations.
- The bottom toolbar exposes `Image`, not `Arrow`. `Image` opens a local file picker for PNG, JPEG, and WebP files.
- Multiple selected image files are uploaded through the same path as drag/drop images and become multiple image nodes with the existing upload offset behavior.
- Image nodes render only the image body. The canvas UI may show a selection ring or React Flow handles, but the node does not add a white card background or padding around the image content.
- Single selected image nodes expose a compact node toolbar with only `Edit image annotations` and `Crop image`.
- Image resizing uses React Flow `NodeResizer` with aspect-ratio preservation. Resize commits write back the image node frame, while image-local annotations keep their normalized positions.
- Existing `arrow` nodes remain supported for loading, rendering, and deletion, but the UI no longer has an active arrow creation button.
- Removing any node removes connected Free Canvas edges.
- Deleting the final node is valid and leaves an empty canvas.

## Image Annotations

`ImageAnnotationEditor` owns all editable image annotation interactions. The canvas image node itself only displays saved annotations and must not host inline inputs, drawing gestures, or draggable annotation controls.

Supported annotation kinds:

- `text`: movable text box with editable content.
- `rect`: white rectangle overlay with resize handles.
- `arrow`: two-point arrow created by press-drag-release.
- `freehand`: freehand path created by press-drag-release.
- `shotNumber`: black square with editable white number text.

Annotation coordinates are normalized to the image bounds (`0..1`) and live in `IFreeCanvasImageNode.annotations`. They are not independent React Flow nodes. Moving or resizing the image node must preserve each annotation's relative placement.

The editor uses a type-mode filter:

- Opening the editor starts with no active annotation mode.
- Toolbar buttons only enter a mode; they do not create annotations directly.
- In `text`, `rect`, or `shotNumber` mode, clicking empty image space creates that kind of annotation.
- In `arrow` or `freehand` mode, press-drag-release on empty image space creates the annotation.
- Only annotations whose `kind` matches the active mode can be selected, moved, resized, edited, or deleted.
- Other annotation kinds remain visible but are pointer-inert and show no selection frame, delete button, resize handles, or arrow endpoints.

The editor uses local draft history. Undo/redo, creation, move, resize, delete, freehand completion, and arrow completion update only the modal draft until `Save annotations` replaces the image node annotations. `Cancel` discards the draft.

Keyboard and pointer events are isolated while the annotation or crop modal is open:

- React Flow deletion is disabled with `deleteKeyCode={null}` while a modal is open.
- The modal captures keyboard, pointer, mouse, and click events so they do not reach the canvas.
- `Delete` / `Backspace` delete only the selected annotation of the current mode.
- Text and shot-number inputs keep normal text-editing behavior for `Delete` / `Backspace`.
- Arrow and freehand drawing or movement must end on `pointerup`, `pointercancel`, `lostpointercapture`, `blur`, or when pointer movement reports no pressed buttons.

## Image Cropping

Double-clicking an uncropped image node with an `assetId` opens `ImageCropEditor`.

The crop editor uses edge-pull behavior:

- Drag from the left or right image edge to create a vertical crop line.
- Drag from the top or bottom image edge to create a horizontal crop line.
- Drag an existing crop line to reposition it.
- Double-click a crop line, or drag it back to the outer edge, to remove it.
- Confirming creates new image nodes from the crop grid and preserves the source asset reference.

The editor is an adapter around the legacy `FreeCanvasMediaNode` crop utility. Free Canvas project data still stores the resulting nodes as `IFreeCanvasImageNode`; no new image node schema is introduced.

## Agent Context

Free Canvas uses `free-canvas-workspace` Agent context. The snapshot includes selected node,
all bounded nodes, edges, and text fields split into:

- `displayText`
- `presetText`
- `userText`
- `segments`

Builder chatboxes remain workspace scoped and do not grant Prompt Library write permissions.

## Right Panel Prompt Library Preview

The Free Canvas right panel has an `Agent` / `Prompt库` segmented switcher.

- `Agent` keeps the existing `free-canvas-workspace` Agent chat flow.
- `Prompt库` embeds the reusable prompt library preview panel.
- Prompt library preview supports search, category filters, preset/media preview, and copy actions.
- Prompt clicks open `PromptPresetPreviewDialog`; they do not insert text into the canvas or fill the Agent input.
- Management functions such as edit mode, add-to-library, Trash, and Agent ingestion are intentionally hidden in the embedded preview.
- `previewMode` still disables Agent Runtime, while Prompt library preview can read locally available presets.

## Verification

```powershell
npm.cmd run test -- --run src/domain/free-canvas/free-canvas-project.test.ts src/utils/agent-workspace.test.ts src/services/agent-runtime-service.test.ts src/utils/storage.test.ts
npm.cmd run test:e2e -- free-canvas-image-crop.spec.ts
npm.cmd run test:e2e -- free-canvas-text-node.spec.ts
npm.cmd run build
```

Manual checks should cover creating an empty Free Canvas project, adding free text, adding a
quick-message text node, changing text size/color, selecting multiple nodes, deleting the last
node, adding images by toolbar/drag/paste, resizing a single selected image, opening the image
annotation editor, verifying mode-filtered annotation editing, checking that modal `Delete` never
deletes the image node, confirming arrow/freehand gestures stop on pointer release, cropping an
image from each edge direction, connecting nodes, switching the side panel between Agent and
Prompt library preview, and approving a `free_canvas_text_update` proposal.
