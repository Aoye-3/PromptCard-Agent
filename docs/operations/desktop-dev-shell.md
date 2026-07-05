# Desktop Dev Shell

The desktop dev shell is a Tauri window for local self-use while the source tree remains editable. It is not the production packaged app and it does not use GitHub Releases or a remote updater.

## What It Does

- Starts or reuses the local storage service, Agent Runtime, and Vite frontend.
- Opens the main desktop window titled `PromptCard Manager Dev Shell`.
- Leaves the floating capture toolbar closed by default; users open it from the Capture Bar page when needed.
- Loads the `frontendUrl` recorded in `logs/dev-runtime.json`, so Vite hot reload still reflects source edits even when port `3000` is already occupied.
- Exits the whole Tauri app and stops the local storage service, Agent Runtime, and Vite frontend when the main desktop window closes.
- Shows a desktop-only source update action under the Me screen settings.

The main webview sets `dragDropEnabled: false`. Windows requires this for Explorer file drags to reach the React HTML5 handlers used by the free canvas. Re-enabling Tauri's native interception would require a separate native path-to-asset bridge.

The Capture Bar page in the main window owns toolbar start/close controls, status, preview, and planned module configuration. When started, the floating capture toolbar is a second Tauri window routed to `/?window=capture-toolbar`. It is undecorated, non-resizable, always on top, skipped from the taskbar, and uses a toolbar-only capability with limited event/window permissions. Closing the toolbar destroys that toolbar window and does not stop the local services; service shutdown and app exit are tied to the `main` window close path.

## Commands

Windows Tauri development requires Rust plus Microsoft C++ Build Tools. If `cargo check` fails with `link.exe not found`, install Visual Studio Build Tools with the Visual C++ workload and retry.

Run from the project root:

```powershell
npm.cmd run tauri:dev
```

Or double-click:

```text
start-desktop.vbs
start-desktop.bat
```

`start-desktop.vbs` is the quiet double-click entry point. It hides PowerShell and only shows a message box if the launcher exits with a non-zero code. `start-desktop.bat` runs the same launcher with visible progress output and is preferred when diagnosing startup.

The desktop launcher prepares or reads `logs/dev-runtime.json`, starts storage and Agent Runtime in a background services-only mode, starts or reuses Vite, waits only for the frontend URL to return HTTP 200, and then opens the Tauri shell. Storage readiness is handled by the React startup screen so the native window can appear before the local data service is fully ready.

The launcher sets `PROMPTCARD_DESKTOP_DEV=1` before it starts Vite directly. Vite uses that flag to suppress its normal browser auto-open behavior; double-clicking `start-desktop.vbs` should open the Tauri shell, not a browser tab.

The first visible loading UI has two layers:

- `index.html` contains a native boot screen that appears before the React bundle renders. It is fixed to the full main window and hidden for `/?window=capture-toolbar` so the on-demand capture toolbar does not show a clipped blank loading card.
- `src/App.tsx` renders the React startup screen while the app probes the local storage service and loads durable data.

The frontend probes storage through `/storage-api/health`. Vite handles that path as a special proxy to the storage service root `/health`; normal storage business API calls still use `/storage-api/* -> <storageUrl>/api/*`. This keeps the React app same-origin while matching the FastAPI storage route layout.

Before launching, the script checks existing `promptcard-manager-dev-shell.exe` processes from the current repository. It only reuses a visible, full-size top-level window titled `PromptCard Manager Dev Shell`. Hidden toolbar windows, `PromptCard Capture`, `Tao Thread Event Target`, and tiny internal windows are ignored. If current-repo shell processes exist without a valid main window, they are treated as stale and stopped before relaunching.

When the selected frontend port is `3000` and the debug executable is newer than the Rust sources and Tauri configuration, the launcher directly runs the existing debug shell. This skips the `tauri dev` compile/watch startup on normal launches. Changes under `src-tauri/src/`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/Cargo.toml`, or `src-tauri/build.rs` automatically use the slower rebuild path once. The launcher waits until a real main window is detected.

When the selected frontend port is not `3000`, the launcher writes an ignored Tauri runtime config at:

```text
logs/tauri.dev-runtime.conf.json
```

It then starts `tauri dev --config <that file>` so the webview points at the actual `frontendUrl`.
The generated config removes `beforeDevCommand`; otherwise Tauri dev would run the old service startup path and wait for the full service chain before opening the window.

To deliberately rebuild the shell while diagnosing native changes, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\launch-desktop-shell.ps1 -ForceRebuild
```

`start-desktop.bat` is only a visible launcher wrapper. Closing the launcher terminal does not close the desktop window or its local services.

The legacy Tauri `beforeDevCommand` still points at:

```powershell
npm.cmd run desktop:dev-services
```

The desktop launcher avoids that path for dynamic-port launches by writing `logs/tauri.dev-runtime.conf.json`. Direct `npm.cmd run tauri:dev` still uses the static Tauri config and the legacy `beforeDevCommand`. For self-use development, both paths default to repository-local data and runtime paths so the same data can be backed up through Git. Startup details, including the actual frontend, Agent Runtime, and storage URLs, are recorded in `logs/dev-runtime.json`.

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

Closing the main Tauri window stops the local PromptCard services resolved through the dev runtime manifest and exits the whole Tauri app. This prevents any open floating capture toolbar from keeping `promptcard-manager-dev-shell.exe` alive after the main window is gone.

Closing the floating capture toolbar affects only that toolbar window. It must not stop the storage service, Agent Runtime, or Vite frontend. Reopen it from the Capture Bar page.

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
- The Capture Bar page currently starts and closes the screenshot toolbar only. Recording, audio capture, GIF export, video canvas nodes, frame extraction, Storyboard inference, visual Agent analysis, and global shortcuts remain planned modules.
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
