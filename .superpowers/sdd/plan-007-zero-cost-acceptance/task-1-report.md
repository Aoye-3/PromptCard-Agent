# Task 1 Report: Restore the Existing Playwright Baseline

## Outcome

The repository's normal `npm.cmd run test:e2e` entry point now pins Playwright to the repository-local `.playwright-browsers` directory, propagates failed runs as a non-zero exit, bounds hung runs, and tears down the Playwright process tree. All 19 tests in the six affected specs pass with one worker. No live image provider was called; the image-generation test used the local deterministic fixture runtime and SQLite storage service.

## Diagnoses and fixes

- The package script invoked Playwright without setting `PLAYWRIGHT_BROWSERS_PATH`, so Windows could resolve the browser cache on `C:`. `scripts/run-e2e-tests.ps1` now resolves the browser directory under the repository, invokes the installed Playwright Node CLI, captures logs, enforces a bounded timeout, kills the owned process tree on timeout, and preserves a failed test result even when the Windows child process reports zero after Playwright printed a failure summary.
- Image file drops targeted a React Flow descendant rather than the actual drop handler. The crop spec now dispatches to `[data-free-canvas-dropzone]`.
- React Flow node selection was derived from only `selectedNodeId`, which lost the multi-selection visual invariant. Flow nodes now derive `selected` from `selectedNodeIds`; the marquee test explicitly verifies two selected nodes and subsequent single-selection behavior.
- Current toolbar actions create text nodes rather than removed object-board UI, and the save control is icon-labelled `Save`. The optimistic-update tests now exercise those current flows without weakening the create/delete/retry assertions.
- Image-generation readiness copy and the prompt editor changed. The spec now uses the current `模型已就绪` text and contenteditable-compatible assertions. Manual continuation opens a new image conversation, chooses `编辑选中图片`, injects the selected canvas node, promotes it to the required main image, verifies the mention element, and confirms no provider request occurs until submission.
- The model-management bootstrap route was too broad and swallowed the model catalog. It now uses exact route mocks. The saved-connection reload also requires the connection-specific model catalog, whose image model must include its integration group and assignability metadata before it can appear in the assignment selector.
- App-shell smoke tests now use semantic project creation and the explicit prompt-library navigation tab rather than positional header/text locators.

## Files changed

- `package.json`
- `scripts/run-e2e-tests.ps1`
- `src/components/canvas/FreeCanvasBuilderScreen.tsx`
- `tests/e2e/free-canvas-image-crop.spec.ts`
- `tests/e2e/free-canvas-text-node.spec.ts`
- `tests/e2e/image-generation-node.spec.ts`
- `tests/e2e/model-management.spec.ts`
- `tests/e2e/project-optimistic-updates.spec.ts`
- `tests/e2e/promptcard-smoke.spec.ts`

## Verification

- `npm.cmd run test:e2e -- tests/e2e/model-management.spec.ts --workers=1` — 1 passed.
- `npm.cmd run test:e2e -- tests/e2e/image-generation-node.spec.ts --workers=1` — 1 passed.
- `npm.cmd run test:e2e -- tests/e2e/free-canvas-image-crop.spec.ts tests/e2e/free-canvas-text-node.spec.ts tests/e2e/image-generation-node.spec.ts tests/e2e/model-management.spec.ts tests/e2e/project-optimistic-updates.spec.ts tests/e2e/promptcard-smoke.spec.ts --workers=1` — 19 passed in 1.0 minute; command exited normally.
- A deliberately failing image-generation run returned exit code 1 through `npm.cmd run test:e2e`, confirming failure propagation.
- `npx.cmd vitest run src/components/canvas/FreeCanvasBuilderScreen.image-generation.test.tsx --reporter=dot --maxWorkers=1 --minWorkers=1` — 17 passed.
- `npm.cmd run build` — passed. Vite retained its existing CSS syntax, chunk-size, and mixed static/dynamic import warnings.
- `git diff --check` — passed.
- Post-run listener check for ports 38100, 38101, and 38102 — no listeners remained.
- Runner inspection — `PLAYWRIGHT_BROWSERS_PATH` resolves to `<repository>/.playwright-browsers`; no browser cache path on `C:` is referenced.

## Commit

Commit subject: `Restore Playwright acceptance baseline`. The report is included in that commit; its SHA is provided in the task handoff because a commit cannot contain its own SHA.

## Self-review

- Changes are limited to the task-owned runner, locator semantics, and affected specs.
- No production API or storage schema changed.
- The production selection change uses the existing multi-selection source of truth and removes only the superseded dependency.
- Assertions still cover creation, deletion, retries, two-node selection, image-generation persistence/provider behavior, secret non-echoing, and default model assignment.
- Exact model-management mocks prevent accidental real Runtime dependence.

## Review fixes

- Added `commitCanvasSelection`, a single-node selection helper that updates both the persisted `freeCanvas.selectedNodeId` and React Flow's visual `selectedNodeIds`. Toolbar creation, uploads, material placement, paste/duplicate, generation placeholders, history placement, multi-view selection, crop output, Agent creation, node removal, and command execute/undo/redo paths now use the same synchronization point. Marquee selection continues to retain multiple visual node IDs.
- Added a component regression that starts with an existing selection, creates Text from the toolbar, verifies only the new node is visually selected, and verifies Delete removes that visually selected node while retaining the original.
- Restored exact contenteditable assertions for injected/restored prompt text and restored `toBeVisible` for the running generation placeholder.
- The strict placeholder assertion exposed a real React Flow measurement race: the running image node existed and was selected, but its wrapper remained `visibility: hidden` until ResizeObserver populated dimensions. Image nodes now provide their already-known width and height through React Flow's `initialWidth` and `initialHeight`, making the placeholder visible from its first committed render. Before this fix the isolated spec could pass while the affected suite failed 18/19 at this assertion; afterward both the isolated spec and all 19 affected tests passed.
- Review verification: targeted component test 18/18 passed; image-generation E2E 1/1 passed; affected E2E 19/19 passed; build and `git diff --check` passed; ports 38100-38102 were released after the run.

### Review round 2

- React Flow's `onSelectionChange` now synchronizes canonical selection without collapsing marquee selection: an empty selection clears `selectedNodeId`; a selection that still contains the canonical node preserves it; otherwise the first selected node becomes canonical. The shared helper accepts the complete visual ID list so canonical and visual state are committed together when promotion or clearing is required.
- Added a regression for pane clear → React Flow selects a node → canonical node promotion → Delete removes that visually selected node. The existing two-node marquee regression remains green.
- Round 2 verification: targeted component test 19/19 passed; selection E2E 5/5 passed; affected E2E 19/19 passed; build and `git diff --check` passed; ports 38100-38102 were released after the runs.

## Concerns

No blocking concerns. Build warnings listed above predate and are unrelated to this task. The runner's failure-summary guard intentionally depends on the configured Playwright `list` reporter format in addition to the child exit code; if the repository changes reporters, that guard should be updated with it.
