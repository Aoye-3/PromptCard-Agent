# Three-stage Builder

The three-stage builder supports structured prompt creation across:

- character prompts
- storyboard prompts
- final video-generation prompts

The current UI is page-based. Each three-stage project owns `threeStage.pages`, and each page owns an ordered list of form items:

- `character`: one independent character form.
- `storyVideoPair`: one bound storyboard form plus one bound video prompt form.

The legacy top-level `threeStage.character`, `threeStage.storyboard`, `threeStage.videoPrompt`, `selectedStage`, and `selectedFieldId` fields are kept as compatibility fields. New UI behavior should read and mutate page items through `src/domain/three-stage/three-stage-pages.ts`, then call `syncThreeStageLegacyFields()` before persisting or building workspace context.

Each form stores sparse string fields and has copyable output. Empty fields should remain absent or empty and should not appear in copied prompt output.

## Page and Form Model

Page normalization is owned by `normalizeThreeStagePages()`:

- Legacy projects without pages migrate into page 1 with `人物版 #1` and one bound `故事版 #1 + 提示词版 #1` pair.
- A malformed first page that only contains one side of the old fixed workflow is repaired with the missing character or story/video pair.
- A video prompt form must never be orphaned. UI actions create, copy, and delete storyboard/video prompt forms as a pair.
- Numbering is monotonic per project. Character forms use their own sequence. Storyboard/video forms share the pair number.

The bottom `+` action duplicates the current page. It copies every page item, assigns new form IDs and numbers, and creates a new `pairId` for each copied story/video pair.

The page menu and inline create cards can add more forms to the current page:

- New character forms may copy from existing character forms.
- New story/video pairs may copy from existing story/video pairs.
- Storyboard-only and video-prompt-only creation is intentionally unsupported.

Deleting a character item removes only that character form. Deleting either card in a story/video pair removes the whole pair. A page must retain at least one item.

## Layout

The left work area is a horizontal form rail, not a fixed three-column grid. Forms have stable widths and can repeat beyond the initial three-card layout. The right field editor and Agent collaboration panel remain fixed in the right column.

The native horizontal scrollbar is hidden. A floating horizontal control is rendered over the form rail with left/right buttons and a range input. Keep this control scoped to the form rail; it should not scroll or resize the right-side editor.

Shot-related fields can reuse Prompt Library presets, especially `camera` presets, without changing the `IPreset` schema.

Field definitions and output assembly live in `src/domain/three-stage/three-stage-definitions.ts`. The React component imports those definitions and should not duplicate stage field IDs, camera-field membership, or output ordering.

Autosave should not reload the whole project list after saving a three-stage snapshot. The editor already holds the newest local copy; merging an older async save response over it can restore text the user just deleted. If a save response needs to update project metadata, only merge it when the local project `updatedAt` is not newer than that save.

Camera preset fields should keep the Prompt Library picker usable inside the right field editor. When a selected field has `presetType: 'camera'`, reserve vertical space for the picker instead of letting the read-only full prompt preview consume the panel.

Stage-three fixed guidance cells use `fixedValue` in the field definition. Fixed cells render as locked text blocks, are not clickable, and are included in output even when the sparse project field map is empty or contains older user-entered values.

The stage-three camera prompt field reuses the same `shotRanges` editor shape as the storyboard stage, but keeps `presetType: 'camera'`. Prompt Library append/replace actions should target the currently focused shot range inside that field, not the serialized field value as a whole.

The stage-three output receives a narrow stage-two injection through the `buildOutput(fields, project)` context. Only the paired storyboard form should be passed into that context. Do not read the legacy global `threeStage.storyboard` when rendering a page item video prompt.

Only the paired stage-two `theme` and `storyMotion` fields are injected into stage three. Do not inject stage-two drawing rules, camera style, shot ranges, environment notes, color annotations, or placeholder text.

The stage-three panel should visibly show the injected stage-two content in a locked block so users can audit what is automatically included in the final prompt.

Stage-three audio toggles are stored as sparse string fields. Empty or `"true"` means the option is allowed. `"false"` appends the fixed negative constraint at the end of the video prompt output.

The stage-three first/last-frame toggle is stored with the same toggle field shape, but defaults off. Only `"true"` appends the fixed placeholders `首帧：` and `尾帧：`.

## Agent Workspace Context

Three-stage Agent context is built by `buildThreeStageWorkspaceContext()` in `src/utils/agent-workspace.ts`. The snapshot includes page/form identity so the Agent can reason about the selected form without guessing:

- `selectedPageId`
- `selectedItemId`
- `selectedFormId`
- `selectedPairId`
- `selectedFormType`
- `selectedFormTitle`
- `pairedStoryboardSummary` for selected video prompt forms

The Agent `sessionKey` remains project-scoped, but the `contextId` includes the selected page and form. This keeps the conversation surface stable while proposals target the current form.

## Tests

When changing a stage definition, update or add tests in `src/domain/three-stage/three-stage-definitions.test.ts`.

When changing page, copy, delete, numbering, or pair-binding behavior, update `src/domain/three-stage/three-stage-pages.test.ts`.

When changing Agent context fields, update `src/utils/agent-workspace.test.ts`.
