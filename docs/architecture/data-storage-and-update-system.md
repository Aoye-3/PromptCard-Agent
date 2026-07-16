# Data Storage And Update System

## Purpose

This document is the single map for PromptCard data ownership, development/example data, and the future GitHub-based source update mechanism.

The core rule is simple: source can be updated from GitHub; user data must not be overwritten by source updates.

## Data Ownership Model

| Data kind | Owner | Default location | GitHub update may overwrite? | Notes |
| --- | --- | --- | --- | --- |
| User projects | User | `data/promptcard.sqlite3` | No | `projects` rows, active and Trash state, revisions, and full project JSON payloads. |
| Prompt Library presets | User | `data/promptcard.sqlite3` | No | `presets` rows, active and Trash state, ordering, usage counts, and full preset JSON payloads. |
| Recent Captures | User | `data/promptcard.sqlite3` | No | Capture inbox metadata with `assetId` references. |
| User media assets | User | `data/assets/` | No | PNG, JPEG, WebP, and future MP4 bytes. Projects and presets store references only. |
| User backups | User | `backups/` | No | Migration, manual, and pre-update snapshots. |
| Desktop logs | User/runtime | `logs/desktop-profile/logs/` | No | Runtime diagnostics for the editable desktop shell. |
| Agent Runtime state | User/runtime | `logs/desktop-profile/agent-runtime/.promptcard-runtime/` | No | Model connection metadata; pi conversation state is process-local. |
| Desktop profile metadata | User/runtime | `logs/desktop-profile/config/desktop-shell.json` | No | Profile identity and source-root metadata. |
| Update source metadata | User/runtime | `logs/desktop-profile/config/update-source.json` | No | GitHub repository URL, remote name, branch, last checked commit, and check timestamp. |
| Browser UI cache | User/browser profile | localforage `PromptCard/promptcard` | No | Settings, prompt history, templates, old migration markers, and UI-only cache. |
| Browser local settings | User/browser profile | localStorage | No | Language, Agent sessions, and older AI settings such as `prompt_card_config`. |
| Bundled prompt seeds | Source/example | `public/prompt-library-presets.json` | Yes | Read by the storage service only when seeding an empty database. |
| Documentation assets | Source/example | `docs/assets/` | Yes | Example/reference material for documentation. |
| Test fixtures | Source/example | test files and fixture directories | Yes | Maintained with code and allowed to change through source updates. |
| Source code and scripts | Source | `src/`, `promptcard_storage/`, `src-tauri/`, `scripts/`, `vite/`, selected `agent-runtime/` source directories | Yes | Managed by the project repository. |
| Package and build metadata | Source | `package*.json`, `tsconfig*.json`, `vite.config.ts`, Tauri/Rust manifests | Yes | Managed by the project repository. |

## Editable-Development Data Contract

The editable desktop shell uses one ignored durable storage root:

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
    logs/
    agent-runtime/
      .promptcard-runtime/
        promptcard-model-connections.json
    config/
      desktop-shell.json
      update-source.json
```

Maintained editable-development launchers must derive storage and runtime paths consistently:

| Environment variable | Value |
| --- | --- |
| `PROMPTCARD_STORAGE_DATA_DIR` | `<repository>/data`. |
| `PROMPTCARD_LOGS_DIR` | Runtime log directory under `logs/`. |
| `PROMPTCARD_DESKTOP_PROFILE_ROOT` | Optional runtime config/log root under `logs/desktop-profile`; it does not own Storage Service data. |
| `PROMPTCARD_RUNTIME_STATE_DIR` | Agent Runtime state directory selected by the launcher. |
| `PROMPTCARD_LIBRARY_FILE` | Legacy JSON compatibility path only; live Prompt Library records are in SQLite. |

Startup must verify that Storage Service health reports the expected repository `data/` path. A healthy service pointing to another directory is an error, not an alternate profile to reuse silently. Legacy JSON files and browser cache remain migration sources; the SQLite database and asset directory under `data/` are the live source of truth.

## Durable Storage Responsibilities

The local storage service owns durable project data:

- SQLite database: projects, presets, Recent Captures, assets metadata, Trash state, schema migrations, and browser import markers.
- Assets directory: uploaded media bytes addressed by generated `assetId` values.
- Backup/restore: SQLite-consistent backups that include both database and asset files.
- Migration: read-only import from legacy JSON and browser cache.

Frontend code must use `src/utils/storage.ts` and `/storage-api/*`. It must not write project, preset, Recent Capture, or asset data directly to files.

Browser storage remains user-owned but separate from the filesystem profile. It is not currently migrated into SQLite unless a feature-specific migration explicitly says so.

## Development And Example Data

Development/example data is source-owned only when it is intentionally checked into the repository:

- bundled preset seed files;
- documentation examples and images;
- tests and fixtures;
- `.env.example` and sample configuration;
- generated example data that is explicitly reviewed and committed as a fixture.

Development/example data must never contain:

- real user projects;
- real user media;
- real API keys or tokens;
- local Agent Runtime memory, thread data, uploads, or outputs.

Runtime code may read source-owned examples as seeds or fixtures, but durable project/media changes must go through the Storage Service into the ignored `data/` root. UI-only browser data remains in browser-owned storage.

## Source Update Allowlist

Automatic source updates may apply changes under these source-owned paths:

- `src/` for AppShell and frontend code.
- `src-tauri/` for the desktop shell.
- `promptcard_storage/` for the local storage service.
- `scripts/`, `docs/`, `public/`, and `vite/`.
- `agent-runtime/backend/` for the Python PromptCard Gateway.
- `text-agent-runtime/` for the pi text Agent.
- Root package, TypeScript, Vite, Tailwind, ESLint, and desktop launcher metadata.

Automatic source updates must not apply changes under protected or local-only runtime paths:

- `logs/desktop-profile/`
- `data/`
- `backups/`
- `.env*` at any level
- `API-Key.txt`
- `agent-runtime/.promptcard-runtime/`
- `agent-runtime/.agent/`


## GitHub Source Update Mechanism

The sidebar Update module uses a GitHub repository URL or the current `origin` remote to update source-owned files. It does not treat GitHub as a user-data backup.

The desktop shell exposes these Tauri commands:

| Command | Responsibility |
| --- | --- |
| `update_get_config` | Read `config/update-source.json`, filling missing values from the current Git remote and branch. |
| `update_save_config` | Persist the selected repository URL, remote name, and branch into local runtime configuration under `logs/`. |
| `update_check` | Run `git ls-remote` against the configured branch and record the latest remote commit. |
| `update_preview` | Run `git fetch --no-tags <repoUrl> <branch>`, diff `HEAD..FETCH_HEAD`, and classify changed paths. |
| `update_apply` | Require a clean source worktree, create a storage backup, block protected/manual paths, then run `git merge --ff-only FETCH_HEAD`. |

Current update flow:

1. Check the remote with `git ls-remote`.
2. Preview with `git fetch` and compare the current source revision with `FETCH_HEAD`.
3. Classify changed paths as source-owned, protected user data/config, or manual review.
4. Block automatic update if any protected or manual-review path would be touched.
5. Block automatic update if the source worktree has uncommitted changes.
6. Create a storage backup under `backups/source-update-<timestamp>/`.
7. Apply source updates with `git merge --ff-only FETCH_HEAD`.
8. Return `requiresDependencyInstall` when package or Rust dependency manifests changed; v1 does not run dependency installation from the app.
9. Ask the user to restart the desktop shell after a successful source update.

The older desktop `git_pull_source` command remains only for compatibility. Product UI should use the sidebar Update module.

## Update Blocking Conditions

Automatic updates must stop and ask for manual review when:

- the source worktree has uncommitted tracked changes;
- a remote change touches protected data/config paths;
- Storage Service backup creation fails;
- SQLite integrity check fails;
- the storage service is still writing or cannot be stopped safely;
- source update requires a data migration that is not implemented for the current schema version;
- dependency installation or build steps would write outside the current workspace or existing drive;
- GitHub/network access fails or returns an unexpected repository identity.

## Related Documents

- [ADR-007: Use The Repository Data Root During Editable Development](../decisions/ADR-007-repository-data-root-for-editable-development.md)
- [ADR-004: Keep User Data In A Protected Desktop Profile (partially superseded)](../decisions/ADR-004-protected-profile-data-boundary.md)
- [Local App Data Layout](../database/local-app-data-layout.md)
- [Local Storage Service](../database/local-storage-service.md)
- [Frontend Storage Model](../frontend/storage-model.md)
- [Desktop Dev Shell](../operations/desktop-dev-shell.md)
- [Update Module Integration Plan](../Plan/004-update-module-integration.md)
