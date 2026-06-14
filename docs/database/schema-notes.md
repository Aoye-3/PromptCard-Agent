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
