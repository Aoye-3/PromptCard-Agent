# Release Checklist

- `npm.cmd run test -- --run`
- `npm.cmd run build`
- `npm.cmd run agent:check` when Agent Runtime changes are included
- `npm.cmd run tauri:dev` when desktop shell behavior changes
- Review `git status --short`
- Confirm docs changed with code behavior
- Confirm no API keys, tokens, passwords, or Agent Runtime state are staged
- Confirm the intended desktop profile mode: repository-local for self-use development, AppData only when distribution testing explicitly enables it
- For private self-use releases, confirm the complete intended `data/` directory is committed, including archives and trash
- Before any distributed or public release, remove personal data from the source tree and make AppData the default profile
- Confirm `public/app-icon.png`, the browser favicon, and generated Tauri icons display the maintained application icon
- Confirm desktop source update rejects a dirty Git worktree before running `git pull --ff-only`
- Confirm incomplete capabilities are labeled as roadmap or not yet implemented
