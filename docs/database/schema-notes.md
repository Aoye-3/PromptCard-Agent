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

Current MVP fields:

- `id`
- `assetId`
- `kind: "screenshot"`
- `status`
- `purpose`
- `role?: string | null`
- `title`
- `prompt`
- `userNote`
- `sourcePlatform`
- `sourceUrl`
- `contentType`
- `size`
- `width`
- `height`
- `capturedAt`
- `origin`
- `createdAt`
- `updatedAt`
- `revision`

Only screenshot records are created in the current floating capture MVP. Video capture and Prompt Library registration are future work. Raw Recent Capture items are not Agent-visible or Prompt Library-visible until a separate explicit registration flow promotes them.

UI code should convert durable records to `RecentCaptureItemViewModel` through the media normalization helpers. Preview surfaces resolve screenshot thumbnails from `storage.assets.url(assetId)`.
