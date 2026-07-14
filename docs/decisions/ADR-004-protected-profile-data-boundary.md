# ADR-004: Keep User Data In A Protected Desktop Profile

## Status

Partially superseded by [ADR-007](./ADR-007-repository-data-root-for-editable-development.md). The desktop Profile remains the boundary for runtime logs and configuration, but it no longer owns Storage Service data during editable development.

## Date

2026-07-06

## Context

PromptCard source updates are currently coupled to an editable Git worktree. Projects, Prompt Library presets, media assets, backups, logs, and Agent Runtime state have historically defaulted to repository-local paths such as `data/`, `backups/`, `logs/`, and `agent-runtime/.deer-flow/`.

That worked for private development because those paths are ignored by Git, but it leaves two product risks:

- source update operations can be confused with user data ownership;
- user data remains visually mixed with source files, scripts, and build outputs.

The Update module needs a stable boundary before it can safely check, preview, and apply source changes.

## Decision

Use a protected desktop profile as the runtime owner for local user data and runtime configuration.

The default profile for the editable desktop shell is repository-local and ignored:

```text
logs/desktop-profile/
  data/
    promptcard.sqlite3
    assets/
  backups/
  logs/
  agent-runtime/
    .deer-flow/
  config/
    desktop-shell.json
    update-source.json
```

`scripts/start-desktop-dev-services.ps1` is the entrypoint that derives:

- `PROMPTCARD_STORAGE_DATA_DIR`
- `PROMPTCARD_LOGS_DIR`
- `DEER_FLOW_HOME`
- `PROMPTCARD_LIBRARY_FILE`

from the selected profile root.

When the protected profile is first used, existing repository-local `data/` and `agent-runtime/.deer-flow/` content may be copied into the profile as a compatibility seed. The seed copy is non-destructive: existing profile files are not overwritten, and legacy repository data is not deleted.

The sidebar Update module replaces the Me screen `git pull --ff-only` shortcut with a safer check/preview/backup/apply flow that treats profile data as out of scope for source updates. The old `git_pull_source` Tauri command may remain only for compatibility with old desktop builds.

## Alternatives Considered

### Continue using repository `data/` as the default runtime store

- Pros: Minimal implementation change and familiar for current local development.
- Cons: Keeps user data visually mixed with source and makes update boundaries harder to explain.
- Rejected because the Update module needs a clearer source/data split.

### Use system AppData as the default immediately

- Pros: Closest to packaged desktop application behavior.
- Cons: Moves runtime state outside the currently opened workspace and introduces more environment and permission variation.
- Rejected for this phase because current workspace policy requires all generated project state to remain inside the opened workspace.

### Keep direct `git pull --ff-only` as the product update path

- Pros: Simple and already implemented.
- Cons: It updates the whole worktree and cannot express protected data/config boundaries or pre-update backups.
- Rejected as a product architecture. It may remain as a temporary developer-only command.

## Consequences

- Source updates operate against code, scripts, and documentation; durable user data belongs to the profile.
- The storage service continues to own projects, presets, Recent Captures, asset metadata, and asset bytes through `PROMPTCARD_STORAGE_DATA_DIR`.
- Browser-side `localforage` and `localStorage` data remains a separate legacy/browser profile concern until a future settings migration.
- Documentation and tests must describe the profile as the default desktop runtime boundary.
- The Update module can operate around this boundary without deciding storage ownership again.
