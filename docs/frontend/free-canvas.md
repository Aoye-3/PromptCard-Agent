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

## Edges and Agent Context

- Fixed storyboard-to-video-prompt edges are derived from three-stage pairs.
- User-created edges are stored in `threeStage.meta.freeCanvas.edges`.
- Selecting an edge builds its complete undirected connected chain. The Agent workspace context receives the selected nodes and edges, including form output and media or annotation summaries.
- Agent proposals remain limited to supported three-stage field updates. Canvas context does not grant Prompt Library write access.

## Persistence and Save Safety

- Canvas media nodes, positions, text, and user-created edges persist through the three-stage project metadata.
- Pages and forms persist through the normal three-stage project structure.
- The application treats storage responses as save acknowledgements and revision metadata. A stale response must not replace newer local editable content.

## Verification

```powershell
npm.cmd run test -- --run src/domain/free-canvas/free-canvas.test.ts src/domain/three-stage/three-stage-pages.test.ts src/utils/agent-workspace.test.ts src/domain/projects/project-storage-merge.test.ts
npm.cmd run build
```

Manual checks should cover Page creation and deletion, node deletion updating Layers, edge-chain selection updating Agent context, sidebar collapse behavior, and auto-save preserving the newest local edit.
