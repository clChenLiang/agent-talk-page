# Separated Codex Conversation Viewer Design

## Summary

Build a local, read-only conversation viewer for existing Codex/agent threads. The app reorganizes long chat transcripts into a split reading layout: the main stream stays compact by showing user questions plus a tiny assistant-response placeholder, and the selected assistant reply opens in a separate reading pane.

The first version is not a replacement chat client. It must not write to or mutate Codex's original thread records. When the user wants to continue a conversation, the app provides a safe "return to original thread" affordance using the best available local thread identifier/path information.

## Problem

Current agent conversations become hard to scan when assistant replies are long. The user's question and the assistant's answer can be separated by too much vertical distance, making it difficult to understand the conversation structure and revisit a specific answer.

## Goals

- Show existing Codex conversations in a compact, question-first layout.
- Keep each user question visually close to a small assistant-response placeholder.
- Show the full assistant reply in a separate pane only after selection.
- Allow the user to navigate recent local Codex threads.
- Preserve original Codex records exactly; first version is read-only.
- Provide a minimal "return to original thread" action for continuing work in Codex.

## Non-goals for MVP

- Sending new messages from this app.
- Writing back into Codex thread files or logs.
- Creating a separate branch conversation store.
- Perfect support for every possible historical transcript format.
- Cloud sync, authentication, sharing, or multi-user collaboration.

## User Experience

### Layout

The app uses a three-region layout:

1. **Thread list**: recent local Codex threads, with title/time/path-derived metadata.
2. **Question stream**: selected thread rendered as turns. Each turn shows the user question and a compact assistant placeholder.
3. **Answer reader**: full content for the selected assistant response.

Conceptual layout:

```text
+------------------+--------------------------------+--------------------------------+
| Threads          | Question stream                | Answer reader                  |
|                  |                                |                                |
| Today / thread A | [User question]                | Question: ...                  |
| Yesterday / B    |   Assistant reply · 1280 chars |                                |
|                  |   Click to read                | Assistant full reply:          |
|                  |                                | ...                            |
+------------------+--------------------------------+--------------------------------+
```

### Turn behavior

- A turn is primarily `user message -> assistant message`.
- The question stream shows the user message as the main item.
- The assistant response appears only as a small placeholder below the question.
- Clicking a turn selects it and renders the complete assistant reply in the answer reader.
- The selected turn is visually highlighted.

### Empty and error states

- No threads found: explain which local paths were scanned and how to configure/import later.
- Thread cannot be parsed: show a non-blocking error for that thread and continue listing others.
- Turn has no assistant reply: show "No assistant reply found for this turn".
- Assistant reply is huge: reader pane should scroll independently.

### Continue affordance

The MVP exposes a safe "Return to original thread" section in the reader pane. Depending on what can be discovered locally, it may include:

- thread/session id,
- original transcript path,
- a copy button for thread metadata,
- a button to reveal the file in Finder or open the containing folder,
- instructions for returning to Codex manually.

The MVP must not pretend to support reliable write-back unless a real supported Codex resume/open mechanism is discovered.

## Data Model

```ts
type ThreadSummary = {
  id: string;
  title: string;
  sourcePath: string;
  createdAt?: string;
  updatedAt?: string;
  parseStatus: 'ok' | 'error';
  parseError?: string;
};

type ConversationTurn = {
  id: string;
  threadId: string;
  userText: string;
  assistantText?: string;
  userCreatedAt?: string;
  assistantCreatedAt?: string;
  sourcePath: string;
  sourceOffsets?: {
    user?: number;
    assistant?: number;
  };
};
```

## Data Flow

1. **Discover** candidate local Codex transcript/session files.
2. **Parse** each supported file into normalized message records.
3. **Pair** messages into `ConversationTurn` items.
4. **Render** thread summaries and turns.
5. **Select** a turn to display full assistant content in the reader.
6. **Return** metadata to the user when they want to continue in Codex.

## Architecture

### Local app shell

A local web app is enough for MVP. A simple Node/Vite app can serve the UI and provide local file-reading endpoints. The UI should not read arbitrary files directly from the browser; file discovery and parsing belongs on the local server side.

### Parser boundary

Parsing should be isolated behind a small module:

```ts
interface TranscriptSource {
  discover(): Promise<ThreadSummary[]>;
  loadThread(threadId: string): Promise<ConversationTurn[]>;
}
```

This lets later work add support for additional sources without rewriting the UI.

### Safety boundary

The source module is read-only. Any function that mutates source transcript files is out of scope for MVP. If future write-back is explored, it must be added behind a separate explicit interface and safety review.

## Implementation Phases

### Phase 1: Parse proof

- Locate likely local Codex transcript/session storage.
- Inspect representative files.
- Implement read-only discovery and parsing for the current local format.
- Produce normalized thread summaries and turns.

### Phase 2: Viewer UI

- Build split layout.
- Render thread list and question stream.
- Render selected assistant reply in independent reader pane.
- Add copy actions for question/reply/thread metadata.

### Phase 3: Return-to-thread affordance

- Show source path and thread id.
- Add reveal/open containing folder if feasible on macOS.
- Add clear explanatory text that MVP does not write back to Codex.

### Phase 4: Verification

- Test with at least two real local threads.
- Test empty, parse-error, missing-assistant, and very-long-answer states.
- Confirm original transcript files are not modified.

## Testing Strategy

- Unit tests for parser fixtures.
- Unit tests for message pairing.
- UI smoke test for selecting a thread and selecting turns.
- Manual verification against real local Codex transcripts.
- Safety check: compare source file mtimes/checksums before and after viewer use.

## Open Questions / Risks

- Exact local Codex transcript format may vary by app/CLI version.
- There may not be a stable supported way to jump directly into a running Codex thread.
- Some messages may include tool calls, images, or structured content that need simplified rendering in MVP.
- Large transcripts may require lazy loading or virtualization after MVP.

## MVP Acceptance Criteria

- Lists recent local Codex conversations from the user's machine.
- Opens a selected conversation and displays a compact user-question stream.
- Keeps assistant replies collapsed in the stream by default.
- Displays a selected assistant reply in a separate reader pane.
- Provides safe metadata/action to return to the original Codex context.
- Does not write to or alter original Codex transcript files.
