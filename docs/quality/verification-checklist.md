# Verification Checklist

Run before merging broad implementation or documentation restructuring:

```powershell
npm.cmd run test -- --run
npm.cmd run storage:test
.\agent-runtime\backend\.venv\Scripts\python.exe -m unittest promptcard_storage.tests.test_app
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
npm.cmd run agent:check
cd agent-runtime/backend
uv run pytest tests/test_promptcard_runtime_boundary.py -q
```

For browser-facing changes, also smoke test the local app at:

```powershell
npm.cmd run test:e2e
```

For native screenshot changes, also run `cargo test` and `cargo build --release` from `src-tauri/`, then complete the Windows capture checks in [Native Screenshot Capture](../architecture/native-screenshot-capture.md). Verify the preparation label, hidden preload/activation handshake, visible gray drag layer, pointer capture, Escape/cancel recovery, 30-second startup recovery, and `started`/`ready` timing entries in `logs/desktop-shell.log`. Do not mark macOS or Linux support verified until those desktop checks run on their respective platforms.

For the Recent Capture image chain, verify native screenshot and ClipboardItem/DataTransfer PNG/JPEG/WebP intake, single/separate/merged Prompt registration, transaction rollback, and Canvas placement. The database and asset directory must still contain one asset row and one physical file for a Capture used by Prompt Library and Canvas. Complete these Windows checks before starting the recording phase described in [Plan 002](../Plan/002-floating-capture-video-asset-mvp.md).

Manual browser smoke testing is still useful when validating layout or copy. Start the local stack and use the `frontendUrl` in `logs/dev-runtime.json`.

For Agent live-model behavior, require a local key and avoid running secret-dependent checks in generic CI.
