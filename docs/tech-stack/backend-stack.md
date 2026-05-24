# Backend Stack

The optional Agent Runtime uses:

- Python 3.12+
- FastAPI
- Uvicorn
- LangGraph-related DeerFlow harness packages
- SQLite for local runtime data
- DeepSeek-compatible chat model configuration

Runtime code is mounted under `agent-runtime/`. PromptCard-Manager-facing integration should be documented as a boundary, not as a full DeerFlow internals guide.
