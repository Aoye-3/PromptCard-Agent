# Free Canvas Workspace

The free canvas is the high-density editing surface for a three-stage project. It renders three-stage forms, media placeholders, annotations, persisted user edges, Pages and Layers navigation, and a project-scoped Agent conversation in one workspace.

## Layout Contract

- The Pages and Layers sidebar is a fixed full-height work area. It can collapse to return width to the canvas.
- The Agent sidebar is a fixed full-height work area. Expanded mode prioritizes conversation history and input; collapsed mode leaves a narrow reopen control.
- The canvas toolbar, controls, and minimap stay inside the available canvas area and must move when either sidebar changes width.
- The background uses a low-contrast grid. Operational screens target Figma-like information density rather than decorative spacing.

## Pages and Layers

- Pages are owned by the three-stage project. Creating a Page adds a character form and a linked storyboard/video-prompt pair.
- At least one Page must remain.
- Layers are derived from the current graph, not stored separately:
  - Prompt nodes: character, storyboard, and video-prompt forms.
  - Image nodes: `imageAsset`.
  - Text annotation nodes: `textOverlay` and `arrowAnnotation`.
- Removing a media node also removes its persisted user edges. Because Layers are derived, the list updates with the graph.

## Image Nodes and Cropping

- `FreeCanvasBuilderScreen` composes the canvas and project-domain updates. Browser file handling and asset persistence are isolated in `canvas-image-assets.ts`; drag, clipboard, notification, and crop orchestration live in `useCanvasImageInteractions.ts`; media-node rendering lives in `FreeCanvasMediaNode.tsx`.
- Canvas components use the image asset service rather than calling the storage HTTP client directly.
- Dropping PNG, JPEG, or WebP files from the operating system directly onto empty canvas space uploads each file and creates an image node at the drop position. Users do not create an empty image node first; image-node creation is intentionally absent from the toolbar and context menu. Multiple files are offset so they remain individually selectable. Windows Explorer drags that expose only the generic `Files` transfer type, or omit MIME metadata on drop, are supported.
- The canvas captures file drag events before React Flow children and shows a `松开以添加图片` overlay when the operating-system drag is recognized. Unsupported files and upload failures produce an explicit error instead of silently doing nothing.
- Image nodes use a minimal white surface without a media icon or permanent title bar. The image fills the node with a small white inset; connection handles appear on hover.
- Double-clicking an uploaded image, or using its selected-state crop button, opens the manual crop editor.
- The crop editor has rulers on all four sides. Left and right rulers create horizontal lines; top and bottom rulers create vertical lines. Lines can be dragged, double-clicked to remove, or removed by dragging them back to an edge.
- Crop confirmation keeps the source node and creates derived nodes to its right in the same row/column arrangement. Regions are ordered left-to-right, then top-to-bottom.
- Cropping is non-destructive. Derived nodes share the source `assetId` and store only a normalized `crop` rectangle plus `sourceNodeId`; canceling the editor leaves the project unchanged.
- With an image node selected, `Ctrl+C` / `Cmd+C` copies the node and `Ctrl+V` / `Cmd+V` creates an offset duplicate that shares the same asset. Pasting an image copied from another application uploads it and creates a new image node near the canvas center. Clipboard shortcuts are not intercepted while typing in editable fields.

## Edges and Agent Context

- Fixed storyboard-to-video-prompt edges are derived from three-stage pairs.
- User-created edges are stored in `threeStage.meta.freeCanvas.edges`.
- Selecting an edge builds its complete undirected connected chain. The Agent workspace context receives the selected nodes and edges, including form output and media or annotation summaries.
- Agent proposals remain limited to supported three-stage field updates. Canvas context does not grant Prompt Library write access.

## Persistence and Save Safety

- Canvas media nodes, positions, text, asset references, normalized crop rectangles, and user-created edges persist through the three-stage project metadata.
- Pages and forms persist through the normal three-stage project structure.
- Three-stage forms are the source of truth for form nodes. React Flow nodes are projections and are never deleted ahead of their source form.
- `removeFreeCanvasNodes()` maps selected graph node IDs to source forms and media nodes, expands either storyboard/prompt node to its complete binding group, and removes connected user edges in one domain update.
- Multi-select deletion is atomic. If the result would leave any Page without a form, the entire operation is blocked with `每页至少保留一个表单。`
- After deletion, a still-valid selected form remains selected. Only a removed or invalid selection falls back to the first surviving form on the preferred Page.
- The application treats storage responses as save acknowledgements and revision metadata. A stale response must not replace newer local editable content.
- A failed save does not restore removed nodes. The newest unsaved snapshot remains queued for the next automatic or manual save attempt.

## Verification

```powershell
npm.cmd run test -- --run src/domain/free-canvas/free-canvas.test.ts src/domain/three-stage/three-stage-pages.test.ts src/utils/agent-workspace.test.ts src/domain/projects/project-storage-merge.test.ts
npm.cmd run test -- --run src/components/canvas/canvas-image-assets.test.ts
npm.cmd run build
```

Manual checks should cover Page creation and deletion, node deletion updating Layers, edge-chain selection updating Agent context, sidebar collapse behavior, and auto-save preserving the newest local edit.

Image checks should cover dropping one and multiple supported files, upload failure feedback, crop-line add/move/delete, cancel behavior, derived-node ordering, and reopening a project with source and cropped image nodes.
