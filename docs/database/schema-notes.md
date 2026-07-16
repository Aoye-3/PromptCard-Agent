# Schema Notes

Core frontend schemas:

- `ICard`
- `IPreset`
- `IPromptProject`
- `IStoryboardProject`
- `IThreeStageProject`
- `IThreeStagePage`
- `IThreeStageItem`
- `IThreeStageForm`
- `PromptLibraryWriteProposal`
- `AgentWorkspaceProposal`
- `RecentCaptureItem`
- `RecentCaptureItemViewModel`
- `IFreeCanvasImageGeneratorNode`
- `ImageGenerationRun`
- `ImageGenerationConversation`
- `ImageGenerationCanvasPlacement`
- `ImageAssetDerivation`

Schema changes should be documented with migration or normalization behavior. Prefer extending `meta` for Prompt Library metadata rather than changing the top-level `IPreset` shape.

## Three-stage Project Shape

`IThreeStageProject` is stored inside `IPromptProject.threeStage`. The durable JSON format may contain both the current page-based model and legacy compatibility fields.

Current fields:

- `pages?: IThreeStagePage[]`
- `selectedPageId?: string | null`
- `selectedFormId?: string | null`
- `selectedPairId?: string | null`

Compatibility fields:

- `character: IThreeStageSection`
- `storyboard: IThreeStageSection`
- `videoPrompt: IThreeStageSection`
- `selectedStage`
- `selectedFieldId`

The compatibility fields are synchronized from the selected page/form by `syncThreeStageLegacyFields()`. New code should not treat them as the source of truth for multi-page or multi-form behavior.

`IThreeStagePage.items` stores independent form items:

- `form`: contains one independent `IThreeStageForm` with `type` set to `character`, `object`, `storyboard`, or `videoPrompt`.

Legacy readers may still encounter `character` and `storyVideoPair` item shapes. `normalizeThreeStagePages()` converts them into adjacent independent `form` items. New code must not create or depend on `storyVideoPair`.

Normalization behavior:

- Old fixed three-stage projects migrate into one page with independent character, storyboard, and video-prompt forms.
- Legacy `storyVideoPair` items split into adjacent independent storyboard and video-prompt forms.
- Form numbering is monotonic per form type and is not compacted after deletion.
- `selectedPairId` is retained only for input compatibility and is synchronized to `null`.

## Recent Capture Shape

`RecentCaptureItem` is durable metadata stored by the local storage service. It references the physical asset file by `assetId`; it does not duplicate image bytes inside project JSON or capture JSON.

Current durable fields:

- `id`
- `assetId`
- `kind: "screenshot" | "pastedMedia" | "screenRecording"`
- `status`
- `purpose`
- `role?: string | null`
- `title`
- `prompt`
- `userNote`
- `sourcePlatform`
- `sourceUrl`
- `contentType: "image/png" | "image/jpeg" | "image/webp" | "video/mp4"`
- `originalFilename?`
- `registeredPromptId?`
- `registeredAt?`
- `linkedProjectId?`
- `linkedCanvasNodeId?`
- `durationMs?`
- `hasAudio?`
- `size`
- `width`
- `height`
- `capturedAt`
- `origin`
- `createdAt`
- `updatedAt`
- `revision`

The current producers create native `screenshot` records and clipboard `pastedMedia` records. `screenRecording` and `video/mp4` are reserved by the schema for the final recording phase, but no recording producer is implemented yet. Raw Recent Capture items are not Agent-visible or Prompt Library-visible until the explicit transaction registration flow creates a Prompt preset and writes `registeredPromptId`.

UI code converts durable records to `RecentCaptureItemViewModel` through the media normalization helpers. Preview surfaces resolve image thumbnails from `storage.assets.url(assetId)`. Prompt `meta.media` and Free Canvas image nodes retain that same `assetId`; linkage fields record relationships but never represent additional physical files.

## Image Generation Conversation, Legacy Node, And Run Shapes

New generation work is owned by the project-level Image Generation conversation UI. Its unsent `ImageGenerationComposerDraft` is frontend-only and contains the current `PromptDocument`, ordered image inputs, input roles, regions, selected model binding, resolution/ratio/custom size, prompt optimization, format, watermark, and optional annotation document. A draft is cleared after submission except for retained model/size preferences; it is not durable history.

`IFreeCanvasImageGeneratorNode` remains a compatibility shape persisted inside older `IPromptProject.freeCanvas.nodes` records with `kind: "image-generator"`. It stores the former provider-neutral intent:

- `mode: "generate" | "edit" | "region-edit"`
- `binding: { connectionId, modelId }`
- `settings: { resolution, aspectRatio, width?, height?, outputFormat, watermark }`
- `promptDocument` with versioned text/reference segments
- `regions` with stable `referenceId` and normalized point/bbox coordinates
- optional `activeRunId` and `primaryAssetId`

Legacy Free Canvas edges persist `targetHandle`, input order, and stable `referenceId`. Those fields remain part of project normalization so old projects load without loss. The node is now read-only: no Inspector, node mutation, edge change, reload, or selection event may invoke image generation. Its only creation action is an explicit user command that opens the project Image Generation tab and pre-fills a new draft.

`ImageGenerationRun` is not embedded in the project. PromptCard Storage schema v5 persists it independently with:

- project plus conversation or legacy node identity, connection/provider/model identity;
- immutable `requestSnapshot` containing structured prompt, ordered input assets, regions, and settings;
- `queued`, `running`, `succeeded`, or `failed` state and lifecycle timestamps;
- local `outputAssetIds` for success, or a normalized error for failure;

`ImageGenerationConversation` stores project-scoped title/timestamps and derives latest-run, preview-asset, and turn-count summaries from runs. `ImageGenerationCanvasPlacement` stores one successful conversation run as `pending` or `placed` with its ordinary image node ID. Neither record has a normal delete transition.

Runs may additionally contain an optional provider request ID and sanitized numeric usage fields.

Terminal runs are immutable and have no DELETE endpoint. Run snapshots reject sensitive field names and never contain credentials, provider temporary URLs, or local filesystem paths.

`ImageAssetDerivation` records a permanent source/derived relationship:

- `sourceAssetId`
- `derivedAssetId`
- `kind: "preview" | "provider-input" | "annotation-flattened"`
- conversion/transform metadata
- optional `ImageAnnotationDocument`
- creation timestamp

Original and derived assets are both strong references for diagnostics and backup/restore. Visual annotations are non-destructive documents with normalized coordinates; the submitted provider image is a separately stored rasterized derivative.
