# Canvas Agent Target Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit, initially empty Canvas Agent modification-target selector while preserving the direct “补全” shortcut.

**Architecture:** Keep the existing attachment role model and Gateway request shape. Add one pure state transition for clearing the target, render a dedicated target dropdown in the composer, and wire it to panel state so clearing demotes the target to a reference instead of removing the node.

**Tech Stack:** React 18, TypeScript, Vitest, react-test-renderer, Tailwind CSS.

## Global Constraints

- Work in the current repository and branch; do not use a worktree.
- Maximum 10 mounted text nodes and at most one target.
- No target means discussion-only; the Gateway remains the enforcement boundary.
- “补全” directly selects a target; “发送到 Agent” adds a reference.

---

### Task 1: Target role state transitions

**Files:**
- Modify: `src/components/agent/canvas-agent-composer-model.ts`
- Test: `src/components/agent/canvas-agent-composer-model.test.ts`

**Interfaces:**
- Consumes: `CanvasAgentAttachment[]`
- Produces: `clearCanvasAgentTarget(current): CanvasAgentAttachment[]`

- [x] **Step 1: Write a failing model test** proving that clearing the target preserves every mounted node and converts the target to a reference.
- [x] **Step 2: Run** `npm.cmd test -- --run src/components/agent/canvas-agent-composer-model.test.ts` and confirm the new assertion fails.
- [x] **Step 3: Implement** `clearCanvasAgentTarget` as a pure role mapping without changing attachment order or IDs.
- [x] **Step 4: Run the focused model test** and confirm it passes.

### Task 2: Explicit target selector UI

**Files:**
- Modify: `src/components/agent/CanvasAgentComposer.tsx`
- Modify: `src/components/AgentCollaborationPanel.tsx`
- Test: `src/components/AgentCollaborationPanel.test.tsx`

**Interfaces:**
- Consumes: mounted node summaries and attachment roles.
- Produces: `onClearTarget(): void` and the existing `onSetTarget(nodeId)` callback.

- [x] **Step 1: Write failing component assertions** for an empty target slot after adding a reference, selecting a target from the mounted-node dropdown, and clearing it without removing the node.
- [x] **Step 2: Run** `npm.cmd test -- --run src/components/AgentCollaborationPanel.test.tsx` and confirm the assertions fail.
- [x] **Step 3: Render** a target selector above the reference chips, with an empty state, accessible menu, selected state, and clear action.
- [x] **Step 4: Wire** clear/select callbacks to attachment state and clear stale selection metadata whenever the target changes.
- [x] **Step 5: Verify** right-click “补全” still enters as target and reference requests keep the slot empty.
- [x] **Step 6: Run focused tests and** `npm.cmd run build`.
