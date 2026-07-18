# Verification Checklist

Run before merging broad implementation or documentation restructuring:

```powershell
npm.cmd test -- --run
npm.cmd run storage:test
.\agent-runtime\backend\.venv\Scripts\python.exe -m unittest promptcard_storage.tests.test_app
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
npm.cmd run agent:check
npm.cmd run text-agent:check
cd agent-runtime/backend
uv run pytest tests/test_promptcard_runtime_boundary.py -q
```

For text-Agent boundary changes, also run:

```powershell
npm.cmd test -- --run text-agent-runtime/src/provider-runtime.test.ts text-agent-runtime/src/proposal-policy.test.ts src/services/agent-runtime-service.test.ts src/stores/agent.store.test.ts
.\agent-runtime\backend\.venv\Scripts\python.exe -m pytest agent-runtime\backend\tests\test_promptcard_runtime_boundary.py agent-runtime\backend\tests\test_text_generation_providers.py -q -p no:cacheprovider
```

Verify selected-text update, no-selection create, Prompt Library create-only approval, one-image media analysis, incompatible pi thread rejection, PI-native and SDK-backed provider registration, internal-route authentication, and continued Canvas/image-generation use while the pi service is unavailable. Confirm the text selector groups `PI 原生` and SDK families, while the image selector contains only image models. A live provider call is optional and must use an explicitly configured keyring credential.

For browser-facing changes, also smoke test the local app at:

```powershell
npm.cmd run test:e2e
```

For native screenshot changes, also run `cargo test` and `cargo build --release` from `src-tauri/`, then complete the Windows capture checks in [Native Screenshot Capture](../architecture/native-screenshot-capture.md). Verify the preparation label, hidden preload/activation handshake, visible gray drag layer, pointer capture, Escape/cancel recovery, 30-second startup recovery, and `started`/`ready` timing entries in `logs/desktop-shell.log`. Do not mark macOS or Linux support verified until those desktop checks run on their respective platforms.

For the Recent Capture image chain, verify native screenshot and ClipboardItem/DataTransfer PNG/JPEG/WebP intake, single/separate/merged Prompt registration, transaction rollback, and Canvas placement. The database and asset directory must still contain one asset row and one physical file for a Capture used by Prompt Library and Canvas. Complete these Windows checks before starting the recording phase described in [Plan 002](../Plan/002-floating-capture-video-asset-mvp.md).

For model-management or image-generation changes, additionally run from the repository root:

```powershell
npm.cmd test -- --run
npm.cmd run build
npm.cmd run agent:check
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.playwright-browsers"
npx.cmd playwright test tests/e2e/model-management.spec.ts tests/e2e/image-generation-node.spec.ts --workers=1
.\agent-runtime\backend\.venv\Scripts\python.exe -m pytest promptcard_storage/tests -q -p no:cacheprovider
.\agent-runtime\backend\.venv\Scripts\python.exe -m pytest agent-runtime\backend\tests\test_image_generation_service.py agent-runtime\backend\tests\test_image_generation_storage_integration.py agent-runtime\backend\tests\test_image_result_fetcher.py agent-runtime\backend\tests\test_seedream_prompt_compiler.py agent-runtime\backend\tests\test_seedream_provider.py agent-runtime\backend\tests\test_model_connections.py agent-runtime\backend\tests\test_credential_store.py agent-runtime\backend\tests\test_csrf_middleware.py -q -p no:cacheprovider
.\agent-runtime\backend\.venv\Scripts\python.exe -m ruff check agent-runtime\backend\app agent-runtime\backend\tests
cargo test --manifest-path src-tauri/Cargo.toml
git diff --check
```

The two Playwright specs start their own frontend, real SQLite Storage service, and Runtime with a Provider DI fake on ports `38100–38102`; those ports must be free. This verifies HTTP/CSRF/Storage/UI integration without spending Ark quota or requiring a real credential.

Keep `TEMP`, `TMP`, Python/uv caches, `PLAYWRIGHT_BROWSERS_PATH`, and `CARGO_TARGET_DIR` on the current F: workspace when these commands need to provision caches. A live Ark smoke test must never be attempted without a user-configured keyring credential and explicit rollout enablement. Before production rollout, record Windows results for text-to-image, 2–10 reference images, smart edit, point, bbox, and visual-markup raster derivatives. Also verify standard/fast, 1K/2K, preset/custom size, PNG/JPEG, watermark, and Arabic/Japanese/German prompts. Record full-suite baseline failures separately from feature-focused failures.

Current known non-feature gates are tracked in the [Seedream implementation status](../Plan/005-seedream-image-node-frontend-implementation-status.md): the Runtime full suite includes Windows/POSIX/live-credential environment failures, and repository ESLint has zero errors but exceeds its warning budget. Do not report either as an image-generation regression without reproducing it in the focused commands above.

Manual browser smoke testing is still useful when validating layout or copy. Start the local stack and use the `frontendUrl` in `logs/dev-runtime.json`.

For Agent live-model behavior, require a local key and avoid running secret-dependent checks in generic CI.
