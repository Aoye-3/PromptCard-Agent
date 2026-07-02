# Long-Term Plans

This folder stores time-sensitive, multi-stage plans that are expected to guide work across multiple sessions.

Use this folder for plans that:

- describe a product or engineering direction that may change over time;
- need phased execution rather than a single pull request;
- include explicit checkpoints, acceptance criteria, and review dates;
- should remain visible to future contributors and agents.

Do not use this folder for permanent architecture records. Stable decisions belong in `docs/decisions/`. Completed or obsolete plans should stay here with their status updated instead of being deleted.

## Plan Status Values

- `Active`: currently guiding implementation.
- `Paused`: intentionally stopped, but may resume.
- `Completed`: all planned checkpoints are done or superseded by shipped work.
- `Superseded`: replaced by a newer plan.
- `Archived`: retained for history only.

## Naming

Use numbered filenames:

```text
001-cross-platform-clipboard-asset-workbench.md
002-next-plan-name.md
```
