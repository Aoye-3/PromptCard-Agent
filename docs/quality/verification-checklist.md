# Verification Checklist

Run before merging broad implementation or documentation restructuring:

```powershell
npm.cmd run test -- --run
npm.cmd run storage:test
.\agent-runtime\backend\.venv\Scripts\python.exe -m unittest promptcard_storage.tests.test_app
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
npm.cmd run agent:check
cd agent-runtime/backend
uv run pytest tests/test_promptcard_runtime_boundary.py -q
```

For browser-facing changes, also smoke test the local app at:

```powershell
npm.cmd run test:e2e
```

Manual browser smoke testing at `http://127.0.0.1:3000/` is still useful when validating layout or copy.

For Agent live-model behavior, require a local key and avoid running secret-dependent checks in generic CI.
