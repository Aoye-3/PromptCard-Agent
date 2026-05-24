# Secrets Policy

Never commit, paste, or document real API keys.

The local Agent Runtime checks keys in this order:

1. `PROMPTCARD_AGENT_API_KEY_FILE`
2. `F:\.Agent-PromptCardManager\API-Key.txt`
3. `F:\.FinalProject\API-Key.txt`

`API-Key.txt` intentionally stays in the workspace root, outside the project repository. Documentation may mention the path but must never include file contents.
