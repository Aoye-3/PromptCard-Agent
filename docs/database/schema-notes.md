# Schema Notes

Core frontend schemas:

- `ICard`
- `IPreset`
- `IPromptProject`
- `IStoryboardProject`
- `IThreeStageProject`
- `PromptLibraryWriteProposal`
- `AgentWorkspaceProposal`

Schema changes should be documented with migration or normalization behavior. Prefer extending `meta` for Prompt Library metadata rather than changing the top-level `IPreset` shape.
