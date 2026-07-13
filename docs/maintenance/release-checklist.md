# Release Checklist

- `npm.cmd run test -- --run`
- `npm.cmd run build`
- `npm.cmd run agent:check` when Agent Runtime changes are included
- `npm.cmd run tauri:dev` when desktop shell behavior changes
- Review `git status --short`
- Confirm docs changed with code behavior
- Confirm no API keys, tokens, passwords, or Agent Runtime state are staged
- Confirm the desktop shell uses the protected profile boundary under `logs/desktop-profile` for editable-source development
- Confirm `data/`, `logs/desktop-profile/`, `backups/`, and Agent Runtime state are not staged unless a release-specific migration explicitly requires reviewed fixture data
- Before any distributed or public release, keep personal data out of the source tree and move the default profile to the packaged app's approved user-data directory
- Confirm `public/app-icon.png`, the browser favicon, and generated Tauri icons display the maintained application icon
- Confirm the Update screen can read/write `logs/desktop-profile/config/update-source.json`
- Confirm update preview classifies protected Profile paths and manual-review paths before apply
- Confirm update preview treats `agent-runtime/backend/`, AgentHarness code, runtime scripts, runtime Docker files, and `agent-runtime/skills/public/` as source-owned
- Confirm update preview keeps `agent-runtime/.deer-flow/`, `agent-runtime/.agent/`, `.env*`, and `agent-runtime/config.yaml` out of automatic apply
- Confirm update apply rejects a dirty Git worktree before running `git merge --ff-only FETCH_HEAD`
- Confirm Profile backup creation succeeds before source files are changed
- Confirm incomplete capabilities are labeled as roadmap or not yet implemented
