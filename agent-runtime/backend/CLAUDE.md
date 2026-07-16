# PromptCard Gateway Backend

This directory contains the Python PromptCard Gateway. It is not a DeerFlow or LangGraph checkout.

## Scope

- FastAPI app composition in `app/gateway/app.py`
- PromptCard Runtime browser boundary
- provider-neutral model management and OS-keyring credentials
- Volcengine Ark multimodal chat adapter
- Media Library asset analysis
- existing provider-neutral image-generation module

The pi Agent loop lives separately in `../../text-agent-runtime/`.

## Boundaries

- Do not add generic auth, threads/runs, sandbox, MCP, skills, subagents, channels, or shell tools.
- Browser routes remain under `/api/promptcard/runtime/*`.
- The internal chat route requires `X-PromptCard-Internal-Token`.
- Model credentials never leave this Python process.
- Text-Agent tools return proposals only; frontend users approve all Canvas and Prompt Library writes.
- Keep Image Generation independent from pi.

## Verification

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q -p no:cacheprovider
.\.venv\Scripts\python.exe -m ruff check app tests
```
