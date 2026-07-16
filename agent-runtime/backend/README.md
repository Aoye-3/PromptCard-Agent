# PromptCard Runtime Gateway

This package is the Python Gateway for PromptCard-Manager.

It provides:

- the PromptCard Runtime browser API;
- model catalog, connections, assignments, and OS-keyring credentials;
- Volcengine Ark multimodal chat calls;
- Media Library image analysis;
- provider-neutral image generation.

The focused pi text Agent lives in `../../text-agent-runtime/`. DeerFlow and LangGraph are not runtime dependencies.

From the repository root:

```powershell
npm.cmd run agent:check
npm.cmd run agent:dev
```

Backend verification:

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q -p no:cacheprovider
.\.venv\Scripts\python.exe -m ruff check --no-cache app tests
```
