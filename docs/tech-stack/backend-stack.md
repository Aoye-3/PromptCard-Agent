# Backend Stack

PromptCard's local backend stack is intentionally small:

- Python 3.12, FastAPI, and Uvicorn for the PromptCard Gateway.
- `volcengine-python-sdk[ark]` for multimodal text and image provider calls.
- Node.js and `@earendil-works/pi-agent-core` for the focused text Agent loop.
- PromptCard Storage and SQLite for durable projects, Prompt Library data, media, image conversations, and image runs.
- Operating-system keyring for model credentials.

The text Agent keeps only bounded in-memory conversation state. It does not own a second database, sandbox, skill registry, subagent system, or generic tool platform.

DeerFlow and LangGraph are not runtime dependencies.
