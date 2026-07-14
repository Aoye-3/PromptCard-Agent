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
