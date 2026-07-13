# Data Storage And Update System

## Purpose

This document is the single map for PromptCard data ownership, development/example data, and the future GitHub-based source update mechanism.

The core rule is simple: source can be updated from GitHub; user data must not be overwritten by source updates.

## Data Ownership Model

| Data kind | Owner | Default location | GitHub update may overwrite? | Notes |
| --- | --- | --- | --- | --- |
| User projects | User | `logs/desktop-profile/data/promptcard.sqlite3` | No | `projects` rows, active and Trash state, revisions, and full project JSON payloads. |
| Prompt Library presets | User | `logs/desktop-profile/data/promptcard.sqlite3` | No | `presets` rows, active and Trash state, ordering, usage counts, and full preset JSON payloads. |
| Recent Captures | User | `logs/desktop-profile/data/promptcard.sqlite3` | No | Capture inbox metadata with `assetId` references. |
| User media assets | User | `logs/desktop-profile/data/assets/` | No | PNG, JPEG, WebP, MP4, and WebM bytes. Projects and presets store references only. |
| User backups | User | `logs/desktop-profile/backups/` | No | Manual, migration, and pre-update snapshots. |
| Desktop logs | User/runtime | `logs/desktop-profile/logs/` | No | Runtime diagnostics for the editable desktop shell. |
| Agent Runtime state | User/runtime | `logs/desktop-profile/agent-runtime/.deer-flow/` | No | Memory, threads, uploads, outputs, and local model configuration. |
| Desktop profile metadata | User/runtime | `logs/desktop-profile/config/desktop-shell.json` | No | Profile identity and source-root metadata. |
| Update source metadata | User/runtime | `logs/desktop-profile/config/update-source.json` | No | GitHub repository URL, remote name, branch, last checked commit, and check timestamp. |
| Browser UI cache | User/browser profile | localforage `PromptCard/promptcard` | No | Settings, prompt history, templates, old migration markers, and UI-only cache. |
| Browser local settings | User/browser profile | localStorage | No | Language, Agent sessions, and older AI settings such as `prompt_card_config`. |
| Bundled prompt seeds | Source/example | `public/prompt-library-presets.json` | Yes | Read by the storage service only when seeding an empty database. |
| Documentation assets | Source/example | `docs/assets/` | Yes | Example/reference material for documentation. |
| Test fixtures | Source/example | test files and fixture directories | Yes | Maintained with code and allowed to change through source updates. |
| Source code and scripts | Source | `src/`, `promptcard_storage/`, `src-tauri/`, `scripts/`, `vite/`, selected `agent-runtime/` source directories | Yes | Managed by the project repository. |
| Package and build metadata | Source | `package*.json`, `tsconfig*.json`, `vite.config.ts`, Tauri/Rust manifests | Yes | Managed by the project repository. |

## Protected Profile Contract

The editable desktop shell uses a protected profile by default:

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

`scripts/start-desktop-dev-services.ps1` derives the runtime environment from that profile:

| Environment variable | Value |
| --- | --- |
| `PROMPTCARD_DESKTOP_PROFILE_ROOT` | Selected profile root, defaulting to `logs/desktop-profile`. |
| `PROMPTCARD_STORAGE_DATA_DIR` | `<profile>/data`. |
| `PROMPTCARD_LOGS_DIR` | `<profile>/logs`. |
| `DEER_FLOW_HOME` | `<profile>/agent-runtime/.deer-flow`. |
| `PROMPTCARD_LIBRARY_FILE` | `<profile>/data/prompt-library-presets.json`. |

Legacy repository-local `data/` and `agent-runtime/.deer-flow/` paths are compatibility seed sources only. On first profile startup, missing profile files may be copied from those locations. This seed step must not overwrite profile files and must not delete legacy files.

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

Runtime code may read source-owned examples as seeds or fixtures, but it must write user changes to the protected profile or browser-owned storage, not back into source example files.

## Source Update Allowlist

Automatic source updates may apply changes under these source-owned paths:

- `src/` for AppShell and frontend code.
- `src-tauri/` for the desktop shell.
- `promptcard_storage/` for the local storage service.
- `scripts/`, `docs/`, `public/`, and `vite/`.
- `agent-runtime/backend/` for Agent Runtime backend and AgentHarness code.
- `agent-runtime/scripts/` and `agent-runtime/docker/` for runtime operations code.
- `agent-runtime/skills/public/` for bundled public skills.
- Root package, TypeScript, Vite, Tailwind, ESLint, and desktop launcher metadata.

Automatic source updates must not apply changes under protected or local-only runtime paths:

- `logs/desktop-profile/`
- `data/`
- `backups/`
- `.env*` at any level
- `API-Key.txt`
- `agent-runtime/.deer-flow/`
- `agent-runtime/.agent/`

`agent-runtime/config.yaml` remains `manual-review` until it is split into a checked-in template plus Profile-owned local override.

## GitHub Source Update Mechanism

The sidebar Update module uses a GitHub repository URL or the current `origin` remote to update source-owned files. It does not treat GitHub as a user-data backup.

The desktop shell exposes these Tauri commands:

| Command | Responsibility |
| --- | --- |
| `update_get_config` | Read `config/update-source.json`, filling missing values from the current Git remote and branch. |
| `update_save_config` | Persist the selected repository URL, remote name, and branch into the protected profile. |
| `update_check` | Run `git ls-remote` against the configured branch and record the latest remote commit. |
| `update_preview` | Run `git fetch --no-tags <repoUrl> <branch>`, diff `HEAD..FETCH_HEAD`, and classify changed paths. |
| `update_apply` | Require a clean source worktree, create a Profile backup, block protected/manual paths, then run `git merge --ff-only FETCH_HEAD`. |

Current update flow:

1. Check the remote with `git ls-remote`.
2. Preview with `git fetch` and compare the current source revision with `FETCH_HEAD`.
3. Classify changed paths as source-owned, protected user data/config, or manual review.
4. Block automatic update if any protected or manual-review path would be touched.
5. Block automatic update if the source worktree has uncommitted changes.
6. Create a Profile backup under `logs/desktop-profile/backups/source-update-<timestamp>/`.
7. Apply source updates with `git merge --ff-only FETCH_HEAD`.
8. Return `requiresDependencyInstall` when package or Rust dependency manifests changed; v1 does not run dependency installation from the app.
9. Ask the user to restart the desktop shell after a successful source update.

The older desktop `git_pull_source` command remains only for compatibility. Product UI should use the sidebar Update module.

## Update Blocking Conditions

Automatic updates must stop and ask for manual review when:

- the source worktree has uncommitted tracked changes;
- a remote change touches protected data/config paths;
- profile backup creation fails;
- SQLite integrity check fails;
- the storage service is still writing or cannot be stopped safely;
- source update requires a data migration that is not implemented for the current schema version;
- dependency installation or build steps would write outside the current workspace or existing drive;
- GitHub/network access fails or returns an unexpected repository identity.

## Related Documents

- [ADR-004: Keep User Data In A Protected Desktop Profile](../decisions/ADR-004-protected-profile-data-boundary.md)
- [Local App Data Layout](../database/local-app-data-layout.md)
- [Local Storage Service](../database/local-storage-service.md)
- [Frontend Storage Model](../frontend/storage-model.md)
- [Desktop Dev Shell](../operations/desktop-dev-shell.md)
- [Update Module Integration Plan](../Plan/004-update-module-integration.md)
