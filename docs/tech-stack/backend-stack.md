# Backend Stack

PromptCard's local backend stack is intentionally small:

- Python 3.12, FastAPI, and Uvicorn for the PromptCard Gateway.
- `volcengine-python-sdk[ark]` for the first SDK-backed text adapter and the independent image provider.
- Node.js, `@earendil-works/pi-agent-core`, and `@earendil-works/pi-ai` for the focused text Agent loop and extensible provider collection.
- PromptCard Storage and SQLite for durable projects, Prompt Library data, media, image conversations, and image runs.
- Operating-system keyring for model credentials.

The text Agent keeps only bounded in-memory conversation state. It does not own a second database, sandbox, skill registry, subagent system, or generic tool platform.

PI-native text APIs and Gateway SDK adapters are separate extension paths. Image-generation adapters are a third path and never enter the text provider collection.

DeerFlow and LangGraph are not runtime dependencies.
