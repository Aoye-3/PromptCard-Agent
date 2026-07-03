# Desktop Dev Shell

The desktop dev shell is a Tauri window for local self-use while the source tree remains editable. It is not the production packaged app and it does not use GitHub Releases or a remote updater.

## What It Does

- Starts or reuses the local storage service, Agent Runtime, and Vite frontend.
- Opens the main desktop window titled `PromptCard Manager Dev Shell`.
- Opens a small floating capture toolbar window labeled `capture-toolbar`.
- Loads the `frontendUrl` recorded in `logs/dev-runtime.json`, so Vite hot reload still reflects source edits even when port `3000` is already occupied.
- Stops the local storage service, Agent Runtime, and Vite frontend when the main desktop window closes.
- Shows a desktop-only source update action under the Me screen settings.

The main webview sets `dragDropEnabled: false`. Windows requires this for Explorer file drags to reach the React HTML5 handlers used by the free canvas. Re-enabling Tauri's native interception would require a separate native path-to-asset bridge.

The floating capture toolbar is a second Tauri window routed to `/?window=capture-toolbar`. It is undecorated, non-resizable, always on top, skipped from the taskbar, and uses a toolbar-only capability with limited event/window permissions. Closing or hiding the toolbar does not stop the local services; service shutdown is tied to the `main` window close path.

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

The desktop launcher starts or reuses local services, waits for `logs/dev-runtime.json`, then directly runs the existing debug shell when it is newer than the Rust sources and Tauri configuration and the frontend still uses port `3000`. This skips the `tauri dev` compile/watch startup on normal launches. Changes under `src-tauri/src/`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/Cargo.toml`, or `src-tauri/build.rs` automatically use the slower rebuild path once. The launcher remains visible with progress until the application window is detected.

When the selected frontend port is not `3000`, the launcher writes an ignored Tauri runtime config at:

```text
logs/tauri.dev-runtime.conf.json
```

It then starts `tauri dev --config <that file>` so the webview points at the actual `frontendUrl`.

To deliberately rebuild the shell while diagnosing native changes, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\launch-desktop-shell.ps1 -ForceRebuild
```

`start-desktop.bat` is only a launcher. It starts `npm.cmd run tauri:dev` in a detached hidden process and exits after a successful launch request, so closing the launcher terminal does not close the desktop window or its local services.

Tauri runs:

```powershell
npm.cmd run desktop:dev-services
```

That script delegates to `scripts/start-dev-with-agent.ps1`. For self-use development, it defaults to the normal repository-local data and runtime paths so the same data can be backed up through Git. Startup details, including the actual frontend, Agent Runtime, and storage URLs, are recorded in `logs/dev-runtime.json`.

## Data Profile

The desktop shell defaults to the existing repository-local development data:

```text
data/promptcard.sqlite3
data/assets/
agent-runtime/.deer-flow
```

The complete `data/` directory is intentionally committed and pushed to the private GitHub repository during self-use development. This includes active projects, Prompt Library data, archives, and trash files. Agent Runtime state under `agent-runtime/.deer-flow/` remains local and ignored.

For future distribution testing, set:

```powershell
$env:PROMPTCARD_DESKTOP_USE_APPDATA_PROFILE = "1"
```

That optional mode uses:

```text
logs/desktop-profile
```

It passes profile paths to the existing services with environment variables:

```text
PROMPTCARD_STORAGE_DATA_DIR=<desktop-profile>\data
DEER_FLOW_HOME=<desktop-profile>\agent-runtime\.deer-flow
PROMPTCARD_LIBRARY_FILE=<desktop-profile>\data\prompt-library-presets.json
PROMPTCARD_LOGS_DIR=<desktop-profile>\logs
```

Plain `npm.cmd run dev:with-agent` keeps the same repository-local development behavior.

## Shutdown Behavior

Closing the main Tauri window stops the local PromptCard services resolved through the dev runtime manifest. This is the default desktop-shell behavior because self-use should feel like closing one local app.

Closing or hiding the floating capture toolbar affects only that toolbar window. It must not stop the storage service, Agent Runtime, or Vite frontend.

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
- The floating toolbar currently supports screenshot capture intent only. Recording remains disabled and labelled as a future action.
- Screenshot capture uses the WebView screen-capture picker and requires the user to grant screen/window capture before drag-selecting a region.
- Toolbar position persistence is not implemented yet.
- Desktop profile mode is opt-in for now. If it is enabled and an existing service is already healthy but points at a different data directory, startup fails instead of silently reusing it.
- Before public distribution, remove personal data from the source tree and switch the default profile to AppData.

## Application Icon

The maintained transparent source icon is `public/app-icon.png`. It is used as the browser favicon and as the source for the generated Tauri icon set under `src-tauri/icons/`.

Regenerate the desktop icon set after replacing the source:

```powershell
npx.cmd tauri icon public/app-icon.png
```
