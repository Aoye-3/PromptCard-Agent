# Local App Data Layout

PromptCard keeps editable-development durable storage in the repository's ignored `data/` directory. Runtime diagnostics and desktop configuration remain under `logs/`:

```text
data/
logs/
backups/
```

This preserves the existing database and asset history without creating a second data root. Git ignores the durable files, and source updates must explicitly protect `data/` and `backups/`. See [ADR-007](../decisions/ADR-007-repository-data-root-for-editable-development.md).

## Editable-Development Layout

Directory contract:

```text
data/
  promptcard.sqlite3
  promptcard.sqlite3-wal
  promptcard.sqlite3-shm
  assets/
  capture-staging/

backups/

logs/
  dev-runtime.json
  tauri.dev-runtime.conf.json
  desktop-profile/
    agent-runtime/
      .promptcard-runtime/
        promptcard-model-connections.json
    config/
      desktop-shell.json
      update-source.json
```

`data/` is the only editable-development Storage Service root. `logs/desktop-profile/` may still group runtime configuration, logs, and Agent state, but it must not contain a second live `promptcard.sqlite3` or asset directory.

## Environment Contract

Maintained launchers own the runtime environment:

- `PROMPTCARD_STORAGE_DATA_DIR`: repository `data/`.
- `PROMPTCARD_DESKTOP_PROFILE_ROOT`: optional runtime configuration root under `logs/desktop-profile/`.
- `PROMPTCARD_LOGS_DIR`: runtime log directory under `logs/`.
- `PROMPTCARD_RUNTIME_STATE_DIR`: Agent Runtime state selected by the launcher.
- `PROMPTCARD_LIBRARY_FILE`: legacy JSON compatibility path only; live presets are in SQLite.

The storage service must treat `PROMPTCARD_STORAGE_DATA_DIR` as the durable data root. Startup must compare the health response with the expected repository path and reject mismatches.

## Compatibility Migration

Legacy JSON and browser caches remain explicit migration sources:

```text
data/*.json
browser localforage projects/presets
```

They may initialize or migrate an empty SQLite database transactionally. They do not replace the live `data/promptcard.sqlite3`, and migration must not delete source records automatically.

## File Ownership

- `data/promptcard.sqlite3`: active and deleted projects, Prompt Library presets, revisions, ordering, asset metadata, Recent Capture metadata, and migration records.
- `data/assets/`: uploaded PNG, JPEG, WebP, MP4, and WebM assets referenced by `assetId`.
- Legacy JSON files are preserved as read-only migration sources and are no longer runtime write targets.
- Agent Runtime state: model connection metadata in the launcher-selected workspace path. pi text sessions are process-local.
- `logs/`: desktop-launched storage/Agent logs, runtime manifests, and generated Tauri configuration.
- `backups/`: automatic JSON migration backups and SQLite-consistent manual or pre-update snapshots.
- `logs/desktop-profile/config/desktop-shell.json`: desktop shell runtime metadata when the Profile config surface is used.
- `logs/desktop-profile/config/update-source.json`: sidebar Update module repository URL, remote name, branch, and last-check metadata.

Browser storage remains outside this filesystem profile. `localforage` still owns UI-only cache, prompt history, templates, settings, and legacy migration flags; `localStorage` still owns language, Agent sessions, and the older AI settings record.

## Update Boundary

Source updates affect the Git worktree:

```text
src/
promptcard_storage/
agent-runtime/backend/
text-agent-runtime/
scripts/
docs/
src-tauri/
vite/
package.json
package-lock.json
```

Durable `data/`, `backups/`, and local runtime state are not part of a source update. The sidebar Update module stores its source configuration under `logs/`, previews remote changes with Git, blocks protected or manual-review paths, creates a storage backup, then applies source changes only with `git merge --ff-only FETCH_HEAD`.

The removed DeerFlow directories and `agent-runtime/config.yaml` are not part of the maintained update or runtime contract. Provider-neutral connection metadata lives under `PROMPTCARD_RUNTIME_STATE_DIR`; credentials live only in the operating-system keyring.

The legacy desktop `git_pull_source` action remains only for compatibility with old desktop builds. Product UI should use the guarded Update screen.

## Schema Rule

The SQLite store currently uses schema version `5`. Future schema changes should:

1. Detect the existing schema version at startup.
2. Create a consistent backup under repository `backups/`.
3. Apply the migration in a transaction.
4. Record the new version in `schema_migrations` only after verification succeeds.

## Distribution Boundary

The repository-local `data/` contract is for editable desktop development. Before distributing the application:

1. Migrate the storage root to the packaged app's approved user-data directory.
2. Keep user data outside release commits and source archives.
3. Verify packaged builds do not contain local Agent Runtime state or credentials.
4. Preserve the same SQLite/assets contract so storage and update code do not need a second data model.
