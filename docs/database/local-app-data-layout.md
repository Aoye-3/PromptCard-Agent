# Local App Data Layout

PromptCard separates editable source files from protected user data. The desktop dev shell now defaults runtime state to an ignored profile directory under the current repository:

```text
logs/desktop-profile
```

This keeps all generated state inside the opened workspace while giving Git source updates a clear boundary. See [ADR-004](../decisions/ADR-004-protected-profile-data-boundary.md).

## Protected Desktop Profile

Directory contract:

```text
logs/desktop-profile/
  data/
    promptcard.sqlite3
    promptcard.sqlite3-wal
    promptcard.sqlite3-shm
    assets/
  backups/
  logs/
  agent-runtime/
    .deer-flow/
      data/
      promptcard-model-config.json
  config/
    desktop-shell.json
    update-source.json
```

The profile root can still be overridden with `PROMPTCARD_DESKTOP_PROFILE_ROOT`, but it should stay inside the current workspace unless a packaged distribution explicitly owns the migration.

## Environment Contract

`scripts/start-desktop-dev-services.ps1` owns the profile environment:

- `PROMPTCARD_DESKTOP_PROFILE_ROOT`: selected profile root.
- `PROMPTCARD_STORAGE_DATA_DIR`: profile `data/`.
- `PROMPTCARD_LOGS_DIR`: profile `logs/`.
- `DEER_FLOW_HOME`: profile `agent-runtime/.deer-flow/`.
- `PROMPTCARD_LIBRARY_FILE`: profile `data/prompt-library-presets.json`.

The storage service must treat `PROMPTCARD_STORAGE_DATA_DIR` as the durable data root. Its repository-local fallback exists for compatibility only.

## Compatibility Seeding

Legacy repository paths remain read-only migration sources:

```text
data/
agent-runtime/.deer-flow/
```

On first protected-profile startup, missing profile files can be copied from those legacy locations. The copy is conservative:

- existing profile files are not overwritten;
- legacy repository files are not deleted;
- SQLite, WAL files, asset files, and Agent Runtime state stay together inside the profile after seeding.

## File Ownership

- `data/promptcard.sqlite3`: active and deleted projects, Prompt Library presets, revisions, ordering, asset metadata, Recent Capture metadata, and migration records.
- `data/assets/`: uploaded PNG, JPEG, WebP, MP4, and WebM assets referenced by `assetId`.
- Legacy JSON files are preserved as read-only migration sources and are no longer runtime write targets.
- `agent-runtime/.deer-flow/`: local Agent Runtime state, memory, thread data, uploads, outputs, and model config.
- `logs/`: desktop-launched storage and Agent Runtime logs.
- `backups/`: automatic JSON migration backups and SQLite-consistent manual or pre-restore snapshots.
- `config/desktop-shell.json`: desktop shell profile metadata.
- `config/update-source.json`: sidebar Update module repository URL, remote name, branch, and last check metadata.

Browser storage remains outside this filesystem profile. `localforage` still owns UI-only cache, prompt history, templates, settings, and legacy migration flags; `localStorage` still owns language, Agent sessions, and the older AI settings record.

## Update Boundary

Source updates affect the Git worktree:

```text
src/
promptcard_storage/
agent-runtime/backend/
agent-runtime/scripts/
agent-runtime/docker/
agent-runtime/skills/public/
scripts/
docs/
src-tauri/
vite/
package.json
package-lock.json
```

Profile data is not part of a source update. The sidebar Update module stores its source configuration in the profile, previews remote changes with Git, blocks protected or manual-review paths, creates a Profile backup, then applies source changes only with `git merge --ff-only FETCH_HEAD`.

`agent-runtime/config.yaml` is not automatically applied yet. It remains a manual-review file until runtime configuration is split into a source template and a Profile-owned local override.

The legacy desktop `git_pull_source` action remains only for compatibility with old desktop builds. Product UI should use the guarded Update screen.

## Schema Rule

The SQLite store currently uses schema version `2`. Future schema changes should:

1. Detect the existing schema version at startup.
2. Create a consistent backup under profile `backups/`.
3. Apply the migration in a transaction.
4. Record the new version in `schema_migrations` only after verification succeeds.

## Distribution Boundary

The repository-local protected profile is for editable desktop development. Before distributing the application:

1. Move the default profile to the packaged app's approved user-data directory.
2. Keep user data outside release commits and source archives.
3. Verify packaged builds do not contain local Agent Runtime state or credentials.
4. Preserve the same profile contract so storage and update code do not need a second data model.
