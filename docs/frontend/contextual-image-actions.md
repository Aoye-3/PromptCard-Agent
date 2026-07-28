# Contextual Image Actions

## Scope

Contextual Image Actions are selected-image tools on Free Canvas. They own:

- the floating selected-image toolbar;
- its More menu;
- the image-node right-click menu;
- modal operation workbenches;
- visible-image copy/export;
- contextual generation placeholders and multi-view result groups.

They do not own or restructure the existing right-side `Agent / 图片生成 / Prompt库` workspace. The single explicit bridge is `作为参考`: it opens the existing 图片生成 tab and appends the source image to that Composer's current reference list without opening a modal or sending a request. All other opening, cancelling, submitting, completing or retrying of contextual image operations must not change the active right tab, its Agent draft, its image-generation conversation draft, or Prompt Library state.

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

Local commands include copy/duplicate/delete, zoom, layer order, horizontal/vertical flip, crop, annotation, original download, copy-visible, export-visible and `作为参考`. `作为参考` only mutates the in-memory image Composer draft and therefore does not require Runtime/model readiness. Generative commands map to provider-neutral product operations rather than provider request fields.

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

`ImageOperationWorkbenchDialog` is the shared modal shell for effect rendering, region redraw, erase, outpaint, text edit, generative enhance and subject extraction. `作为参考` deliberately bypasses this shell.

It displays the actual source preview and asset trace, recipe preset, prompt, preservation intent, capability-limited supporting references, output settings, limitations and submission issues. Opening, editing presets, adding references, choosing a point, cancelling or pressing Escape never invokes the provider. Only the explicit Generate button compiles an immutable recipe snapshot and creates a run.

Product reference roles such as identity, style, material, layout and content are application intent. They are compiled into prompt language and snapshot metadata, not invented as provider API fields.

Truthful experimental labels:

- subject extraction means a solid/neutral-background redraw, not transparent alpha extraction;
- quality enhancement means generative high-resolution redraw, not native pixel-preserving upscale;
- text replacement is generative and must be checked for character and layout accuracy;
- point/bbox guidance is not a pixel-hard mask.

The versioned evaluation definition is [Image Operation Evaluation Manifest v1](../references/image-operation-evaluations/v1-experimental-manifest.md). Its live execution status is `not-run`.

## Multi-view

`MultiViewWorkbenchDialog` makes selected views and the exact number of independent requests visible before confirmation. Its discrete camera-position selector uses a 3×3 layout: `左上 / 俯视 / 右上`, `左视 / 正视 / 右视`, and `左下 / 仰视 / 右下`. Existing `正面 3/4` and `背面` views remain available as supplemental choices. `模型三视图` replaces the current selection with `正视 / 左视 / 俯视`; it does not submit until the user presses Generate.

These controls compile to stable provider-neutral `viewSpec` values and natural-language view instructions. The UI deliberately does not expose continuous horizontal/vertical degree sliders: the current adapters document instruction-following image edits, not exact camera-angle parameters, so a degree control would imply unsupported precision.

One Generate confirmation:

1. creates one group ID;
2. creates one item ID, view specification, run ID, recipe snapshot and placeholder per selected view;
3. persists the whole placeholder group before any Runtime preparation or provider call;
4. atomically prepares every member run in Storage; a prepare failure makes zero provider calls;
5. submits independent provider-neutral requests with concurrency one;
6. never claims native grouped output or exact 3D reconstruction.

`MultiViewGroupPanel` derives queued/running/partial/succeeded/failed state from member image nodes. Successful views remain usable when another view fails. `重试此视角` is bound to the clicked failed `nodeId`, its group/item/view tuple, the original/canvas/provider source identities and the source node identity. The retry workbench cannot switch to another member or source. Generate creates a new run on that same canvas node, preserves its position and size, leaves the old failed run immutable, and never resubmits successful members. `作为参考` directly appends the successful result to the existing right-side 图片生成 Composer and opens that tab; it does not open a workbench or submit a request.

Reload and project-switch reconciliation uses both run ID and canvas node ID. Queued authorized members resume one at a time from their immutable snapshots, running members are polled, and terminal members hydrate the existing node. This prevents duplicate provider submissions and duplicate canvas placement while preserving geometry changed during generation.

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

The zero-cost automated gates pass with the repository Fake Provider: the image-generation Playwright configuration, full E2E suite, full frontend suite, production build, Runtime image-generation suite, Storage suite, `agent:check`, and diff/security checks are green. These checks cover the persisted three-member placeholder set, atomic preparation, all-success and partial outcomes, retrying only the failed member, geometry preservation, lineage, and reload/project-switch deduplication without contacting a real provider.

Plan 007 remains `Active` because unified human approval is still outstanding. F2, F3, F5, F7 and the remaining F4 observations require manual acceptance; B3-B6 and B8-B9 remain intentionally unexecuted. The current findings are retained rather than hidden:

- `E-001` (Medium): a reload-adjacent project `PUT` can be cancelled and surface `StorageHttpError`; Storage retained the nodes in the recorded run.
- `E-002` (Low): the Fake Runtime generic status probe can return 404/disconnected in the captured browser evidence.

See [Plan 007](../Plan/007-contextual-image-editing-and-multi-view-plan.md) and the [manual frontend acceptance record](../quality/manual-frontend-acceptance.md) for the current gate ledger and sanitized evidence links.
