# Desktop Dev Shell

The desktop dev shell is a Tauri window for local self-use while the source tree remains editable. It is not the production packaged app and it does not use GitHub Releases or a remote updater.

## What It Does

- Starts or reuses the local storage service, Agent Runtime, and Vite frontend.
- Opens a desktop window titled `PromptCard Manager Dev Shell`.
- Loads `http://127.0.0.1:3000/`, so Vite hot reload still reflects source edits.
- Stops the local storage service, Agent Runtime, and Vite frontend when the desktop window closes.
- Shows a desktop-only source update action under the Me screen settings.

## Commands

Windows Tauri development requires Rust plus Microsoft C++ Build Tools. If `cargo check` fails with `link.exe not found`, install Visual Studio Build Tools with the Visual C++ workload and retry.

Run from the project root:

```powershell
npm.cmd run tauri:dev
```

Or double-click:

```text
start-desktop.bat
```

`start-desktop.bat` is only a launcher. It starts `npm.cmd run tauri:dev` in a detached hidden process and exits after a successful launch request, so closing the launcher terminal does not close the desktop window or its local services.

Tauri runs:

```powershell
npm.cmd run desktop:dev-services
```

That script delegates to `scripts/start-dev-with-agent.ps1`. For self-use development, it defaults to the normal repository-local data and runtime paths so the same data can be backed up through Git.

## Data Profile

The desktop shell defaults to the existing repository-local development data:

```text
data/projects.json
data/prompt-library-presets.json
agent-runtime/.deer-flow
```

The complete `data/` directory is intentionally committed and pushed to the private GitHub repository during self-use development. This includes active projects, Prompt Library data, archives, and trash files. Agent Runtime state under `agent-runtime/.deer-flow/` remains local and ignored.

For future distribution testing, set:

```powershell
$env:PROMPTCARD_DESKTOP_USE_APPDATA_PROFILE = "1"
```

That optional mode uses:

```text
%APPDATA%\PromptCard-Manager\dev-profile
```

It passes profile paths to the existing services with environment variables:

```text
PROMPTCARD_STORAGE_DATA_DIR=<dev-profile>\data
DEER_FLOW_HOME=<dev-profile>\agent-runtime\.deer-flow
PROMPTCARD_LIBRARY_FILE=<dev-profile>\data\prompt-library-presets.json
PROMPTCARD_LOGS_DIR=<dev-profile>\logs
```

Plain `npm.cmd run dev:with-agent` keeps the same repository-local development behavior.

## Shutdown Behavior

Closing the Tauri window stops the local PromptCard services on ports `3000`, `8001`, and `8002` when their process command line matches this source tree or the PromptCard startup commands. This is the default desktop-shell behavior because self-use should feel like closing one local app.

Closing only the `start-desktop.bat` launcher terminal does not stop the desktop shell. Use the app window close button when you want the desktop shell and local services to shut down together.

Plain terminal development remains manual: when you start services with `npm.cmd run dev:with-agent`, close that terminal or stop the processes yourself.

## Source Update

The desktop-only source update button invokes the Tauri command `git_pull_source`.

The command:

1. Resolves the source root from `src-tauri`.
2. Verifies the source root is a Git worktree.
3. Rejects the update when `git status --porcelain` reports uncommitted changes.
4. Runs `git pull --ff-only`.

It uses the system Git credentials. The app does not store GitHub tokens or PATs.

## Current Limits

- This is a development shell, not an installer.
- It does not perform dependency installation after pulling source changes.
- It does not migrate data during `git pull`.
- AppData profile mode is opt-in for now. If it is enabled and an existing service is already bound to the expected port with a different data directory, startup fails instead of silently reusing it.
- Before public distribution, remove personal data from the source tree and switch the default profile to AppData.

## Application Icon

The maintained transparent source icon is `public/app-icon.png`. It is used as the browser favicon and as the source for the generated Tauri icon set under `src-tauri/icons/`.

Regenerate the desktop icon set after replacing the source:

```powershell
npx.cmd tauri icon public/app-icon.png
```
