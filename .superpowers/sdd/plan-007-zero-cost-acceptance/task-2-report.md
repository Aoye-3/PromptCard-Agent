# Task 2 Report - Plan 007 Multi-View Fake-Provider Browser Closure

## Implementation

- Added `tests/e2e/free-canvas-multi-view.spec.ts` with success and partial/retry browser flows against the real local Storage service and repository Fake Runtime.
- Added a thread-safe, test-process-only provider controller under `__test__/multi-view-provider` with reset, pause, release, request inspection, `failCalls`, and `failViews` controls.
- Scoped every controller and its call sequence to a per-test, non-sensitive token embedded in the `PLAN007_MULTI_VIEW:<token>` prompt marker. State/reset/release carry the same token, and `afterEach` releases only its own session.
- Added the new spec to `playwright.image-generation.config.ts`.
- Added deterministic test-only capture IDs so parallel Fake Provider completions cannot collide in recent-capture storage.
- Fixed a real multi-view preparation race in `FreeCanvasBuilderScreen.tsx`: all run IDs are registered as scheduled before placeholder persistence; reconciliation ignores scheduled runs; save/prepare failures clear the registrations; normal execution retains the existing per-member callback/finally cleanup.
- Added a component regression that reproduces a parent rerender while batch preparation is pending and Storage returns a missing run. The persisted placeholders remain running, preparation still follows persistence, and no Provider request starts early.
- No production API, production startup, Storage schema, credential handling, or right-side workspace structure changed.

## Coverage

- The three-view shortcut selects front/left/top and sends no Provider request before `Generate 3`.
- A paused first Provider call proves three ordered placeholders and three durable runs exist before any result completes.
- Success, deterministic second-call failure, partial group state, retry-only-left, historical failed run retention, and successful sibling retention.
- Running placeholder movement, hydration without identity/geometry loss, reload, project switch/return, stable member order, and no duplicate node/request placement.
- Node/run lineage for source, operation, recipe, model binding, group, item, view, run, and localized output asset.
- Visible inferred-view/non-exact-3D disclaimer and sanitized request evidence.

## Verification

- `python -m py_compile tests/fixtures/image_generation_runtime.py`: PASS
- `npx.cmd tsc --noEmit`: PASS
- Component regression file: 20/20 PASS
- Dedicated multi-view browser run: 2/2 PASS (52.2 seconds)
- Full image-generation config run 1, 2 workers: 3/3 PASS (49.5 seconds)
- Full image-generation config run 2, 2 workers: 3/3 PASS (54.1 seconds)

## Notes

- The selected-node toolbar can be physically covered by the fixed project header. The E2E uses the same production multi-view command through the official image-node context menu, with a real pointer click and no forced event.
- One attempted full-config run failed before test execution because direct `npx` used the default C-drive Playwright cache. All accepted runs explicitly set `PLAYWRIGHT_BROWSERS_PATH` to the workspace `.playwright-browsers` directory.
