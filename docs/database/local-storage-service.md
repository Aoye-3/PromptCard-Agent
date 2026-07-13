# Local Storage Service

`promptcard_storage` is the sole durable owner of projects, Prompt Library presets, Trash state, asset metadata, asset bytes, and Recent Capture metadata. Runtime records are stored under the configured `PROMPTCARD_STORAGE_DATA_DIR`, which the desktop dev shell derives from the protected profile by default:

```text
logs/desktop-profile/data/
  promptcard.sqlite3
  assets/
```

The repository-local `data/` fallback remains a compatibility path for direct service startup and legacy migration, not the preferred desktop runtime location.

## SQLite Contract

- `SqliteStore` is the compatibility facade for project, Prompt Library, and Recent Capture CRUD plus transaction ownership. `StorageInitializer`, `AssetStore`, and `BackupManager` own JSON initialization, asset files/diagnostics, and consistent backup creation respectively.
- FastAPI routes are registered by `create_app(storage)`, allowing route contract tests to inject an isolated temporary store while the exported default `app` keeps the existing service startup contract.
- Schema version `1` uses `projects`, `presets`, `assets`, `schema_migrations`, and `browser_imports`.
- Schema version `2` adds `recent_captures`. Existing version `1` databases migrate in place at startup by creating the table and recording the migration.
- Projects and presets retain their existing JSON payload. Indexed columns own revision, status, ordering, usage, and timestamps.
- Recent Capture rows retain their full JSON payload while indexed columns own `asset_id`, `kind`, `status`, capture time, timestamps, and revision.
- Active and Trash records share one table. Delete and restore are single transactions.
- Connections enable WAL, foreign keys, a busy timeout, and full synchronous durability. Writes begin with `BEGIN IMMEDIATE`.
- Duplicate creates and stale revisions return conflicts instead of overwriting data.
- Asset diagnostics include references from projects, presets, and Recent Capture records before reporting unreferenced files.

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
```
