# ADR-007: Use The Repository Data Root During Editable Development

## Status

Accepted

## Date

2026-07-14

## Context

The editable desktop runtime already has durable projects, Prompt Library presets, Recent Captures, asset metadata, and media files under the repository `data/` directory. SQLite files, JSON runtime records, and `data/assets/` are ignored by Git. The active Storage Service reports this directory as its data root, while the previously documented `logs/desktop-profile/data/` directory does not exist.

Moving existing data into `logs/desktop-profile/data/` would require migration, create two plausible sources of truth, and make an empty Profile look like lost user data. The `logs/` name also suggests disposable diagnostics and is a poor owner for durable projects and media.

The product still needs a clear source-update boundary and a future packaged-app data location. Those requirements do not require moving editable-development storage away from the established, ignored repository data root.

## Decision

Use the following paths as the canonical editable-development storage contract:

```text
data/
  promptcard.sqlite3
  promptcard.sqlite3-wal
  promptcard.sqlite3-shm
  assets/
  capture-staging/   # reserved for the recording phase

backups/
```

`PROMPTCARD_STORAGE_DATA_DIR` must resolve to the repository `data/` directory for every maintained editable-development launcher. Startup health checks should reject a healthy Storage Service that points somewhere else instead of silently mixing profiles.

The Storage Service remains the sole durable owner of projects, Prompt presets, Recent Captures, asset metadata, and asset bytes. `logs/` may contain runtime logs, the dynamic-port manifest, Tauri runtime configuration, and desktop/update metadata, but it is not the durable Storage Service data root.

Source updates must continue to treat `data/` and `backups/` as protected ignored user paths. A packaged distribution may later migrate the same database/assets contract to its approved application-data directory through an explicit, verified migration.

## Alternatives Considered

### Move storage to `logs/desktop-profile/data/`

- Pros: visually separates source and runtime data and groups it with other desktop Profile state.
- Cons: the directory is absent, existing data needs migration, two data roots can be selected by different launchers, and `logs/` appears disposable.
- Rejected for editable development because the existing ignored `data/` root already provides the required Git boundary with less migration risk.

### Move immediately to system AppData

- Pros: matches normal packaged-desktop conventions.
- Cons: moves development state outside the opened workspace and requires a migration and additional permission handling.
- Rejected until a packaged distribution owns that migration.

### Allow each launcher to choose its own data root

- Pros: maximum flexibility.
- Cons: users see different projects depending on how the app was started and asset diagnostics operate on only one of several stores.
- Rejected because editable development needs one observable source of truth.

## Consequences

- Existing projects and assets remain available without migration.
- Prompt Library, Recent Captures, and Free Canvas continue to share one SQLite database and one physical asset directory.
- The repository `data/` directory is user-owned even though it lives beside source; update and cleanup tools must never treat it as source-owned.
- Runtime logs/configuration may remain under `logs/`, but documentation must not call `logs/desktop-profile/data/` the default storage root.
- ADR-004 remains applicable to runtime logs/configuration and update safety, but its Storage Service location decision is superseded by this ADR.
