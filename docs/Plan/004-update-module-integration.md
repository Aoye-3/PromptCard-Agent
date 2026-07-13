# 004: Update Module Integration

## Status

Active

## Purpose

Track implementation of the sidebar Update module. This plan depends on the protected profile boundary from ADR-004: user projects, presets, media, backups, logs, and Agent Runtime state belong to the profile, not to source updates.

## Product Direction

Add a top-level **Update** entry to the left sidebar. The module replaces the temporary `git pull --ff-only` action from the Me screen settings panel.

The Update module owns:

- checking the configured public source repository for available updates;
- showing current version, latest version, and changed source paths;
- classifying changes as safe source changes, protected data/config changes, or manual-review changes;
- creating a Profile backup before applying source changes;
- reporting whether dependency installation is required after source update.

## Current Non-Goals

- Do not move browser `localStorage` or `localforage` records.
- Do not delete legacy repository `data/` or Agent Runtime state.
- Do not clone the repository, use Git worktrees, run `git reset --hard`, or auto-stash changes.
- Do not run dependency installation from inside the app in v1.
- Do not treat GitHub as a user-data backup.

## Architecture Checkpoints

1. Protected profile is the default desktop runtime boundary.
2. Storage health reports a profile `data/` path during desktop startup.
3. Profile data can be backed up independently of the source worktree.
4. Update module API design can assume source paths and profile paths are separate.

## Implementation Slices

1. Add Profile update config at `logs/desktop-profile/config/update-source.json`.
2. Add Tauri commands: `update_get_config`, `update_save_config`, `update_check`, `update_preview`, and `update_apply`.
3. Add source diff classification against an allowlist of managed source paths, including Agent Runtime backend, AgentHarness, runtime scripts, runtime Docker files, and bundled public skills.
4. Add a Profile backup step before `git merge --ff-only FETCH_HEAD`.
5. Add a left sidebar Update screen that displays status, changed paths, blocked/manual-review reasons, backup path, and dependency-install requirement.
6. Remove the Me screen `git pull --ff-only` developer shortcut from product UI.

## Acceptance Criteria

- User data remains unchanged after checking for updates.
- Applying an update is blocked if protected profile paths or tracked user configuration would be touched.
- A restorable backup exists before source files are changed.
- The app restarts with the same projects, Prompt Library presets, media assets, and Agent Runtime config visible.
- Source updates are applied only through fast-forward Git merge.
- The sidebar contains a visible **Update** entry.
- Agent Runtime state remains protected while Agent Runtime and AgentHarness source code can update automatically.
