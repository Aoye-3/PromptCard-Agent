# Project Overview

PromptCard-Manager helps users build reusable prompt cards, manage Prompt Library presets, create storyboard-style prompts, and collaborate with an optional local Agent Runtime.

## Primary Capabilities

- Card project editing with PromptCard pages and reusable card types.
- Prompt Library preset management using the `IPreset` compatibility contract.
- Storyboard and page-based three-stage structured prompt workflows, including bound storyboard/video prompt pairs.
- Optional Agent dashboard and collaboration panel backed by a DeerFlow-derived runtime.
- Provider-neutral Free Canvas image generation with Seedream 5.0 Pro, OS-keyring credentials, local generated assets, and permanent schema v3 history.
- Development-only file persistence for projects and Prompt Library presets.

## Repository Boundary

The repository root is `PromptCard-Manager`. The parent folder is a workspace container and may contain `_reference` materials and legacy local-only artifacts.

Do not treat `_reference` content as active project code. Maintained PromptCard launchers do not consume `API-Key.txt`; model credentials belong in the operating-system keyring and must not be moved into the repository.

## Main Commands

```powershell
npm.cmd run dev
npm.cmd run dev:with-agent
npm.cmd run agent:dev
npm.cmd run agent:check
npm.cmd run test -- --run
npm.cmd run build
```
