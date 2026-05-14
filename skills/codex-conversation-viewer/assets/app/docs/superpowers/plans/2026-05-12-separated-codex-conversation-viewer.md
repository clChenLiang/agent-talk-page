# Separated Codex Conversation Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local read-only Codex conversation viewer that keeps user questions compact in the main stream and opens selected assistant replies in a separate reading pane.

**Architecture:** Use a small Vite React app with a Node/Express local API. The server discovers and parses local Codex JSONL session files read-only; the React UI renders a three-pane viewer and safe return-to-thread metadata.

**Tech Stack:** Node.js, TypeScript, Vite, React, Express, Vitest, Testing Library.

---

## File Structure

- `package.json`: scripts and dependencies for the local app.
- `tsconfig.json`: shared TypeScript config.
- `vite.config.ts`: Vite + Vitest configuration.
- `index.html`: app mount point.
- `src/shared/types.ts`: shared ThreadSummary and ConversationTurn types.
- `src/server/codexSource.ts`: read-only Codex transcript discovery/parsing/pairing.
- `src/server/server.ts`: Express API and static app server.
- `src/server/codexSource.test.ts`: parser and pairing tests.
- `src/App.tsx`: React application shell and data loading.
- `src/App.css`: split-view UI styles.
- `src/main.tsx`: React bootstrap.
- `src/test/setup.ts`: UI test setup.
- `src/App.test.tsx`: UI smoke test.

## Tasks

### Task 1: Scaffold the app and shared types

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/shared/types.ts`
- Create: `src/test/setup.ts`

- [ ] Create the Node/Vite project files with scripts for dev, build, test, and start.
- [ ] Define `ThreadSummary` and `ConversationTurn` exactly once in `src/shared/types.ts`.
- [ ] Run `npm install`.
- [ ] Run `npm test -- --run` and confirm the initial test command works once tests exist in later tasks.

### Task 2: Implement read-only Codex source parser

**Files:**
- Create: `src/server/codexSource.ts`
- Create: `src/server/codexSource.test.ts`

- [ ] Write fixtures in the test file for Codex-style JSONL events containing `session_meta`, user `message`, and assistant `message` records.
- [ ] Test that parser turns a JSONL transcript into paired `ConversationTurn` objects.
- [ ] Test malformed lines do not crash parsing.
- [ ] Implement candidate path discovery under `$CODEX_HOME/sessions`, `$HOME/.codex/sessions`, and `$HOME/.codex/logs`.
- [ ] Implement `discoverThreads()` and `loadThread()` as read-only functions.
- [ ] Run `npm test -- --run src/server/codexSource.test.ts`.

### Task 3: Implement local API server

**Files:**
- Create: `src/server/server.ts`
- Modify: `package.json`

- [ ] Add `GET /api/threads` returning thread summaries.
- [ ] Add `GET /api/threads/:id/turns` returning normalized turns.
- [ ] Add `POST /api/reveal` to reveal the source file or containing folder on macOS using `open -R`; keep it best-effort and non-fatal.
- [ ] Ensure APIs never write to transcript files.
- [ ] Run `npm run build`.

### Task 4: Build split conversation UI

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/App.css`
- Create: `src/App.test.tsx`

- [ ] Test that the UI renders thread list, compact question stream, and answer reader from mocked fetch responses.
- [ ] Implement thread loading and selected-thread state.
- [ ] Implement turn selection and full assistant reply rendering.
- [ ] Add copy buttons for reply and thread metadata.
- [ ] Add the safe "Return to original thread" section.
- [ ] Run `npm test -- --run src/App.test.tsx`.

### Task 5: Verify MVP with local data

**Files:**
- Modify only if verification finds a bug.

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Start the app with `npm run dev`.
- [ ] Open the local app in the browser.
- [ ] Confirm it lists local Codex threads or shows a clear empty state.
- [ ] Confirm selecting a thread shows compact user-question turns.
- [ ] Confirm selecting a turn shows the full assistant reply in the right pane.
- [ ] Confirm original transcript files are not modified by normal viewing.
