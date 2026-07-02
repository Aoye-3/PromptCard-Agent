# Plan 002: Floating Capture, Recent Captures, And Video Asset MVP

## Status

Active

## Date

2026-07-02

## Last Updated

2026-07-02

## Timezone

Europe/London

## Context

This plan extends Plan 001's cross-platform copy/paste asset loop with a focused capture layer:

```text
Floating capture toolbar
  -> screenshot selection
  -> Recent Captures inbox
  -> add prompt, note, source, and category metadata
  -> register selected captures into Prompt Library or place them on canvas
  -> add recording after the screenshot loop is stable
```

The product correction for this revision is:

> Prompt Library is not the first landing place for raw captures. Recent Captures is the temporary media inbox. Prompt Library is the curated, Agent-visible knowledge base.

This creates a safer workflow:

- Capture quickly without interrupting creative work.
- Review captures in batches.
- Add prompt text, notes, source context, and reference roles later.
- Promote only useful material into Prompt Library.
- Keep raw or undecided captures away from Agent context until the user explicitly registers them.

## Product Shape

The running desktop app should have:

- The main PromptCard Manager window.
- A small always-on-top floating toolbar that does not take much screen space.
- A top-level Media page for capture review and registration.
- The formal bottom-navigation category name is `媒体`.
- The page title shown after entering the Media page is `近期捕获`.
- Media exists at the same app navigation level as Projects, Prompt Library, and Settings.
- Media is reachable from the global bottom navigation bar.

Toolbar modes:

- Screenshot.
- Record, added after screenshot capture and Recent Captures are usable.
- Hide/close.

Screenshot flow:

```text
Click screenshot on floating toolbar
  -> enter selection state
  -> drag from start point to end point
  -> show screenshot action bar
  -> save to Recent Captures by default
  -> optional: copy to clipboard / save to local / place on current canvas
```

Recent Captures flow:

```text
Open Recent Captures
  -> browse captured screenshots and recordings in batches
  -> add prompt, note, source platform, source URL, category, and reference role
  -> register selected item into Prompt Library
  -> or place selected item on current canvas
  -> or mark as generated result / inspiration reference
```

Recording flow:

```text
Click record on floating toolbar
  -> enter selection state
  -> choose no-audio or with-audio when available
  -> record selected area
  -> save recording to Recent Captures as a video asset
  -> user later annotates and registers or places it
```

Canvas behavior:

- Screenshot assets enter the canvas as image nodes when explicitly placed.
- Recording assets enter the canvas as video nodes when explicitly placed.
- Video nodes show a poster/thumbnail by default.
- Video nodes do not autoplay.
- A visible play button starts playback.
- Clicking pause/stop returns to a calm canvas state.

## Product Boundaries

Recent Captures and Prompt Library must stay distinct.

| Area | Purpose | Agent visibility | Expected contents |
| --- | --- | --- | --- |
| Recent Captures | Temporary capture inbox and batch review queue | Not exposed to Agent by default | Raw screenshots, raw recordings, quick notes, unclassified media |
| Prompt Library | Curated reusable prompt/reference knowledge | Exposed to Agent after user approval | Clean prompt records, selected references, reusable notes |
| Canvas | Active visual work surface | Project/workspace context only | Explicitly placed images, videos, text, shot material |

Recent Captures should be cheap to add to and easy to prune. Prompt Library should remain deliberate.

Navigation placement:

```text
Bottom navigation
  -> Projects
  -> 媒体
  -> Prompt Library
  -> Settings
```

The `媒体` navigation item opens the `近期捕获` page. Recent Captures is a top-level workspace utility page, not a Prompt Library tab and not a per-project-only panel.

## Execution Order

The implementation order for this plan is:

```text
1. Build the Media / Recent Captures frontend UI layer.
2. Add and refine the floating capture toolbar.
3. Add screenshot selection and save captures into Recent Captures.
4. Connect information flow between Prompt Library, Recent Captures, and Canvas.
5. Add screen recording as video assets.
6. Add optional no-audio GIF export only after video capture is stable.
```

The first useful deliverable is the `媒体` page shell with the `近期捕获` title, empty state, media grid/list, metadata editor affordances, and placeholder actions. Capture can be wired into it after the page exists.

## Non-Goals

- Do not build a full video editor.
- Do not build cloud sharing for captured assets in this MVP.
- Do not require external generation platform APIs.
- Do not make Prompt Library the default landing place for every capture.
- Do not expose Recent Captures to Agent context by default.
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

Add a small application-level layer above physical assets:

- Recent Captures stores asset references and review metadata.
- Prompt Library registration copies or transforms selected Recent Captures metadata into Prompt Library records.
- Canvas placement creates canvas nodes from selected captures.
- Physical files remain in the existing asset store.

Candidate components:

| Capability | Preferred path | Notes |
| --- | --- | --- |
| Floating toolbar | Tauri multi-window / Window API | Small always-on-top, undecorated window. |
| Global trigger | Tauri `global-shortcut` plugin | Optional after toolbar MVP; useful for screenshot hotkeys. |
| Clipboard text/image | Tauri `clipboard-manager` plugin plus browser clipboard events | Browser paste/drop first, native clipboard as desktop fallback. |
| Screenshot capture | `xcap` | Rust, Apache-2.0, cross-platform screenshot and region capture. |
| Video recording | Start with WebM/MP4 asset model; evaluate `xcap`/`scap` for native capture | Add after screenshot loop is stable. |
| GIF export | `gif` crate for simple no-audio GIF | Optional export only; avoid `gifski` unless AGPL/commercial licensing is accepted. |
| Local save | Tauri `dialog`/`fs` plugin | Browser download can be a temporary fallback. |

## Data Model

Keep the physical asset table as-is. Add logical capture and asset reference metadata.

```ts
type CaptureKind = 'screenshot' | 'screenRecording' | 'pastedMedia' | 'uploadedMedia'

type CaptureStatus =
  | 'recent'
  | 'annotated'
  | 'registeredToPromptLibrary'
  | 'placedOnCanvas'
  | 'archived'

type AssetPurpose =
  | 'recentCapture'
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

interface RecentCaptureItem {
  id: string
  assetId: string
  kind: CaptureKind
  status: CaptureStatus
  purpose: AssetPurpose
  role?: AssetRole
  prompt?: string
  userNote?: string
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
  registeredPromptId?: string
  linkedProjectId?: string
  linkedCanvasNodeId?: string
  linkedShotId?: string
  linkedAttemptId?: string
}
```

Prompt Library registration should produce a curated prompt/media record from a `RecentCaptureItem`, not mutate Prompt Library silently.

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
  source: 'screen-recording' | 'paste' | 'upload' | 'recent-capture'
  capturedAt?: string
  playbackState?: 'idle' | 'playing' | 'paused'
}
```

## Phase 1: Media / Recent Captures Frontend UI

**Goal:** Build the top-level `媒体` page first, with `近期捕获` as the page title, before capture tooling is wired in.

**Scope:**

- Add a top-level Media route/page at the same level as Projects, Prompt Library, and Settings.
- Add `媒体` to the global bottom navigation bar.
- Display page title `近期捕获`.
- Add a batch-friendly media grid/list layout.
- Add empty state for no captures yet.
- Add front-end affordances for:
  - Prompt text.
  - User note.
  - Source platform.
  - Source URL.
  - Asset role: character, scene, prop, composition, lighting, color, style, mood, other.
  - Purpose: inspiration reference, generated result, prompt attachment, shot output.
- Add placeholder actions for archive, register to Prompt Library, and place on canvas.
- Keep the first version UI-only if storage is not ready yet.

**Acceptance Criteria:**

- [ ] `媒体` is visible in the bottom navigation bar.
- [ ] Entering `媒体` opens a page whose main title is `近期捕获`.
- [ ] User can open the page without entering a specific project.
- [ ] Empty state clearly supports future capture intake.
- [ ] Media grid/list and metadata editor UI are present.
- [ ] Placeholder actions do not perform destructive or misleading work.
- [ ] Recent Captures is not included in Agent-readable Prompt Library context.

**Verification:**

- [ ] UI/component tests cover route rendering and bottom-nav entry where practical.
- [ ] Manual check: navigate Projects -> Media -> Prompt Library -> Settings.
- [ ] Manual check: page title reads `近期捕获`.
- [ ] `npm.cmd run build` succeeds.

## Phase 2: Floating Toolbar Shell

**Goal:** Add the always-on-top capture entry point after the Media page exists.

**Scope:**

- Add a compact Tauri floating toolbar window.
- Keep it small, draggable, and visually quiet.
- Buttons:
  - Screenshot.
  - Record disabled or marked as coming next.
  - Hide/close.
- Do not block the main app window.
- Store toolbar position if low-cost; otherwise use a sane default.

**Acceptance Criteria:**

- [ ] Main app launches with the floating toolbar in desktop mode.
- [ ] Toolbar stays above normal windows.
- [ ] Toolbar does not appear as a large second app surface.
- [ ] Screenshot button emits a capture intent.
- [ ] Record button does not promise unfinished behavior.

**Verification:**

- [ ] Tauri config/capability tests cover the extra window where practical.
- [ ] Manual check on Windows first.
- [ ] Follow-up manual checks on macOS/Linux before claiming cross-platform completion.

## Phase 3: Screenshot Selection To Recent Captures

**Goal:** Ship the first useful capture loop: toolbar screenshot to the `近期捕获` page.

**Scope:**

- Enter screenshot selection state from toolbar.
- Show a full-screen overlay for drag selection.
- Convert selected region to a PNG asset.
- Save the PNG into the existing physical asset store.
- Create a `RecentCaptureItem` with `kind: 'screenshot'`.
- Show the new capture in the `媒体` / `近期捕获` page.
- Show a post-capture action bar:
  - Save to Recent Captures, default.
  - Copy to clipboard.
  - Save to local.
  - Place on current canvas, optional shortcut.

**Acceptance Criteria:**

- [ ] User can drag-select a screenshot region.
- [ ] Screenshot is saved to Recent Captures by default.
- [ ] Captured asset appears in the `近期捕获` page.
- [ ] Captured asset includes `capturedAt`, dimensions, origin, and content type.
- [ ] User can copy the screenshot to the clipboard.
- [ ] User can save the screenshot to local file.
- [ ] User can optionally place the screenshot on the current canvas.

**Verification:**

- [ ] Unit tests cover screenshot metadata normalization.
- [ ] Manual check: screenshot to Recent Captures, reload, item remains.
- [ ] Manual check: screenshot to clipboard, paste into another app.
- [ ] Manual check: screenshot to canvas, reload, image remains.
- [ ] `npm.cmd run build` succeeds.

## Phase 4: Three-Way Information Flow

**Goal:** Connect Prompt Library, Recent Captures, and Canvas without blurring their responsibilities.

**Scope:**

- Add Recent Captures -> Prompt Library registration.
- Add Recent Captures -> Canvas placement.
- Add Canvas -> Recent Captures save/reference where useful.
- Add Prompt Library -> Canvas placement where useful.
- Preserve physical asset reuse instead of duplicating files.
- Preserve semantic separation:
  - Recent Captures is the raw media review layer.
  - Prompt Library is the curated Agent-visible layer.
  - Canvas is the active composition layer.

**Acceptance Criteria:**

- [ ] User can register a single capture to Prompt Library.
- [ ] User can register multiple annotated captures in a batch.
- [ ] Registered Prompt Library records include media, prompt text, role, and notes when present.
- [ ] User can place a Recent Capture on the current canvas.
- [ ] Placing on canvas does not automatically register the item to Prompt Library.
- [ ] Prompt Library remains the only Agent-visible curated source.
- [ ] Registration and placement are explicit and reviewable.

**Verification:**

- [ ] Unit tests cover Recent Capture to Prompt Library transformation.
- [ ] Existing canvas image tests still pass.
- [ ] Manual check: register capture, open Prompt Library, confirm media and metadata.
- [ ] Manual check: place capture on canvas, reload, image remains.
- [ ] Manual check: Agent context includes registered Prompt Library item, not raw Recent Captures.

## Phase 5: Recording To Recent Captures As Video Asset

**Goal:** Add recording only after the Media page, toolbar, screenshot flow, and three-way information flow are stable.

**Scope:**

- Enter recording selection state from toolbar.
- Record selected area.
- Save recording to Recent Captures as a video asset.
- Default no-audio path may output WebM or MP4 depending on implementation feasibility.
- With-audio path must output video, not GIF.
- Metadata includes duration, dimensions, capturedAt, origin, and `hasAudio`.

**Acceptance Criteria:**

- [ ] User can record a short selected-area clip.
- [ ] Recording is stored in Recent Captures.
- [ ] Recording appears in the `近期捕获` page.
- [ ] Recording can be annotated with prompt and notes.
- [ ] No-audio recordings are marked `hasAudio: false`.
- [ ] Audio recordings, when supported, are marked `hasAudio: true`.
- [ ] GIF is not offered for audio recordings.

**Verification:**

- [ ] Manual check: record 5 seconds, save to Recent Captures, reload, play preview.
- [ ] Storage test covers video size limits.
- [ ] Permission denial path is understandable.
- [ ] `npm.cmd run build` succeeds.

## Phase 6: Video Asset On Canvas

**Goal:** Let recordings live on the canvas without autoplay.

**Scope:**

- Add `videoAsset` as a canvas media node kind.
- Render a video node with a poster/thumbnail or neutral placeholder.
- Default video state is idle.
- Add play/pause control inside the node.
- Support `video/mp4` and `video/webm`.

**Acceptance Criteria:**

- [ ] A recording from Recent Captures can be placed on the canvas as a video node.
- [ ] The canvas shows a stable video node frame by default.
- [ ] The video does not autoplay after project load.
- [ ] Clicking play starts playback.
- [ ] Clicking pause stops playback without resizing or shifting the node.

**Verification:**

- [ ] Unit tests cover video node normalization.
- [ ] Component tests cover default idle state and play control rendering.
- [ ] Manual check: reload project, confirm no video autoplays.
- [ ] Manual check: place recording from Recent Captures, play, pause, reload.
- [ ] `npm.cmd run build` succeeds.

## Phase 7: Optional No-Audio GIF Export

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

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Prompt Library becomes a raw media dump | High | Send all new captures to Recent Captures first; require explicit registration. |
| Agent reads uncurated private captures | High | Keep Recent Captures excluded from Agent context by default. |
| GIF expectation conflicts with audio | High | Treat GIF as silent export only; use video assets for audio. |
| Capture permissions differ across OSes | High | Start Windows-first, document macOS/Linux checks before claiming complete. |
| Video files exceed storage limits | Medium | Align storage limits and add duration/FPS/resolution caps. |
| Canvas becomes noisy with autoplay | Medium | Default video nodes to idle; require explicit play. |
| Inspiration references and generated results mix together | High | Require `purpose` metadata on capture registration. |
| Native capture library changes | Medium | Hide capture behind a small service boundary. |
| Licensing surprises | High | Avoid GPL/AGPL dependencies in default embedded path. |

## Implementation Notes

- The first implementation should prefer this narrow vertical slice:
  1. Bottom-nav `媒体` entry.
  2. `近期捕获` page shell.
  3. Empty state, media grid/list, and metadata editor UI.
  4. Floating toolbar shell.
  5. Screenshot selection saved into Recent Captures.
  6. Three-way flow between Prompt Library, Recent Captures, and Canvas.
- Do not start with recording before the `媒体` / `近期捕获` UI and screenshot flow are usable.
- Do not start with video node work before recording exists and Recent Captures can place items on canvas.
- Do not start with audio. It adds permissions, device selection, and sync complexity.
- Do not start with GIF. It is useful, but it is not the source format.
- Keep all generated assets inside the current workspace data directory.
- Keep Recent Captures storage simple: it can be a lightweight collection that references existing assets.

## Review Checkpoints

### Checkpoint 1: Media Page Shell

- [ ] Bottom navigation includes `媒体`.
- [ ] `媒体` opens a top-level page titled `近期捕获`.
- [ ] Page can be opened without entering a project.
- [ ] Empty state, grid/list shell, and metadata editor affordances are present.
- [ ] Raw Recent Captures are not Agent-visible.

### Checkpoint 2: Floating Toolbar

- [ ] Toolbar launches with the desktop app.
- [ ] Toolbar stays small and always on top.
- [ ] Screenshot button enters capture state.

### Checkpoint 3: Screenshot To Recent Captures

- [ ] Region selection works.
- [ ] Screenshot lands in Recent Captures.
- [ ] Screenshot appears in the `近期捕获` page.
- [ ] Copy to clipboard works.
- [ ] Save to local works.
- [ ] Optional place-on-canvas works.

### Checkpoint 4: Recent Captures Review

- [ ] Captures can be browsed in batches.
- [ ] User can add prompt text and notes.
- [ ] User can classify purpose and role.
- [ ] Raw Recent Captures are not Agent-visible.

### Checkpoint 5: Three-Way Information Flow

- [ ] User can register selected captures.
- [ ] Prompt Library record contains curated media and metadata.
- [ ] User can place selected captures on canvas.
- [ ] Prompt Library, Recent Captures, and Canvas reuse physical assets without needless file duplication.
- [ ] Agent can read the registered Prompt Library item.
- [ ] Agent cannot read unregistered Recent Captures.

### Checkpoint 6: Recording As Video Asset

- [ ] Toolbar opens recording mode.
- [ ] Short recording saves to Recent Captures.
- [ ] Recording appears in the `近期捕获` page.
- [ ] Recording can be annotated.
- [ ] Recording can be placed on canvas.
- [ ] Video playback is explicit and non-autoplaying.

### Checkpoint 7: Audio And GIF Decision

- [ ] Confirm target video format for audio recordings.
- [ ] Confirm OS permission behavior.
- [ ] Confirm GIF remains no-audio export only.
