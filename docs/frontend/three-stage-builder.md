# Three-stage Builder

The three-stage builder supports structured prompt creation across:

- character prompts
- storyboard prompts
- final video-generation prompts

Each section stores sparse string fields and has copyable output. Empty fields should remain absent or empty and should not appear in copied prompt output.

Shot-related fields can reuse Prompt Library presets, especially `camera` presets, without changing the `IPreset` schema.

Field definitions and output assembly live in `src/domain/three-stage/three-stage-definitions.ts`. The React component imports those definitions and should not duplicate stage field IDs, camera-field membership, or output ordering.

When changing a stage definition, update or add tests in `src/domain/three-stage/three-stage-definitions.test.ts`.
