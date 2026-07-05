# Design Guidelines

PromptCard-Manager is a productivity tool, so the UI should stay focused, scannable, and stable.

## Principles

- Keep repeated workflows efficient and predictable.
- Prefer dense but organized controls over decorative page sections.
- Use icons for familiar tool actions and text labels for commands that need clarity.
- Avoid nested cards and ornamental backgrounds in tool surfaces.
- Keep card, toolbar, board, and panel dimensions stable across hover and loading states.
- Ensure Chinese and English text fit within controls on desktop and mobile widths.

## Component Guidance

- Keep persistence decisions in stores or service helpers, not presentation components.
- Preserve the left-sidebar navigation contract unless the product navigation model intentionally changes.
- Extract from `src/App.tsx` only when the extraction has a clear ownership boundary.
