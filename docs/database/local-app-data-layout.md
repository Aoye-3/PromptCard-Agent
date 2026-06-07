# Local App Data Layout

The current self-use desktop dev shell defaults to repository-local data so the complete `data/` directory can be backed up through the private GitHub repository. This currently includes active data, archives, and trash files.

This AppData layout is the optional future distribution profile. Use it only when `PROMPTCARD_DESKTOP_USE_APPDATA_PROFILE=1` is set.

## Desktop Dev Profile

Optional profile root:

```text
%APPDATA%\PromptCard-Manager\dev-profile
```

Directory contract:

```text
dev-profile/
  data/
    projects.json
    project-trash.json
    prompt-library-presets.json
    prompt-library-trash.json
  agent-runtime/
    .deer-flow/
      data/
      promptcard-model-config.json
  logs/
  backups/
  config/
    desktop-shell.json
```

## File Ownership

- `data/projects.json`: active PromptCard projects.
- `data/project-trash.json`: deleted PromptCard projects.
- `data/prompt-library-presets.json`: active Prompt Library presets.
- `data/prompt-library-trash.json`: deleted Prompt Library presets.
- `agent-runtime/.deer-flow/data/`: Agent Runtime SQLite state.
- `agent-runtime/.deer-flow/promptcard-model-config.json`: local Agent model configuration.
- `logs/`: desktop-launched storage and Agent Runtime logs.
- `backups/`: reserved for future schema migration backups.
- `config/desktop-shell.json`: desktop shell profile metadata.

## Update Boundary

Source updates affect the Git worktree:

```text
src/
promptcard_storage/
agent-runtime/
scripts/
docs/
src-tauri/
```

In the current self-use mode, source updates affect the Git worktree and all files under `data/` are intentionally eligible for commit. Agent Runtime state under `agent-runtime/.deer-flow/` remains outside the Git backup boundary. In optional AppData profile mode, source updates must not write to the desktop dev profile except through normal app/runtime usage after startup.

## Distribution Boundary

The repository-local full-data backup policy is for private self-use only. Before distributing the application:

1. Remove personal project, library, archive, and trash data from the source tree.
2. Restore an ignore policy that prevents user data from entering release commits.
3. Make the AppData profile the default runtime data location.
4. Verify packaged builds do not contain local Agent Runtime state or credentials.

## Schema Rule

The current JSON store schema uses `schemaVersion: 1`. Future data structure changes should:

1. Detect the existing schema version at startup.
2. Copy affected files into `backups/`.
3. Apply migration.
4. Write the new schema version only after migration succeeds.
