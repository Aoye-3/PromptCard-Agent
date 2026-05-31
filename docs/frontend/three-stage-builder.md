# Three-stage Builder

The three-stage builder supports structured prompt creation across:

- character prompts
- storyboard prompts
- final video-generation prompts

Each section stores sparse string fields and has copyable output. Empty fields should remain absent or empty and should not appear in copied prompt output.

Shot-related fields can reuse Prompt Library presets, especially `camera` presets, without changing the `IPreset` schema.

Field definitions and output assembly live in `src/domain/three-stage/three-stage-definitions.ts`. The React component imports those definitions and should not duplicate stage field IDs, camera-field membership, or output ordering.

Autosave should not reload the whole project list after saving a three-stage snapshot. The editor already holds the newest local copy; merging an older async save response over it can restore text the user just deleted. If a save response needs to update project metadata, only merge it when the local project `updatedAt` is not newer than that save.

Camera preset fields should keep the Prompt Library picker usable inside the right field editor. When a selected field has `presetType: 'camera'`, reserve vertical space for the picker instead of letting the read-only full prompt preview consume the panel.

Stage-three fixed guidance cells use `fixedValue` in the field definition. Fixed cells render as locked text blocks, are not clickable, and are included in output even when the sparse project field map is empty or contains older user-entered values.

The stage-three camera prompt field reuses the same `shotRanges` editor shape as the storyboard stage, but keeps `presetType: 'camera'`. Prompt Library append/replace actions should target the currently focused shot range inside that field, not the serialized field value as a whole.

The stage-three output receives a narrow stage-two injection through the `buildOutput(fields, project)` context. Only the stage-two `theme` and `storyMotion` fields are injected into stage three. Do not inject stage-two drawing rules, camera style, shot ranges, environment notes, color annotations, or placeholder text.

The stage-three panel should visibly show the injected stage-two content in a locked block so users can audit what is automatically included in the final prompt.

Stage-three audio toggles are stored as sparse string fields. Empty or `"true"` means the option is allowed. `"false"` appends the fixed negative constraint at the end of the video prompt output.

The stage-three first/last-frame toggle is stored with the same toggle field shape, but defaults off. Only `"true"` appends the fixed placeholders `首帧：` and `尾帧：`.

When changing a stage definition, update or add tests in `src/domain/three-stage/three-stage-definitions.test.ts`.
