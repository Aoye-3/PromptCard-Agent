# Plan 002: Floating Capture, Recent Captures, And Video Asset MVP

## Status

Active

## Date

2026-07-02

## Last Updated

2026-07-03

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
- Clicking a media card opens a focused media analysis dialog rather than navigating away from the `近期捕获` page.
- The media analysis dialog is split into a left media dossier and a right Agent workspace:
  - Left: one media dossier card, with media preview taking about 60% height, prompt box about 30%, and note area about 10%.
  - Right: Agent input and conversation output for visual analysis, style reverse engineering, and prompt reverse engineering.
- The first Agent in this dialog is a style analysis Agent backed by a vision model. It receives only the explicitly selected media item and user-entered prompt/note context.

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
  -> click a media card to open the media analysis dialog
  -> optionally ask the style analysis Agent to reverse-engineer style, prompt, or visual structure
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

Media analysis dialog behavior:

- Image assets support style reverse engineering, prompt reverse engineering, and sending the selected media into an Agent conversation.
- Video assets support timestamped frame extraction, timeline marks, ordered multi-frame review, and storyboard inference from extracted frames.
- Video storyboard inference should keep frame timestamps visible so the user can trace every inferred shot back to the source clip.
- Agent analysis output is reviewable text first. It does not automatically register to Prompt Library, overwrite capture metadata, or enter Agent-readable global context.

## Product Boundaries

Recent Captures and Prompt Library must stay distinct.

| Area | Purpose | Agent visibility | Expected contents |
| --- | --- | --- | --- |
| Recent Captures | Temporary capture inbox and batch review queue | Not exposed to Agent by default | Raw screenshots, raw recordings, quick notes, unclassified media |
| Prompt Library | Curated reusable prompt/reference knowledge | Exposed to Agent after user approval | Clean prompt records, selected references, reusable notes |
| Canvas | Active visual work surface | Project/workspace context only | Explicitly placed images, videos, text, shot material |

Recent Captures should be cheap to add to and easy to prune. Prompt Library should remain deliberate.

The media analysis dialog is an explicit, per-capture Agent interaction. Opening or analyzing one media item does not make the entire Recent Captures inbox Agent-readable. Analysis results remain drafts until the user applies them to capture metadata, registers them to Prompt Library, or creates project/shot records.

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
2. Add the media detail analysis dialog shell for selected captures.
3. Add and refine the floating capture toolbar.
4. Add screenshot selection and save captures into Recent Captures.
5. Connect information flow between Prompt Library, Recent Captures, Canvas, and reviewable Agent analysis output.
6. Add screen recording as video assets.
7. Add video frame extraction, timeline marks, and multi-frame storyboard inference.
8. Add optional no-audio GIF export only after video capture is stable.
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
| Visual media analysis | Existing Agent runtime boundary plus a vision-model adapter | Keep request scope to the selected capture and explicit user text. |
| Video frame extraction | Start behind a small media-processing service boundary | Output timestamped frame assets that remain linked to the source recording. |
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

Media analysis should be represented as reviewable output linked to a capture, not as an automatic Prompt Library write.

```ts
type MediaAnalysisKind =
  | 'styleReverseEngineering'
  | 'promptReverseEngineering'
  | 'freeformVisionChat'
  | 'videoStoryboardInference'

interface RecentCaptureAnalysisDraft {
  id: string
  captureId: string
  kind: MediaAnalysisKind
  inputPrompt?: string
  outputText: string
  structuredOutput?: unknown
  createdAt: string
  acceptedAt?: string
  registeredPromptId?: string
  linkedShotIds?: string[]
}

interface VideoFrameMark {
  id: string
  captureId: string
  timestampMs: number
  frameAssetId?: string
  userLabel?: string
  userNote?: string
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

- [x] `媒体` is visible in the bottom navigation bar.
- [x] Entering `媒体` opens a page whose main title is `近期捕获`.
- [x] User can open the page without entering a specific project.
- [x] Empty state clearly supports future capture intake.
- [x] Media grid/list and metadata editor UI are present.
- [x] Placeholder actions do not perform destructive or misleading work.
- [x] Recent Captures is not included in Agent-readable Prompt Library context.

**Verification:**

- [x] UI/component tests cover route rendering and bottom-nav entry where practical.
- [x] Manual check: navigate Projects -> Media -> Prompt Library -> Me/Settings.
- [x] Manual check: page title reads `近期捕获`.
- [x] `npm.cmd run build` succeeds.

## Phase 2: Media Detail Analysis Dialog Shell

**Goal:** Let a selected Recent Capture open into a focused media dossier and visual-analysis Agent workspace.

**Scope:**

- Clicking a media card opens a modal dialog over the `近期捕获` page.
- The dialog uses a two-column layout:
  - Left column: media dossier card.
  - Right column: Agent input, analysis actions, and conversation/output area.
- Left media dossier card proportions:
  - Media preview: about 60% of the card height.
  - Prompt box: about 30% of the card height.
  - Tail note/remark area: about 10% of the card height.
- The right Agent workspace includes explicit actions for:
  - Style reverse engineering.
  - Send to Agent conversation.
  - Prompt reverse engineering.
- Phase 2 can ship as UI shell first, with disabled or placeholder analysis actions if the vision model boundary is not ready.
- The selected media item is the only default Agent input. Other Recent Captures and Prompt Library records are not implicitly included.
- Agent output remains reviewable draft text until the user explicitly copies, applies, registers, or saves it.

**Acceptance Criteria:**

- [ ] Clicking a media card opens the analysis modal without leaving the Media page.
- [ ] The left side displays the selected media, prompt text area, and note area in the intended 60/30/10 information hierarchy.
- [ ] The right side displays an Agent input area and action affordances for style analysis and prompt reverse engineering.
- [ ] Closing the modal returns to the same `近期捕获` list/detail state.
- [ ] Placeholder Agent actions do not imply completed vision analysis when the backend is not connected.
- [ ] Raw Recent Captures are still not added to global Agent context automatically.

**Verification:**

- [ ] Component tests cover opening and closing the modal from a media card.
- [ ] Component tests cover the media dossier, prompt box, note area, Agent input, and disabled/placeholder action rendering.
- [ ] Manual check: open a media card, type into Agent input, close modal, reopen the same media card.
- [ ] `npm.cmd run build` succeeds.

## Phase 3: Visual Analysis Agent Integration

**Goal:** Connect the media analysis dialog to a vision-capable Agent that can infer visual style and reverse-engineer prompts.

**Scope:**

- Add a narrow vision-analysis service boundary for selected media assets.
- Send selected image media plus user-entered prompt/note context to the style analysis Agent.
- Support structured analysis outputs:
  - Style traits.
  - Visual composition.
  - Subject and scene description.
  - Lighting and color analysis.
  - Camera/framing hints.
  - Reconstructed prompt draft.
  - Negative prompt or avoidance notes when useful.
- Keep generated analysis as draft output until user approval.
- Allow the user to copy analysis into the capture prompt/note fields or register it into Prompt Library explicitly.
- Do not expose unselected Recent Captures to the Agent.

**Acceptance Criteria:**

- [ ] User can run style reverse engineering on a selected image capture.
- [ ] User can ask the Agent a free-form question about the selected media.
- [ ] User can generate a reverse-engineered prompt draft from the selected media.
- [ ] Agent requests include only the selected media item and explicitly provided text context.
- [ ] Agent output can be copied or applied by explicit user action.
- [ ] Agent output is not silently registered to Prompt Library.

**Verification:**

- [ ] Unit tests cover analysis request payload shaping and privacy boundaries.
- [ ] Unit tests cover structured analysis result normalization.
- [ ] Manual check: run style analysis on a selected screenshot and inspect request scope.
- [ ] Manual check: apply/copy generated prompt draft only after explicit action.
- [ ] `npm.cmd run build` succeeds.

## Phase 4: Floating Toolbar Shell

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

## Phase 5: Screenshot Selection To Recent Captures

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

## Phase 6: Three-Way Information Flow

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

## Phase 7: Recording To Recent Captures As Video Asset

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

## Phase 8: Video Frame Timeline And Storyboard Inference

**Goal:** Turn selected recordings into timestamped visual evidence that the Agent can analyze as an ordered sequence.

**Scope:**

- Add video-specific controls inside the media analysis dialog.
- Let the user create frame marks at multiple timestamps.
- Show a compact timeline with visible timestamp labels.
- Extract selected frames into ordered image references linked to the source video.
- Send ordered frames, timestamps, and optional user notes to the visual analysis Agent.
- Support storyboard inference from the ordered frame set:
  - Shot boundaries.
  - Scene changes.
  - Subject/action continuity.
  - Camera movement hints.
  - Suggested shot descriptions.
  - Candidate prompt text for each inferred shot.
- Keep inferred storyboard output as draft text or draft shot records until explicit user approval.
- Preserve traceability from every inferred shot back to source video timestamp(s).

**Acceptance Criteria:**

- [ ] User can add multiple timestamp marks to a selected video capture.
- [ ] The dialog shows frame marks in chronological order on a timeline.
- [ ] User can extract marked frames as ordered analysis inputs.
- [ ] User can ask the Agent to infer storyboard structure from the ordered frames.
- [ ] Inferred storyboard output includes timestamp references.
- [ ] Inferred storyboard output is not silently written to project shots, Prompt Library, or Canvas.

**Verification:**

- [ ] Unit tests cover timestamp normalization and chronological frame ordering.
- [ ] Unit tests cover video-frame analysis request payload shaping.
- [ ] Manual check: mark frames from a short recording and run storyboard inference.
- [ ] Manual check: inferred shots can be reviewed before any save/register action.
- [ ] `npm.cmd run build` succeeds.

## Phase 9: Video Asset On Canvas

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

## Phase 10: Optional No-Audio GIF Export

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
| Vision analysis leaks broader workspace context | High | Send only the selected capture and explicit user text to the vision Agent. |
| Vision/model cost or latency surprises users | Medium | Make analysis user-triggered, visible, cancellable, and draft-only. |
| Storyboard inference overstates uncertain frame interpretation | Medium | Keep timestamps visible and require user approval before creating shots. |
| Canvas becomes noisy with autoplay | Medium | Default video nodes to idle; require explicit play. |
| Inspiration references and generated results mix together | High | Require `purpose` metadata on capture registration. |
| Native capture library changes | Medium | Hide capture behind a small service boundary. |
| Licensing surprises | High | Avoid GPL/AGPL dependencies in default embedded path. |

## Implementation Notes

- The first implementation should prefer this narrow vertical slice:
  1. Bottom-nav `媒体` entry.
  2. `近期捕获` page shell.
  3. Empty state, media grid/list, and metadata editor UI.
  4. Media card detail analysis dialog shell.
  5. Style analysis Agent UI affordances with safe placeholder behavior.
  6. Floating toolbar shell.
  7. Screenshot selection saved into Recent Captures.
  8. Three-way flow between Prompt Library, Recent Captures, Canvas, and reviewable Agent analysis output.
- Do not start with vision-model execution before the media analysis dialog has clear selected-capture scope and draft-only output behavior.
- Do not start with recording before the `媒体` / `近期捕获` UI and screenshot flow are usable.
- Do not start with video storyboard inference before recordings can be stored and timestamped frames can be traced to source video.
- Do not start with video node work before recording exists and Recent Captures can place items on canvas.
- Do not start with audio. It adds permissions, device selection, and sync complexity.
- Do not start with GIF. It is useful, but it is not the source format.
- Keep all generated assets inside the current workspace data directory.
- Keep Recent Captures storage simple: it can be a lightweight collection that references existing assets.

## Review Checkpoints

### Checkpoint 1: Media Page Shell

- [x] Bottom navigation includes `媒体`.
- [x] `媒体` opens a top-level page titled `近期捕获`.
- [x] Page can be opened without entering a project.
- [x] Empty state, grid/list shell, and metadata editor affordances are present.
- [x] Raw Recent Captures are not Agent-visible.

### Checkpoint 2: Media Detail Analysis Dialog

- [ ] Clicking a media card opens the dialog.
- [ ] Left media dossier uses media/prompt/note hierarchy.
- [ ] Right Agent input and analysis actions are visible.
- [ ] Placeholder actions stay honest when vision analysis is not connected.
- [ ] Closing the dialog returns to the same Recent Captures state.

### Checkpoint 3: Visual Analysis Agent

- [ ] Style reverse engineering runs on the selected image only.
- [ ] Free-form Agent questions use the selected media and explicit user text.
- [ ] Prompt reverse engineering returns reviewable draft text.
- [ ] Draft output is not silently written into Prompt Library, project shots, or global Agent context.

### Checkpoint 4: Floating Toolbar

- [ ] Toolbar launches with the desktop app.
- [ ] Toolbar stays small and always on top.
- [ ] Screenshot button enters capture state.

### Checkpoint 5: Screenshot To Recent Captures

- [ ] Region selection works.
- [ ] Screenshot lands in Recent Captures.
- [ ] Screenshot appears in the `近期捕获` page.
- [ ] Copy to clipboard works.
- [ ] Save to local works.
- [ ] Optional place-on-canvas works.

### Checkpoint 6: Recent Captures Review

- [ ] Captures can be browsed in batches.
- [ ] User can add prompt text and notes.
- [ ] User can classify purpose and role.
- [ ] Raw Recent Captures are not Agent-visible.

### Checkpoint 7: Three-Way Information Flow

- [ ] User can register selected captures.
- [ ] Prompt Library record contains curated media and metadata.
- [ ] User can place selected captures on canvas.
- [ ] Prompt Library, Recent Captures, and Canvas reuse physical assets without needless file duplication.
- [ ] Agent can read the registered Prompt Library item.
- [ ] Agent cannot read unregistered Recent Captures.

### Checkpoint 8: Recording As Video Asset

- [ ] Toolbar opens recording mode.
- [ ] Short recording saves to Recent Captures.
- [ ] Recording appears in the `近期捕获` page.
- [ ] Recording can be annotated.
- [ ] Recording can be placed on canvas.
- [ ] Video playback is explicit and non-autoplaying.

### Checkpoint 9: Video Frame Timeline And Storyboard Inference

- [ ] User can add timestamp marks to a recording.
- [ ] Marked frames are shown in chronological order.
- [ ] Agent storyboard inference includes timestamp references.
- [ ] Inferred shots remain draft output until approved.

### Checkpoint 10: Audio And GIF Decision

- [ ] Confirm target video format for audio recordings.
- [ ] Confirm OS permission behavior.
- [ ] Confirm GIF remains no-audio export only.
