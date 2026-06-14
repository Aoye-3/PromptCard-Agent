# Three-stage Builder

The three-stage builder supports structured prompt creation across character prompts, storyboard prompts, and final video-generation prompts.

The current UI is page-based. Each three-stage project owns `threeStage.pages`, and each page owns an ordered list of independent `form` items. A form's `form.type` can be `character`, `object`, `storyboard`, or `videoPrompt`.

Legacy `character` and `storyVideoPair` item shapes are read-only compatibility inputs. `normalizeThreeStagePages()` converts them into independent `form` items on load. New UI behavior should create only `form` items.

## Page And Form Model

Page normalization is owned by `normalizeThreeStagePages()`:

- Legacy projects without pages migrate into page 1 with independent character, storyboard, and video-prompt forms.
- Legacy `storyVideoPair` items split into adjacent independent storyboard and video-prompt forms.
- Storyboard and video-prompt forms can be created, copied, renamed, reordered, and deleted independently.
- Numbering is monotonic per project and per form type.

Duplicating a page copies every page item and assigns new form IDs and numbers. Copying a single form inserts the copied form directly after the source form and deep-copies fields, template snapshot metadata, and local fixed-content overrides.

Deleting a form removes only that form. A page must retain at least one item.

## Templates And Fixed Content

Template settings live in `settings.meta.threeStageTemplates`. They support only the three main templates: `character`, `storyboard`, and `videoPrompt`; object forms use the built-in definition.

Template settings affect only future blank forms and new projects. Existing forms keep their creation-time `form.meta.template.fixedContent` snapshot. Output resolution order is:

1. per-node `form.meta.canvas.fixedContent`
2. creation-time `form.meta.template.fixedContent`
3. built-in stage definition defaults

Fixed content renders locked by default. Unlocking a block allows editing only that form's local override. Resetting a block removes the local override and restores the creation-time template snapshot or built-in default.

The video-prompt template includes a default `negativePrompt` fixed block: `分镜头版的标注只做参考，不要出现任何文字，箭头和镜头号！`

## Output Assembly

Field definitions and output assembly live in `src/domain/three-stage/three-stage-definitions.ts`. The React component should not duplicate stage field IDs, camera-field membership, or output ordering.

Video-prompt output no longer receives automatic storyboard injection. Do not read `threeStage.storyboard` or a paired storyboard form when rendering a video-prompt form.

Stage-three audio toggles are stored as sparse string fields. Empty or `"true"` means the option is allowed. `"false"` appends the fixed negative constraint at the end of the video prompt output.

The stage-three first/last-frame toggle is stored with the same toggle field shape, but defaults off.

## Agent Workspace Context

Three-stage Agent context is built by `buildThreeStageWorkspaceContext()` in `src/utils/agent-workspace.ts`. The snapshot includes page/form identity:

- `selectedPageId`
- `selectedItemId`
- `selectedFormId`
- `selectedPairId` (always `null` for normalized data)
- `selectedFormType`
- `selectedFormTitle`

Agent context must not expose a paired storyboard summary for selected video-prompt forms.

## Free Canvas Projection

The free canvas builder is a three-stage project variant selected by `meta.builderTemplateId: "free-canvas"`. It does not introduce a new durable project type.

- `character`, `object`, `storyboard`, and `videoPrompt` forms become independent canvas nodes.
- Free canvas no longer creates fixed storyboard-to-video-prompt pair edges.
- Form node positions are stored in `form.meta.canvas.position`.
- Project-local media nodes live in `threeStage.meta.freeCanvas.mediaNodes`.

Free-canvas fixed content uses the same per-node override rules as the standard builder.

## Tests

When changing stage definitions, update `src/domain/three-stage/three-stage-definitions.test.ts`.

When changing page, copy, delete, numbering, or ordering behavior, update `src/domain/three-stage/three-stage-pages.test.ts`.

When changing Agent context fields, update `src/utils/agent-workspace.test.ts`.

When changing free canvas graph projection or media node persistence, update `src/domain/free-canvas/free-canvas.test.ts`.
