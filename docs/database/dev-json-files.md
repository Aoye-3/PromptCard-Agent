# Legacy Development JSON Files

The following files are one-time SQLite migration sources:

- `data/projects.json`
- `data/project-trash.json`
- `data/prompt-library-presets.json`
- `data/prompt-library-trash.json`

When `data/promptcard.sqlite3` does not exist, the storage service strictly validates these files, copies them into a timestamped backup, and imports them transactionally. After migration they remain unchanged and are not runtime write targets.

Vite exposes read-only `GET /__promptcard/projects` and `GET /__promptcard/presets` views for diagnostics. Their former `PUT` methods return `410 Gone`.
