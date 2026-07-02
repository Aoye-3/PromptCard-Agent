# Plan 002: Floating Capture And Video Asset MVP

## Status

Active

## Date

2026-07-02

## Timezone

Europe/London

## Context

This plan extends Plan 001's cross-platform copy/paste asset loop with a focused capture layer:

```text
Floating capture toolbar
  -> screenshot or screen recording
  -> save to local file, clipboard, or current canvas
  -> store captured media as durable assets
  -> reuse captured references and results in Prompt Library, shots, and canvas work
```

The key product decision for this round is:

> Treat recordings as video assets first. GIF is an optional no-audio export path, not the primary recording format.

This keeps the MVP honest: GIF cannot carry audio, while video assets can support no-audio clips now and audio-bearing MP4/WebM later.

## Product Shape

The running desktop app should have:

- The main PromptCard Manager window.
- A small always-on-top floating toolbar that does not take much screen space.
- Capture modes launched from the toolbar:
  - Screenshot mode.
  - Screen recording mode.

Screenshot flow:

```text
Click screenshot
  -> enter selection state
  -> drag from start point to end point
  -> show action bar
  -> save to local / save to canvas / copy to clipboard
```

Recording flow:

```text
Click record
  -> enter selection state
  -> choose no-audio or with-audio
  -> record selected area
  -> create video asset
  -> save to local / save to canvas / copy where supported
```

Canvas behavior:

- Screenshot assets enter the canvas as image nodes.
- Recording assets enter the canvas as video nodes.
- Video nodes show a poster/thumbnail by default.
- Video nodes do not autoplay.
- A visible play button starts playback.
- Clicking pause/stop returns to a calm canvas state.

## Non-Goals

- Do not build a full video editor.
- Do not build cloud sharing for captured assets in this MVP.
- Do not require external generation platform APIs.
- Do not make GIF the default recording format.
- Do not attempt audio-in-GIF; GIF has no audio track.
- Do not embed ShareX, Flameshot, Greenshot, or similar full applications.
- Do not mix inspiration references and generated results without purpose metadata.

## Technical Direction

Use the existing asset pipeline wherever possible.

Current reusable pieces:

- Asset upload and URL access through `storageServiceClient.assets`.
- SQLite-backed asset registration and `data/assets` file storage.
- Prompt Library media metadata under preset `meta.media`.
- Free Canvas image asset intake for pasted, dropped, and uploaded images.

Candidate components:

| Capability | Preferred path | Notes |
| --- | --- | --- |
| Floating toolbar | Tauri multi-window / Window API | Small always-on-top, undecorated window. |
| Global trigger | Tauri `global-shortcut` plugin | Optional but useful after toolbar MVP. |
| Clipboard text/image | Tauri `clipboard-manager` plugin plus browser clipboard events | Browser paste/drop first, native clipboard as desktop fallback. |
| Screenshot capture | `xcap` | Rust, Apache-2.0, cross-platform screenshot and region capture. |
| Video recording | Start with WebM/MP4 asset model; evaluate `xcap`/`scap` for native capture | Keep implementation replaceable behind a capture service. |
| GIF export | `gif` crate for simple no-audio GIF | Avoid `gifski` unless AGPL/commercial licensing is accepted. |
| Local save | Tauri `dialog`/`fs` plugin | Browser download can be a temporary fallback. |

## Data Model

Add a logical asset reference layer without replacing the physical asset table.

```ts
type AssetPurpose =
  | 'promptAttachment'
  | 'inspirationReference'
  | 'generatedResult'
  | 'shotOutput'
  | 'screenCapture'
  | 'screenRecording'

type AssetRole =
  | 'character'
  | 'scene'
  | 'prop'
  | 'composition'
  | 'lighting'
  | 'color'
  | 'style'
  | 'mood'
  | 'other'

interface AssetReferenceMeta {
  id: string
  assetId: string
  purpose: AssetPurpose
  role?: AssetRole
  origin: 'paste' | 'drop' | 'upload' | 'screenshot' | 'screen-recording' | 'clipboard-read' | 'tauri-dialog'
  sourcePlatform?: string
  sourceUrl?: string
  originalFilename?: string
  contentType?: string
  size?: number
  width?: number
  height?: number
  durationMs?: number
  hasAudio?: boolean
  posterAssetId?: string
  capturedAt: string
  userNote?: string
  linkedPromptId?: string
  linkedShotId?: string
  linkedAttemptId?: string
}
```

Canvas media node extension:

```ts
type FreeCanvasMediaNodeKind =
  | 'imageAsset'
  | 'videoAsset'
  | 'textOverlay'
  | 'arrowAnnotation'
  | 'mediaGroup'
```

Video node metadata:

```ts
interface FreeCanvasVideoMeta {
  durationMs?: number
  hasAudio?: boolean
  posterAssetId?: string
  playbackState?: 'idle' | 'playing' | 'paused'
}
```

## Phase 1: Asset Intake Foundation

**Goal:** Normalize all media entering the app into one intake shape.

**Scope:**

- Create a small domain-level intake contract for `File/Blob + metadata + target`.
- Support targets:
  - Current canvas.
  - Prompt Library entry.
  - Inspiration reference.
  - Generated result.
- Preserve source metadata when available.
- Keep existing Prompt Library and Free Canvas upload paths working.

**Acceptance Criteria:**

- [ ] A pasted image can still become a canvas image node.
- [ ] An uploaded Prompt Library image/video still persists.
- [ ] The same physical asset can be referenced with different purposes.
- [ ] Inspiration references and generated results are distinguishable in metadata.

**Verification:**

- [ ] Unit tests cover metadata normalization.
- [ ] Existing canvas image tests still pass.
- [ ] Existing Prompt Library media tests still pass.

## Phase 2: Video Asset Storage And Canvas Node

**Goal:** Let video assets live on the canvas without autoplay.

**Scope:**

- Add `videoAsset` as a canvas media node kind.
- Render a video node with a poster/thumbnail or neutral placeholder.
- Default video state is idle.
- Add play/pause control inside the node.
- Support uploaded or pasted `video/mp4` and `video/webm`.

**Acceptance Criteria:**

- [ ] A video asset can be uploaded and placed on the canvas.
- [ ] The canvas shows a stable video node frame by default.
- [ ] The video does not autoplay after project load.
- [ ] Clicking play starts playback.
- [ ] Clicking pause stops playback without resizing or shifting the node.

**Verification:**

- [ ] Unit tests cover video node normalization.
- [ ] Component tests cover default idle state and play control rendering.
- [ ] Manual check: reload project, confirm no video autoplays.
- [ ] `npm.cmd run build` succeeds.

## Phase 3: Floating Toolbar Shell

**Goal:** Add the minimal always-on-top capture entry point.

**Scope:**

- Add a compact Tauri floating toolbar window.
- Keep it small, draggable, and visually quiet.
- Buttons:
  - Screenshot.
  - Record.
  - Hide/close.
- Do not block the main app window.
- Store toolbar position if low-cost; otherwise use a sane default.

**Acceptance Criteria:**

- [ ] Main app launches with the floating toolbar in desktop mode.
- [ ] Toolbar stays above normal windows.
- [ ] Toolbar does not appear as a large second app surface.
- [ ] Toolbar buttons emit capture intents to the app backend/frontend.

**Verification:**

- [ ] Tauri config/capability tests cover the extra window where practical.
- [ ] Manual check on Windows first.
- [ ] Follow-up manual checks on macOS/Linux before claiming cross-platform completion.

## Phase 4: Screenshot Selection Flow

**Goal:** Ship the first capture loop with screenshots.

**Scope:**

- Enter screenshot selection state from toolbar.
- Show a full-screen overlay for drag selection.
- Convert selected region to a PNG asset.
- Action bar after selection:
  - Save to local.
  - Save to canvas.
  - Copy to clipboard.
- Reuse existing image asset upload and canvas placement.

**Acceptance Criteria:**

- [ ] User can drag-select a screenshot region.
- [ ] User can save the screenshot to local file.
- [ ] User can place the screenshot on the current canvas.
- [ ] User can copy the screenshot to the clipboard.
- [ ] Captured asset includes `capturedAt`, dimensions, and origin metadata.

**Verification:**

- [ ] Unit tests cover screenshot metadata.
- [ ] Manual check: screenshot to canvas, reload, image remains.
- [ ] Manual check: screenshot to clipboard, paste into another app.
- [ ] `npm.cmd run build` succeeds.

## Phase 5: No-Audio Recording As Video Asset

**Goal:** Record a selected region as a durable video asset.

**Scope:**

- Enter recording selection state from toolbar.
- Record selected area without audio.
- Prefer `video/webm` or `video/mp4` depending on implementation feasibility.
- Upload recording to asset storage.
- Place recording on canvas as `videoAsset`.
- Default node state is idle with play button.

**Acceptance Criteria:**

- [ ] User can record a short selected-area clip.
- [ ] Recording is stored as a video asset.
- [ ] Recording can be placed on canvas.
- [ ] Recording does not autoplay.
- [ ] Play button starts playback.
- [ ] Metadata includes duration, dimensions, capturedAt, origin, and `hasAudio: false`.

**Verification:**

- [ ] Manual check: record 5 seconds, save to canvas, reload, play.
- [ ] Storage test covers video size limits.
- [ ] `npm.cmd run build` succeeds.

## Phase 6: Optional No-Audio GIF Export

**Goal:** Provide GIF only where it makes sense: short, silent loops.

**Scope:**

- Add optional export path from a no-audio recording to GIF.
- Use a permissively licensed encoder such as the `gif` crate.
- Limit GIF export by duration, FPS, and dimensions.
- Store GIF only if storage support is intentionally added; otherwise treat as local export.

**Acceptance Criteria:**

- [ ] User can export a short silent recording as GIF.
- [ ] GIF export is clearly labeled as no-audio.
- [ ] Export limits prevent accidental huge files.
- [ ] The app does not imply GIF supports audio.

**Verification:**

- [ ] Unit tests cover GIF eligibility rules.
- [ ] Manual check: export GIF and open outside the app.

## Phase 7: Audio Recording Path

**Goal:** Add audio only through a video format that supports it.

**Scope:**

- Add a recording option: no audio / microphone audio / system audio if platform support is viable.
- Output MP4 or WebM, not GIF.
- Store `hasAudio: true`.
- Keep playback user-triggered.
- Evaluate platform permissions and user prompts before enabling by default.

**Acceptance Criteria:**

- [ ] User can choose whether to include audio.
- [ ] Audio recordings are stored as video assets.
- [ ] Metadata marks audio presence.
- [ ] GIF export is disabled for audio recordings.

**Verification:**

- [ ] Manual audio recording check per platform.
- [ ] Playback check after reload.
- [ ] Permission denial path is understandable.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| GIF expectation conflicts with audio | High | Treat GIF as silent export only; use video assets for audio. |
| Capture permissions differ across OSes | High | Start Windows-first, document macOS/Linux checks before claiming complete. |
| Video files exceed storage limits | Medium | Align storage limits and add duration/FPS/resolution caps. |
| Canvas becomes noisy with autoplay | Medium | Default video nodes to idle; require explicit play. |
| Inspiration references and generated results mix together | High | Require `purpose` metadata on asset references. |
| Native capture library changes | Medium | Hide capture behind a small service boundary. |
| Licensing surprises | High | Avoid GPL/AGPL dependencies in default embedded path. |

## Implementation Notes

- The first implementation should prefer a narrow vertical slice:
  1. Add video node support for existing uploaded MP4/WebM.
  2. Add screenshot capture to canvas.
  3. Add no-audio recording to video asset.
- Do not start with audio. It adds permissions, device selection, and sync complexity.
- Do not start with GIF. It is useful, but it is not the source format.
- Keep all generated assets inside the current workspace data directory.

## Review Checkpoints

### Checkpoint 1: Video Asset On Canvas

- [ ] Upload video.
- [ ] Place on canvas.
- [ ] Reload project.
- [ ] Confirm idle poster state.
- [ ] Click to play.

### Checkpoint 2: Screenshot Capture Loop

- [ ] Toolbar opens screenshot mode.
- [ ] Region selection works.
- [ ] Save to local works.
- [ ] Save to canvas works.
- [ ] Copy to clipboard works.

### Checkpoint 3: Recording Loop

- [ ] Toolbar opens recording mode.
- [ ] Short no-audio recording works.
- [ ] Video asset persists.
- [ ] Canvas playback is explicit.
- [ ] Optional GIF export is silent and bounded.

### Checkpoint 4: Audio Decision

- [ ] Confirm target format.
- [ ] Confirm OS permission behavior.
- [ ] Confirm whether MVP needs audio now or can defer.

