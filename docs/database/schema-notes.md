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

`IThreeStagePage.items` supports two item kinds:

- `character`: contains one independent `IThreeStageForm`.
- `storyVideoPair`: contains `pairId`, `storyboardForm`, and `videoPromptForm`.

Story/video pairs are indivisible for create, copy, delete, numbering, and stage-three injection. A video prompt form should always read the storyboard form with the same `pairId`.

Normalization behavior:

- Old fixed three-stage projects migrate into one page with one character form and one story/video pair.
- Missing first-page character or pair data is repaired during normalization.
- Form and pair numbering is monotonic and is not compacted after deletion.
