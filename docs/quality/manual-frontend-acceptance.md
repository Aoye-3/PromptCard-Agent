# Manual Frontend Acceptance

## Purpose

Use this checklist after the automated frontend suite and production build pass. It covers browser behavior that unit and component tests do not prove reliably: rendered visibility, viewport placement, keyboard focus, browser zoom, high contrast, network side effects, reload recovery, and visual agreement between the canvas and exported/provider inputs.

This checklist does not authorize a paid provider request. Use the deterministic local fake-provider path for generated success, failure, retry, and recovery states. A live Seedream evaluation requires separate approval that states the model, fixture, request count, output size, watermark choice, and expected cost.

## Prerequisites

1. Run the automated gates:

   ```powershell
   npm.cmd run test:frontend
   npm.cmd run build
   ```

2. Start the local frontend and Agent Runtime:

   ```powershell
   npm.cmd run dev:with-agent
   Get-Content logs\dev-runtime.json
   ```

3. Open the reported `frontendUrl` in Edge or Chrome with DevTools Console and Network visible.
4. Prepare a populated Free Canvas containing both text and image nodes. Prefer the existing 11-node `江天黄鹤` project when it is available.
5. For generation-state checks, use the local fake-provider setup rather than a paid provider.

## Evidence To Record

For every failure, record:

- build or commit under test;
- browser and viewport size;
- browser text zoom and canvas zoom;
- project and selected node type;
- minimal reproduction steps;
- screenshot or short recording;
- Console errors or warnings;
- Network request method, URL, status, and whether the request was expected;
- state after reload or project switching when persistence is involved.

Do not include credentials, authorization headers, raw provider responses, temporary provider URLs, or local secrets in the evidence.

## Plan 007 Run Record (2026-07-28)

This record includes the 2026-07-29 E-001/E-002 remediation on `fix/plan-007-acceptance-findings`, runner ownership in `2d372a0`, final code fix `37a7212`, and deterministic Fake Provider gating in `f6887b1`, using workspace-local frontend, Runtime fixture, Storage fixture, and local Fake Provider only. The unchanged F1/F4 screenshots were captured earlier at `997eb9f`; sanitized evidence is stored under [`output/playwright/plan-007/`](../../output/playwright/plan-007/). The post-remediation image-generation configuration passed 5/5, full E2E passed 26/26, frontend passed 106 files and 648 tests, Storage passed 87/87, and the production build plus `agent:check` passed. Every human decision below remains **Pending unified human acceptance**; this record does not claim user approval.

| Gate | Automated evidence | Human status / remaining observation |
| --- | --- | --- |
| F1 | Functional slice PASS: three nodes and the source asset were present before and after save/reload; Fit View and restored visibility were exercised. E-001 now has lifecycle-cancellation unit coverage and a reload E2E clean-console assertion. | Pending unified human acceptance and a fresh manual Console/Network capture. |
| F2 | Not executed in this run. | Pending unified human acceptance: four-corner containment, 25/100/200% canvas zoom, selection behavior, and dismissal consistency. |
| F3 | Not executed in this run. | Pending unified human acceptance: keyboard/focus checks and real Windows high-contrast plus 200% text-zoom readability; no pass is inferred. |
| F4 | Multi-view pre-submit slice PASS: 0 generation POSTs, 0 Runs, 0 Fake Provider calls; right-side draft and active image-generation tab remained stable. | Pending unified human acceptance: all other enabled workbenches and the `As reference` append-only flow. |
| F5 | Not executed in this run. | Pending unified human acceptance: non-destructive editing, Undo/Redo, original-versus-visible export, reload, and source retention after result deletion. |
| F6 | Automated Fake Provider closure PASS: success, partial, geometry, reload/project-switch deduplication, order, and lineage. The retry UI locked the original failed view, submission rejected synchronous `viewSpec`/selection tampering, duplicate-lineage regression proved exact `nodeId` binding, and a valid retry reused its node/item/group/view, created only a new Run, retained the failed Run in history, and ended with the same three members and a succeeded group. | Pending unified human acceptance: visual review is still required. |
| F7 | Not executed in this run. | Pending unified human acceptance: document/image/draft/run separation and supported versus capability-limited model behavior. |

Recorded findings:

| ID | Observation | Owner | Severity | Release disposition |
| --- | --- | --- | --- | --- |
| E-001 | A PUT was cancelled near reload and surfaced one `StorageHttpError`; before/after Storage evidence still retained all three nodes and the source asset. | Engineering | Medium | Fixed in `fix/plan-007-acceptance-findings`: project writes receive a page-lifecycle signal, and only an unloading-time `request_aborted` is suppressed. Timeout, service, and HTTP errors remain reportable. Automated regression passes; fresh manual evidence is pending. |
| E-002 | The Fake fixture returned 404 for four generic Runtime/status probes, and the screenshot showed disconnected status. This did not establish a production Runtime defect. | Test infrastructure | Low | Fixed in the image-generation Fake Runtime by implementing the complete status/bootstrap/catalog/model-config startup contract. Direct proxy-contract and page-level no-4xx regressions pass; fresh manual evidence is pending. |

B3-B6 and B8-B9 were not executed. They remain subject to their existing paid-call authorization and live-provider acceptance requirements.

Remediation verification on 2026-07-29 used only the local Fake Provider: image-generation E2E `5/5`, full E2E `26/26`, frontend `648/648`, Storage `87/87`, and the production build passed. The prior sanitized Console/Network artifact remains an immutable record of the run that discovered E-001 and E-002; it is not presented as post-fix evidence.

## F1: Populated Canvas Visibility

1. Open the populated canvas and wait for initial measurement to settle.
2. Select a text node and an image node in turn.
3. Open and close the image context menu and floating toolbar.
4. Use Fit View, pan, and zoom.
5. Switch among the existing right-workspace tabs and return to the canvas.
6. Reload the browser and reopen the project.

Pass when:

- every persisted node remains visible after load, selection, Fit View, autosave, and reload;
- the domain node count matches the rendered visible-node count;
- no node becomes hidden after the first React Flow measurement;
- the right workspace retains its active tab and draft;
- the Console contains no new error or render-loop warning.

## F2: Toolbar, More Menu, And Context Menu

1. Select one ready image and confirm exactly one floating toolbar is shown.
2. Multi-select nodes and confirm single-node toolbars do not overlap the selection.
3. At 25%, 100%, and 200% canvas zoom, confirm the toolbar keeps a stable physical size.
4. Place or pan the selected image near each viewport corner and open its context menu.
5. Compare command visibility, enabled state, and disabled reason between the floating toolbar, More menu, and context menu.
6. Right-click a selected member of a multi-selection, then right-click a node outside that selection.
7. Dismiss open surfaces with a pane click, Escape, selection change, and meaningful pan or zoom.

Pass when:

- menus remain fully inside all four viewport corners;
- right-clicking a selected member preserves multi-selection;
- right-clicking outside the selection updates selection before commands resolve;
- equivalent entry surfaces report the same command availability;
- every unavailable operation provides a useful reason instead of silently disappearing;
- dismissal never triggers a command or provider request.

## F3: Keyboard, Focus, Text Zoom, And High Contrast

1. Navigate the toolbar and menus using only Tab, arrow keys, Home/End, Enter/Space, and Escape.
2. Open each modal workbench from the keyboard and attempt to move focus outside it.
3. Close the workbench with Escape and verify focus returns to the invoking control or selected node.
4. Put focus in an input, textarea, or editable control and press canvas shortcuts.
5. Repeat the principal toolbar, menu, and workbench flow at 200% browser text zoom.
6. Repeat focus and selected-state checks in Windows high-contrast mode.

Pass when:

- interactive controls have visible names, roles, expanded state, and focus indicators;
- toolbar and menu traversal follows a logical order;
- modal focus is trapped and restored correctly;
- canvas shortcuts do not run while an editable control owns focus;
- labels, shortcuts, validation, and disabled reasons remain readable without clipped actions;
- focus, selection, and boundaries remain distinguishable in high contrast.

## F4: Workbench Entry And Side-Effect Boundaries

For every enabled image operation, open it from each available entry surface: toolbar, More menu, context menu, result action, or history.

1. Compare the operation, source, draft values, readiness, and disabled reason across entry surfaces.
2. Change parameters, switch presets, edit a region, and cancel.
3. Inspect Network and project history before any explicit Apply or Generate action.
4. Verify the source preview after crop, flip, and annotations are applied.
5. Reopen a completed operation from its result or history entry.
6. Repeat while a right-workspace tab contains an unsent draft.
7. Run `As reference` separately.

Pass when:

- equivalent entry surfaces open the same operation and draft state;
- opening, editing, switching presets, and cancelling create no generation request or run;
- Apply or Generate is the only submission point and shows blocking issues and exact request count first;
- the preview identifies the durable provider input rather than silently sending a different source image;
- history reopens the immutable operation and recipe snapshot;
- image workbenches do not change the right-workspace tab or draft;
- `As reference` only appends one reference to the existing Image Generation Composer and does not submit work.

## F5: Non-Destructive Editing And Visible Export

1. Duplicate, delete, reorder, flip, crop, and annotate an image.
2. Exercise Undo and Redo after each local command.
3. Compare Download Original with export or copy of the visible result.
4. Save, reload, and reopen the project.
5. Delete a generated result node while retaining its source asset.

Pass when:

- crop, flip, and annotations never modify the original asset;
- Undo and Redo affect only the user's local command and do not rewrite run state;
- visible export contains the current crop, flip, and annotations;
- Download Original remains visibly distinct from visible export;
- reload preserves the presentation state;
- deleting a result node does not delete its source asset or prior terminal run.

## F6: Multi-View Configuration And Recovery

Use the local fake-provider path for steps that submit work.

1. Select different positions in the 3 by 3 camera grid and compare the visible request count with the number selected.
2. Use the front, left, and top shortcut and verify it selects exactly three views without submitting.
3. Cancel and reopen the workbench before generating.
4. Explicitly generate three members and verify ordered placeholders appear immediately.
5. Exercise all-success and one-member-failure outcomes.
6. Retry only the failed member.
7. Move or resize a running placeholder before it completes.
8. Reload, switch to another project, and return.
9. Open history and use a completed member as a reference.

Pass when:

- selecting or editing views creates no request until Generate;
- N selected views create N stable runs and N ordered placeholders;
- partial failure preserves successful siblings;
- retry creates a new attempt only for the failed member;
- user-moved placeholder geometry survives completion;
- reload and project switching preserve member order without duplicate placement;
- each member remains traceable to its source, view, recipe, run, and model snapshot;
- the UI states that inferred views are not exact 3D reconstruction.

## F7: Capability And State Separation

1. Select a document or three-stage form node and verify image operations are absent.
2. Select an image node and verify document field selection is not initialized, cleared, or rewritten.
3. Switch away from or delete an image that has an operation draft.
4. Test a model without multi-reference support and one with a documented reference limit.
5. Remove or disable a required adapter capability in the local test configuration.

Pass when:

- document, image, operation-draft, and run states remain separately scoped;
- switching source invalidates only the matching image-operation draft;
- single-image models do not expose an enabled Add Reference control;
- multi-reference limits, formats, ordering, and roles are enforced before submission;
- unsupported operations are blocked with a useful reason before any provider request;
- experimental operations open functioning workflows with visible limitations rather than empty panels.

## Exit Criteria

Manual frontend acceptance is complete only when:

- F1 through F5 pass in a real Chromium browser;
- F6 passes through the local fake-provider path;
- F7 passes for at least one supported and one capability-limited model configuration;
- the tested flows introduce no Console errors or unexpected failed Network requests;
- no provider request occurs before explicit Generate;
- reload and project switching introduce no missing or duplicate nodes;
- all findings are fixed or recorded with owner, severity, reproduction evidence, and an explicit release disposition.

Live provider quality, cost, account permission, quota, region, and temporary-output behavior remain separate release-time acceptance gates.
