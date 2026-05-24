# Release Checklist

- `npm.cmd run test -- --run`
- `npm.cmd run build`
- `npm.cmd run agent:check` when Agent Runtime changes are included
- Review `git status --short`
- Confirm docs changed with code behavior
- Confirm no API keys or local runtime data are staged
- Confirm incomplete capabilities are labeled as roadmap or not yet implemented
