# Skills and Tools

Runtime skills are loaded from the configured skills path in `agent-runtime/config.yaml`.

The current safe tool surface includes:

- web fetch and image search when dependencies are available
- read-only file tools
- PromptCard Prompt Library search/read/propose-write tools
- subagent support through runtime context flags

Direct Prompt Library mutation by an Agent should remain a proposal flow requiring user approval.
