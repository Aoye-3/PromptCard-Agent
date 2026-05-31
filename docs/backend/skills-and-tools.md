# Skills and Tools

Runtime skills are loaded from the configured skills path in `agent-runtime/config.yaml`.

The Agent panel shows the current runtime tool and builtin catalog under `Tools / ToolUse`. This is a visibility and diagnostics surface; it does not grant extra permissions beyond the backend runtime configuration and proposal validators.

The current safe tool surface includes:

- web fetch and image search when dependencies are available
- read-only file tools
- PromptCard Prompt Library search/read/propose-write tools
- subagent support through runtime context flags

Direct Prompt Library mutation by an Agent should remain a proposal flow requiring user approval.

Workspace Chatbox surfaces for card, storyboard, and three-stage projects use the shared Agent Runtime with `workspace-chatbot-agent` permission scope. Prompt Library Agent surfaces use `prompt-library-agent` and remain limited to Prompt Library proposals.
