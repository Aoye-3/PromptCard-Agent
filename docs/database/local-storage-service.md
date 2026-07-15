# Local Storage Service

`promptcard_storage` is the sole durable owner of projects, Prompt Library presets, Trash state, asset metadata/bytes, Recent Capture metadata, and image-generation runs. During editable development, `PROMPTCARD_STORAGE_DATA_DIR` resolves to the repository data root:

```text
data/
  promptcard.sqlite3
  assets/
```

Every maintained launcher must use this same path and reject a healthy Storage Service whose `/health` response reports a different storage root. Packaged builds may move the same database/assets contract only through an explicit migration.

## SQLite Contract

- `SqliteStore` is the compatibility facade for project, Prompt Library, and Recent Capture CRUD plus transaction ownership. `StorageInitializer`, `AssetStore`, and `BackupManager` own JSON initialization, asset files/diagnostics, and consistent backup creation respectively.
- FastAPI routes are registered by `create_app(storage)`, allowing route contract tests to inject an isolated temporary store while the exported default `app` keeps the existing service startup contract.
- Schema version `1` uses `projects`, `presets`, `assets`, `schema_migrations`, and `browser_imports`.
- Schema version `2` adds `recent_captures`. Existing version `1` databases migrate in place at startup by creating the table and recording the migration.
- Schema version `3` adds append-only `image_generation_runs` plus project/node pagination indexes. Existing version `2` databases migrate in place without rewriting projects, presets, captures, or assets.
- Projects and presets retain their existing JSON payload. Indexed columns own revision, status, ordering, usage, and timestamps.
- Recent Capture rows retain their full JSON payload while indexed columns own `asset_id`, `kind`, `status`, capture time, timestamps, and revision.
- Image-generation rows retain the immutable normalized request snapshot and terminal result/error payload while indexed columns own project, node, connection, provider, model, state, and lifecycle timestamps.
- Active and Trash records share one table. Delete and restore are single transactions.
- Connections enable WAL, foreign keys, a busy timeout, and full synchronous durability. Writes begin with `BEGIN IMMEDIATE`.
- Duplicate creates and stale revisions return conflicts instead of overwriting data.
- Asset diagnostics include references from active/Trash projects, active/Trash Prompt presets, Recent Capture records, and succeeded generation-run `outputAssetIds` before reporting unreferenced files.

Image-generation history is not a child collection of a project. Deleting a node, trashing a project, or permanently deleting project Trash leaves matching runs queryable and their generated output assets strongly referenced. There is no ordinary run deletion API or automatic retention cleanup.

## JSON Migration

When `promptcard.sqlite3` is absent, startup strictly reads the four legacy JSON files. Invalid JSON, invalid shapes, or conflicting duplicate IDs abort startup without creating a database. If an active record and Trash record share an ID with identical business payloads, the newer active state wins and the redundant Trash copy is omitted. Valid source files and an asset manifest are copied to `backups/storage-json-v1-<UTC>/`, then imported and verified in one migration transaction.

Legacy JSON remains unchanged after migration and is never written again. The Vite compatibility endpoints are read-only.

## Maintenance

Use the maintenance module while the storage service is stopped. Point `--data-dir` at the active profile data directory:

```powershell
python -m promptcard_storage.maintenance --data-dir logs\desktop-profile\data backup logs\desktop-profile\backups\manual-backup
python -m promptcard_storage.maintenance --data-dir logs\desktop-profile\data diagnose-assets
python -m promptcard_storage.maintenance --data-dir logs\desktop-profile\data restore logs\desktop-profile\backups\manual-backup
```

Backups use the SQLite backup API and include the database, assets, and a manifest. Restore validates schema and database integrity and creates a pre-restore snapshot when current storage exists.

## Verification

`npm.cmd run storage:test` discovers every `test_*.py` file under `promptcard_storage/tests`. Core store tests run with the system Python. FastAPI route contract tests run when FastAPI is installed and otherwise report explicit skips; they can be run with the repository Agent backend environment:

```powershell
npm.cmd run storage:test
.\agent-runtime\backend\.venv\Scripts\python.exe -m unittest promptcard_storage.tests.test_app
.\agent-runtime\backend\.venv\Scripts\python.exe -m pytest promptcard_storage/tests/test_image_runs.py -q
Push-Location agent-runtime\backend
.\.venv\Scripts\python.exe -m pytest tests\test_image_generation_storage_integration.py -q
Pop-Location
```
