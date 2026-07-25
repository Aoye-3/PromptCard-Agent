# Contextual Image Actions

## Scope

Contextual Image Actions are selected-image tools on Free Canvas. They own:

- the floating selected-image toolbar;
- its More menu;
- the image-node right-click menu;
- modal operation workbenches;
- visible-image copy/export;
- contextual generation placeholders and multi-view result groups.

They do not own or modify the existing right-side `Agent / 图片生成 / Prompt库` workspace. Opening, cancelling, submitting, completing or retrying a contextual image operation must not change the active right tab, its Agent draft, its image-generation conversation draft, or Prompt Library state.

[Plan 007](../Plan/007-contextual-image-editing-and-multi-view-plan.md) is the implementation and acceptance tracker. [ADR-015](../decisions/ADR-015-explicit-multi-view-request-groups.md) records multi-view authorization and member semantics.

## State boundaries

The implementation keeps these domains separate:

| Domain | Owner | Durable identity |
| --- | --- | --- |
| Canvas selection | Free Canvas / React Flow | node ID |
| Document/text editing | document or text-node editor | document/field/text-node ID |
| Image-node presentation | image node | image node ID and asset ID |
| Operation workbench draft | modal component | source node ID; transient until Generate |
| Provider execution | Runtime run | run ID |
| Multi-view relationship | result image metadata plus run snapshots | group ID, item ID and view specification |
| Right workspace | existing Free Canvas right rail | active tab and its own draft IDs |

Every image command first narrows the target to one ready `image` node with an asset. Document nodes, text nodes, image-generator legacy nodes, running placeholders and failed placeholders cannot accidentally receive the ready-image command set.

## Shared command registry

`src/domain/image-actions/image-node-commands.ts` is the source of truth for command IDs, labels, surfaces, shortcuts, operation mapping and disabled reasons.

The same resolved commands feed:

- `ImageNodeActionBar`;
- the toolbar More menu;
- `CanvasNodeContextMenu`;
- keyboard handlers in `FreeCanvasBuilderScreen`.

Local commands include copy/duplicate/delete, zoom, layer order, horizontal/vertical flip, crop, annotation, original download, copy-visible and export-visible. Generative commands map to provider-neutral product operations rather than provider request fields.

Availability combines eligible image selection, model-catalog native capability, adapter implementation, recipe status, product policy and Runtime readiness. Seedream IDs never appear in command resolution.

## Visible image and source identity

The source shown in an operation workbench must be the image that will be sent to the model.

`resolveCanvasImageInput` preserves:

- `originalAssetId`: original imported or generated asset;
- `canvasAssetId`: asset attached to the current image node;
- `providerAssetId`: persistent provider-ready input.

When crop, flip or annotations change the visible canvas result, `renderVisibleImage` creates a raster containing those effects and Storage records a technical derivative. When no visible effect exists, the existing provider-safe asset is reused.

Technical derivatives are not creative results. Generative operations always create new runs, assets and sibling nodes; they do not overwrite the source asset.

## Operation workbenches

`ImageOperationWorkbenchDialog` is the shared modal shell for reference generation, effect rendering, region redraw, erase, outpaint, text edit, generative enhance and subject extraction.

It displays the actual source preview and asset trace, recipe preset, prompt, preservation intent, capability-limited supporting references, output settings, limitations and submission issues. Opening, editing presets, adding references, choosing a point, cancelling or pressing Escape never invokes the provider. Only the explicit Generate button compiles an immutable recipe snapshot and creates a run.

Product reference roles such as identity, style, material, layout and content are application intent. They are compiled into prompt language and snapshot metadata, not invented as provider API fields.

Truthful experimental labels:

- subject extraction means a solid/neutral-background redraw, not transparent alpha extraction;
- quality enhancement means generative high-resolution redraw, not native pixel-preserving upscale;
- text replacement is generative and must be checked for character and layout accuracy;
- point/bbox guidance is not a pixel-hard mask.

The versioned evaluation definition is [Image Operation Evaluation Manifest v1](../references/image-operation-evaluations/v1-experimental-manifest.md). Its live execution status is `not-run`.

## Multi-view

`MultiViewWorkbenchDialog` makes selected views and the exact number of independent requests visible before confirmation.

One Generate confirmation:

1. creates one group ID;
2. creates one item ID, view specification, run ID, recipe snapshot and placeholder per selected view;
3. persists the whole placeholder group before any provider call;
4. submits independent provider-neutral requests with bounded concurrency;
5. never claims native grouped output or exact 3D reconstruction.

`MultiViewGroupPanel` derives queued/running/partial/succeeded/failed state from member image nodes. Successful views remain usable when another view fails. `重试此视角` opens a workbench containing only that failed view and creates a new run in the same group; it does not mutate the historical failed member or resubmit successful views. `作为参考` opens the contextual reference workbench for the successful result.

Contextual placeholders use `meta.source = "contextual-image-operation"` and do not carry a conversation ID. The right-side image-generation path keeps its existing `image-generation-conversation` source and conversation identity.

## Copy and export

- `下载原图` downloads the underlying asset without canvas presentation effects.
- `复制所见图片` rasterizes crop, flip and annotations and writes a PNG through the browser clipboard API when supported.
- `下载所见图片` rasterizes the same visible result and downloads a PNG.

Copy/export do not create another local asset. Provider derivatives are created only when an operation explicitly needs the visible image as model input.

## Accessibility and interaction

- The selected-image toolbar is a named ARIA toolbar and supports Left/Right movement between enabled buttons.
- More and right-click surfaces use menu roles, disabled reasons, Escape dismissal and focus restoration.
- The context menu clamps inside viewport edges.
- Workbenches use modal dialog semantics, focus trapping, Escape and trigger-focus restoration.
- A single ready image owns one toolbar. Multi-selection and non-image selection do not render overlapping image toolbars.

## Current verification state

Focused domain and component suites for the registry, local command history, visible input, recipe compilation, workbench submission, multi-view scheduling/group projection and menu behavior pass. Repeated production builds pass with pre-existing CSS/chunk warnings.

Still required for final frontend acceptance:

- one uninterrupted full Vitest run;
- lint;
- Playwright at four viewport corners and 25%/100%/200% canvas zoom;
- contextual workbench Cancel/Generate/retry/reload flows;
- clipboard unsupported/error paths;
- explicit regression proving the active right tab and drafts remain unchanged;
- expanded pixel fixtures for crop, flip, alpha and annotation composition.
