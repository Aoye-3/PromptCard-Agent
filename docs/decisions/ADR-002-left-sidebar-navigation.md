# ADR-002: Use A Left Sidebar For Primary App Navigation

## Status

Accepted

Extended by [ADR-003](./ADR-003-capture-bar-primary-entry.md), which adds Capture Bar as a sixth primary entry and replaces the five-entry assumption in this ADR.

## Date

2026-07-05

## Context

PromptCard-Manager previously used a mobile-app-like bottom navigation bar for top-level areas. That pattern left less room for desktop project management, stayed visible in editor and free-canvas states, and made project utilities depend on being on the Projects home page.

The product direction is now a desktop user workspace:

- top-level pages use a fixed left sidebar;
- project editors and free canvas should hide the main sidebar and keep their own return controls;
- Trash should remain reachable from non-editor pages;
- the Builder Template Library implementation remains available, but its direct sidebar entry is not ready as a primary navigation item.

## Decision

Use `AppShell` as the owner of the fixed left sidebar for non-builder pages. Keep the five primary `MainTab` entries in the sidebar: Projects, Media, Prompt Library, Agent Dashboard, and Me.

Keep Project Trash as a pinned sidebar utility on every non-builder page. Clicking it uses the existing project-trash state flow: switch to Projects, return to home mode, close template-library state, and open the trash view.

Hide the direct Template Library sidebar entry for now. Treat it as a planned navigation item, not a deleted feature. Keep the page implementation and project-creation adapter available for future re-entry.

Builder and free-canvas screens continue to hide the main sidebar. Their own Back/Save/title controls remain the editor return path.

## Alternatives Considered

### Keep bottom navigation

- Pros: Already implemented; compact on small screens.
- Cons: Poor desktop fit, competes with editor canvas space, and was already causing the bottom menu to appear in builder states.
- Rejected because the desktop workspace needs persistent side navigation and full-height editor space.

### Keep project utilities visible only on Projects home

- Pros: Smaller sidebar outside project list.
- Cons: Trash disappears after switching to Media, Prompt Library, Agent Dashboard, or Me.
- Rejected because Trash is a global project-management utility, not only a project-home decoration.

### Keep Template Library visible beside Trash

- Pros: Preserves discoverability of builder templates.
- Cons: The product flow for templates is still being refined, and showing it as an active sidebar utility overstates its readiness.
- Rejected for now. The implementation remains available behind planned navigation work.

## Consequences

- Tests for `AppShell` should assert side navigation, not bottom navigation.
- Non-builder pages should expect a `300px` desktop sidebar offset.
- Builder screens must not depend on app-level sidebar navigation for return behavior.
- Future Template Library work should intentionally reintroduce an entry point and update this ADR or add a superseding ADR.
- The original five-entry navigation assumption was revised by ADR-003; new navigation work should treat Capture Bar as a primary non-builder entry.
