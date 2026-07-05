# ADR-003: Make Capture Bar An On-Demand Primary Entry

## Status

Accepted

## Date

2026-07-05

## Context

The floating capture toolbar was originally configured as a Tauri startup window. That made the toolbar appear every time the desktop app opened, even when the user only wanted to manage projects, prompts, media, or Agent settings. It also made the Media page carry two different responsibilities: controlling capture tools and reviewing capture results.

The product direction separates those responsibilities:

- Capture Bar is the control surface for quick capture tools.
- Media remains the Recent Captures inbox and metadata review area.
- Desktop startup should be faster and quieter by default.
- Screenshots should still land in Recent Captures and then switch the user to Media for immediate review.

ADR-002 established a fixed left sidebar with five primary entries. This decision extends that model with a sixth primary entry.

## Decision

Add **Capture Bar** as an independent top-level `MainTab` entry in the left sidebar. It owns:

- floating toolbar status;
- toolbar start and close actions;
- a compact toolbar preview;
- current capture settings;
- the planned module list for recording, audio capture, GIF export, video canvas nodes, frame extraction, storyboard inference, visual Agent analysis, and global shortcuts.

Do not create the floating capture toolbar at desktop app startup. The main Tauri window creates or focuses the `capture-toolbar` window only when the user clicks **Start Capture Bar** on the Capture Bar page. Closing the toolbar destroys that window instead of only hiding it.

Keep `capture-toolbar` as a separate capability-bound window. The main window receives only the minimum window permissions needed to create, show, focus, inspect, and close the toolbar on demand.

Keep the existing screenshot result flow: after a screenshot is saved, refresh Recent Captures and switch to the Media page.

## Alternatives Considered

### Keep launching the toolbar at startup

- Pros: Immediate access to screenshot capture.
- Cons: Slower/noisier startup and an always-present tool surface that many sessions do not need.
- Rejected because Capture Bar should be explicit and on demand.

### Put Capture Bar controls inside Media

- Pros: Fewer sidebar entries.
- Cons: Blurs capture-tool control with captured-result review, and makes Media feel like both an inbox and a settings panel.
- Rejected because Capture Bar and Media have different jobs.

### Only hide the toolbar when closed

- Pros: Faster reopen during the same session.
- Cons: The toolbar window still exists after the user asked to close it.
- Rejected because the product requirement is a true off state.

## Consequences

- `MainTab` contains six primary entries: Projects, Media, Capture Bar, Prompt Library, Agent Dashboard, and Me.
- AppShell navigation tests should include Capture Bar and still verify that builder/free-canvas states hide the sidebar.
- Tauri config tests should assert that `capture-toolbar` is not declared as a startup window.
- The Capture Bar page should not edit Recent Captures data or replace the Media review workflow.
- Future capture modules should first appear as planned modules on the Capture Bar page, then graduate into working controls when their storage and permission boundaries are ready.
