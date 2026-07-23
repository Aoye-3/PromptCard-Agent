# Free Canvas Workspace

Free Canvas is a standalone builder project type: `IPromptProject.type === "free-canvas"`.
It is no longer a three-stage template variant and does not use `threeStage.pages`,
three-stage forms, Page constraints, or `threeStage.meta.freeCanvas` as its source of truth.

## Data Model

- Free Canvas content lives in `project.freeCanvas`.
- `IFreeCanvasProject.nodes` stores text, image, arrow, and provider-neutral `image-generator` nodes.
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
- Agent edits are restricted to user segments through `free_canvas_text_update`. When no text node is selected, the Agent may instead propose `free_canvas_text_create`.

Quick messages are Prompt Library presets in the dedicated `quick-message` category. Clicking a
quick message creates a new text node with the preset content as a red `preset` segment; later
typing creates or updates black `user` text.

Quick-message reference media belongs to Prompt Library preview (`meta.media`). It is not inserted
into the canvas when a quick message is clicked.

Legacy quick messages from `settings.meta.freeCanvasQuickTextPresets` are read as a compatibility
source and migrated into Prompt Library presets with `meta.quickMessage.legacyId`. New quick
message creates, edits, deletes, Trash, and restores use the Prompt Library preset store.

Quick-message notes are historical only. The Free Canvas drawer and lightweight quick-message
dialog show and edit only the name and template body; they do not display or write
`meta.quickMessage.note`.

### Interaction Rules

- Empty canvas left-drag creates a React Flow selection rectangle for multi-select.
- Hold `Space` while left-dragging the empty canvas to pan the viewport.
- Node dragging remains enabled from the node body when the node is not in an editing state.
- Text node toolbars are single-selection only. Multi-select must not show per-node edit controls.
- Text node toolbars expose Edit, Copy, font size, and user-text color controls. Copy writes the ordered visible text segments to the clipboard and preserves segment newlines.
- The text node font-size selector keeps the stored `small`, `medium`, `large`, `extra-large`, and `huge` values while rendering with high-contrast closed-state text on the dark toolbar.
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

## Project Image Generation Agent And Legacy Nodes

The right rail has three peer tabs: `Agent | 图片生成 | Prompt库`. `图片生成` is a project-level task Agent UI backed directly by the image Runtime; it does not call the text LLM. Every send is one independent image request. Previous turns are displayed from immutable run snapshots and are never appended to the next provider request.

The browser reaches the local Runtime through `/agent-api/promptcard/runtime/image-generations`. The Runtime itself owns `POST /api/promptcard/runtime/image-generations`; browser code must not send that path through Vite's vendor-facing `/api` proxy.

The bottom toolbar action is `打开图片生成`. It only opens the project Image Generation tab and starts an in-memory blank draft; it never creates an `image-generator` node and is not draggable. A conversation row is created only when the first queued run is persisted.

The Image Generation tab contains a model-readiness header, new-conversation and project-history actions, chronological turn cards, and a fixed 520 px right-rail Composer. The Composer is one visual surface: an attachment strip, one textarea, and one bottom toolbar. Workflow, ready model, ratio/resolution/custom size, output format, prompt optimization, and watermark settings open in anchored popovers instead of occupying permanent vertical space. It supports local uploads, explicit injection of the current React Flow selection, and the point/bounding-box region dialog.

Canvas nodes are injected only after the user clicks `加入所选节点`. Visible ordered text is appended to the draft and image nodes with local `assetId` values become references. Selection, dragging, connecting, restoring a project, or editing node properties never injects content or invokes the provider. Rejected selections report a concrete reason.

The same asset may occupy source and reference roles, but each role counts toward the ten-image limit. Composer inputs keep stable `referenceId` values and explicit order. Provider-side `图1`/`图2` labels are derived from that order rather than persisted into the prompt.

The prompt editor stores `{ type: "text" }` and `{ type: "reference" }` segments, never `contentEditable` HTML. The visible textarea and mention ranges are reconciled by pure functions in `reference-prompt-document.ts`; persisted data remains `PromptDocument`. Visible text nodes enter the draft only through the explicit selection-injection action.

Typing ASCII `@` outside IME composition opens a keyboard-accessible picker containing only images already added to the current draft. The picker supports filtering, pointer selection, Arrow Up/Down, Enter/Tab, and Escape. The toolbar `@` button opens the same flow. A mention displays readable `@label` text but persists `referenceId`, not a display number. Repeated mentions may reference the same image. Editing through a mention degrades it to ordinary text. Removing an input preserves its token as unresolved and blocks generation until the user removes or rebinds it; regions bound to the removed input are still removed.

The attachment strip shows the compiled `图N`, source/reference role, and mention usage. Its per-image menu owns reordering, role changes, visual annotations, and removal. Visual-annotation actions identify the image by stable `referenceId`; region edit separately exposes the current region count and opens the point/bounding-box editor.

Composer validation separates submission blocking from inline presentation. Empty prompt, model readiness, and connection readiness still disable Generate, but an untouched empty prompt does not render a red error and model remediation remains in the header. Actionable draft errors such as unresolved mentions, invalid custom dimensions, missing source/reference inputs, and missing regions render near the send button.

The user-facing workflow is distinct from the provider mode:

| Workflow | Required intent | Runtime mode |
| --- | --- | --- |
| Text to image | Prompt, no required image | `generate` |
| Reference generation | Prompt plus reference images | `generate` |
| Smart edit | Prompt plus source image | `edit` |
| Region edit | Prompt, source image, and point/bbox | `region-edit` |

Old `image-generator` nodes stay at their original position as read-only previews. They preserve old results, model/size summaries, and existing edge anchors, but all handles reject new connections and no Inspector, Generate, history, reconciliation, or automatic execution path remains. Their only active control is a user-clicked `打开图片生成` or `继续创作`, which copies the old snapshot into a new project draft without sending it.

The current Seedream catalog exposes:

- `generate`, `edit`, and `region-edit` modes;
- 1K/2K, smart/preset/custom aspect ratios, PNG/JPEG, and watermark selection;
- point and bounding-box regions using integer 0-999 coordinates;
- one output and no streaming, cancellation, 4K, native mask, sequential, or grouped output controls.

Region editing uses a large-image dialog with point, bounding-box, select/move, delete, undo/redo, zoom, and fit controls. It traps focus, supports keyboard operation, and returns focus to its trigger on close. Draft coordinates remain normalized integers from 0 to 999 until Save. Regions bind to a reference ID and are removed or rebound when their source disappears; the canvas explicitly describes this as point/box region reference, not native binary-mask upload.

Turn UI localizes queued, running, succeeded, and failed states. It does not invent percentage progress or expose an unsupported cancellation action. Retry and Generate Again copy an immutable request snapshot into the composer and create a new run only after another explicit Generate click. A successful result becomes a `generatedResult` Recent Capture and a pending ordinary-image canvas placement.

Result actions include Generate Again, Re-edit, Smart Edit, use as reference, idempotent canvas placement, and Media navigation. `生成历史` opens a project-scoped dialog: conversation summaries and thumbnails are on the left, the selected immutable turn stream is on the right. Continuing a historical conversation changes the grouping but leaves the composer blank; history is not context.

Conversation drafts, loads, visible turns, and placement handling are partitioned by `projectId`. Switching projects clears the visible draft and aborts history reads. An old project generation may finish in the background, but it cannot write into the active project. Returning to the source project processes its pending placements. Each ordinary result node stores `generationRunId`, `conversationId`, local `assetId`, and source metadata; placement deduplication checks `generationRunId` before creating a node.

Sending requires `settings.meta.featureFlags.imageGenerationNodeV1 === true`. Development uses an enabled default unless a persisted setting overrides it; production defaults to the gray rollout state. Real generation additionally requires the Agent Runtime server flag and an enabled, credentialed, successfully tested `image.primary` connection with a compatible SDK. Turning off sending keeps conversations, old nodes, results, history, and Media assets readable.

The project-level missing-model action preserves `{projectId, returnTarget}` while navigating to image-model management and returns to the source project after assignment. Legacy-node continuation may additionally carry `nodeId`, but new project conversations never bind or mutate a canvas generator node. See [Image Generation And Model Management](../architecture/image-generation-and-model-management.md).

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

The current pi policy is selection-driven:

- one selected text node permits only an update proposal for that exact node ID;
- no selected text node permits only a new text-node proposal;
- a selected non-text node does not grant mutation access to that node;
- every proposal requires explicit Apply or Reject.

## Right Panel Prompt Library Preview

The Free Canvas right panel has an `Agent` / `图片生成` / `Prompt库` segmented switcher.

- `Agent` keeps the existing `free-canvas-workspace` Agent chat flow.
- `图片生成` owns project conversations, explicit canvas injection, generation turns, result actions, and the history dialog.
- `Prompt库` embeds the reusable prompt library preview panel.
- Prompt library preview supports search, category filters, preset/media preview, and copy actions.
- The preview category filter includes `快捷消息`, backed by Prompt Library quick-message presets.
- Prompt clicks open `PromptPresetPreviewDialog`; they do not insert text into the canvas or fill the Agent input.
- Management functions such as edit mode, add-to-library, Trash, and Agent ingestion are intentionally hidden in the embedded preview.
- `previewMode` still disables Agent Runtime, while Prompt library preview can read locally available presets.

## Image Generation Placeholder Lifecycle

An Image Generation send is represented by one durable ordinary image node from submission through completion. The frontend creates a run ID in the form `image-run-<32 lowercase hex>` and uses it for the optimistic conversation turn, Runtime request, Storage run, placement, and node metadata. The node ID is `free-image-generation-${runId}`; reconciliation must use `meta.generationRunId` as the semantic identity and must never create a second node for the same run.

Submission order is part of the provider-call safety boundary:

1. Validate the draft and persist any reference-image or annotation derivatives.
2. Create a placeholder at the next visible canvas position. Fit the requested aspect ratio inside a 320 px box; `smart` uses 320 x 320.
3. Persist the project containing the placeholder.
4. Call the Runtime only after that save succeeds.

The placeholder carries this generation metadata:

| Field | Contract |
| --- | --- |
| `generationRunId` | Stable run identity shared with Runtime and Storage. |
| `conversationId` | Owning project image-generation conversation. |
| `generationState` | `running`, `succeeded`, or `failed`. |
| `generationErrorCode` | Safe normalized code, present only for failed nodes. |
| `source` | Always `image-generation-conversation`. |
| `generatedResult` | Present and `true` only after success. |

A running node renders a busy placeholder with `aria-busy`, permits selection, movement, and resizing, and suppresses crop, annotation, secondary-creation, and deletion actions. Deletion is blocked both in the node UI and in the shared canvas deletion path. A terminal node is deletable.

Success updates only `assetId`, the local asset URL, and generation metadata on the matching node. It must preserve node ID, position, width, height, selection, and other canvas changes made while the request was in flight. Failure retains the same node at the user's chosen frame and stores only a safe error code; retry remains a right-panel history action and creates a new run.

On project load, running nodes are reconciled against Storage by `generationRunId`. `queued` or `running` records keep the busy state and are polled; `failed` records restore a failed placeholder; `succeeded` records hydrate from the first output asset. A missing run or missing successful output becomes a stable failed placeholder. Pending placement processing hydrates an existing node first and marks the placement `placed` only after project persistence. Creating a new result node remains a compatibility fallback for successful runs that predate placeholders.

## Verification

```powershell
npm.cmd test -- --run src/domain/free-canvas/free-canvas-project.test.ts src/utils/agent-workspace.test.ts src/services/agent-runtime-service.test.ts src/utils/storage.test.ts
npm.cmd run test:e2e -- free-canvas-image-crop.spec.ts
npm.cmd run test:e2e -- free-canvas-text-node.spec.ts
npx.cmd playwright test tests/e2e/model-management.spec.ts tests/e2e/image-generation-node.spec.ts --workers=1
npm.cmd run build
```

Manual checks should cover creating an empty Free Canvas project, adding free text, adding a
quick-message text node, changing text size/color, selecting multiple nodes, deleting the last
node, adding images by toolbar/drag/paste, resizing a single selected image, opening the image
annotation editor, verifying mode-filtered annotation editing, checking that modal `Delete` never
deletes the image node, confirming arrow/freehand gestures stop on pointer release, cropping an
image from each edge direction, connecting nodes, switching the side panel between Agent and
Prompt library preview, approving or rejecting a `free_canvas_text_update` proposal, and creating a
`free_canvas_text_create` proposal when no text node is selected.

Quick-message manual checks should confirm the drawer and lightweight dialog have no note field,
and that clicking a quick message inserts only a red preset text node even when the preset has
reference media in Prompt Library.

Image-generation manual checks should confirm connection/assignment selection, explicit canvas text/image injection, stable multi-reference `@` binding after reorder, source/reference role switching, 1K/2K/custom validation, point/bbox save and undo, visual-markup rasterization, placeholder appearance before the delayed Runtime response, running-node movement/resizing and deletion blocking, in-place success without frame reset, retained failure, failed-run retry as a new row, generated-result placement and Media reuse, reload recovery, and history retention after project deletion. A failed placeholder save must not call the provider. Node selection, edge changes, project reload, and result-node continuation must not call the provider until the user presses Generate. Do not perform a live Ark smoke test unless the user has configured a keyring credential and explicitly enabled the server rollout flag.
