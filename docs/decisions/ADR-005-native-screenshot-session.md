# ADR-005: Capture Screenshots Natively From The Toolbar Display

## Status

Accepted

## Date

2026-07-13

## Context

The original Phase 4 screenshot prototype used WebView `getDisplayMedia`, a video preview, and browser canvas cropping. That path shows a browser-controlled screen/window picker, can capture a source different from the floating toolbar's display, and ties crop accuracy to the rendered video preview.

The product requires a one-step capture action from the floating toolbar. It also requires a narrow privacy and persistence boundary: an uncropped desktop image must not be written to disk merely to let the user select a crop.

## Decision

Use `xcap` 0.9.6 in the Tauri Rust layer to capture one frame from the display containing `capture-toolbar`. Store that original frame only in a single in-memory session. Preload `capture-selection` hidden; after its frontend signals readiness, hide the toolbar, capture the frame on a blocking worker, then show and focus the gray monitor-sized selector. The selector submits logical selection coordinates; Rust scales and crops the original frame, encodes a PNG, and returns it to the selector window.

Keep existing browser-side asset upload and Recent Capture creation. Persist only the cropped PNG, its physical asset ID, and diagnostic `origin` metadata containing `engine: "xcap"`, monitor name, and native crop rectangle.

Give each window only the commands it needs. The main window may prepare a session, the selector may activate, finish, or cancel it, and the toolbar may only emit an intent and listen for restoration. A 30-second startup watchdog clears a selector that never becomes ready and restores the toolbar.

## Alternatives Considered

### Keep `getDisplayMedia`

- Pros: no Rust image capture dependency and works inside the existing browser component.
- Cons: browser picker adds a step; selected source may differ from the toolbar display; video preview scaling makes mixed-DPI crops harder to reason about.
- Rejected because it does not meet the fixed-toolbar-display interaction model.

### Let the user choose a monitor on every capture

- Pros: explicit monitor selection.
- Cons: adds repeated interaction and duplicates a choice already implied by toolbar placement.
- Rejected because the toolbar display is the product's selected target.

### Persist the full frame before cropping

- Pros: simple handoff between native and web layers.
- Cons: stores desktop pixels the user did not explicitly select, creates cleanup obligations, and increases asset storage.
- Rejected because the full frame is transient capture state, not a user asset.

## Consequences

- Screenshot capture is Windows-first until macOS and Linux are manually validated.
- The desktop shell adds `xcap`, `image`, and `base64` Rust dependencies.
- Mixed-DPI correctness depends on keeping logical selector bounds and native frame dimensions separate.
- Only one screenshot session may be active at a time.
- Future recording work must be designed separately; this ADR does not establish a recording backend.
- See [Native Screenshot Capture](../architecture/native-screenshot-capture.md) for command, data-flow, permission, and verification details.
