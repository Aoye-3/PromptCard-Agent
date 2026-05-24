# Project Overview

PromptCard-Manager helps users build reusable prompt cards, manage Prompt Library presets, create storyboard-style prompts, and collaborate with an optional local Agent Runtime.

## Primary Capabilities

- Card project editing with PromptCard pages and reusable card types.
- Prompt Library preset management using the `IPreset` compatibility contract.
- Storyboard and three-stage structured prompt workflows.
- Optional Agent dashboard and collaboration panel backed by a DeerFlow-derived runtime.
- Development-only file persistence for projects and Prompt Library presets.

## Repository Boundary

The repository root is `PromptCard-Manager`. The parent folder is a workspace container and may contain `_reference` materials and local-only secrets such as `API-Key.txt`.

Do not treat `_reference` content as active project code. Do not move `API-Key.txt` into the project repository.

## Main Commands

```powershell
npm.cmd run dev
npm.cmd run dev:with-agent
npm.cmd run agent:dev
npm.cmd run agent:check
npm.cmd run test -- --run
npm.cmd run build
```
