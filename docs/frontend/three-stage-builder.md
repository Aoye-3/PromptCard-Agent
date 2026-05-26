# Three-stage Builder

The three-stage builder supports structured prompt creation across:

- character prompts
- storyboard prompts
- final video-generation prompts

Each section stores sparse string fields and has copyable output. Empty fields should remain absent or empty and should not appear in copied prompt output.

Shot-related fields can reuse Prompt Library presets, especially `camera` presets, without changing the `IPreset` schema.

Field definitions and output assembly live in `src/domain/three-stage/three-stage-definitions.ts`. The React component imports those definitions and should not duplicate stage field IDs, camera-field membership, or output ordering.

When changing a stage definition, update or add tests in `src/domain/three-stage/three-stage-definitions.test.ts`.

## Modular Prompt Injection

Three-stage field preset assistance uses the shared prompt injection panel. The three-stage builder supplies a field-mode adapter:

- available preset type: `camera`
- target label: the focused field label
- actions: append and replace
- apply behavior: update the focused field and increment preset usage

Three-stage code should not copy card-builder injection logic or add field-specific data to `IPreset`. New fields that need reusable preset options should declare the preset type in field configuration and route through the same injection module.
