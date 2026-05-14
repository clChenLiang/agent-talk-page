import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverThreads, loadThread, parseTranscript } from './codexSource';

const fixture = [
  JSON.stringify({ item: { type: 'session_meta', id: 'thread-1', title: 'Demo thread', timestamp: '2026-05-12T01:00:00.000Z' } }),
  JSON.stringify({ item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'How do I split long replies?' }], timestamp: '2026-05-12T01:01:00.000Z' } }),
  JSON.stringify({ item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Use a compact question stream and a separate answer pane.' }], timestamp: '2026-05-12T01:02:00.000Z' } }),
  'not json',
  JSON.stringify({ item: { type: 'message', role: 'user', content: 'Second question', timestamp: '2026-05-12T01:03:00.000Z' } }),
  JSON.stringify({ item: { type: 'message', role: 'assistant', content: 'Second answer', timestamp: '2026-05-12T01:04:00.000Z' } })
].join('\n');

const desktopFixture = [
  JSON.stringify({ type: 'session_meta', payload: { id: 'desktop-thread', timestamp: '2026-05-12T01:00:00.000Z' } }),
  JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'User asks from desktop' }] } }),
  JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Assistant answers from desktop' }] } })
].join('\n');

describe('codexSource', () => {
  it('parses JSONL records into messages without crashing on malformed lines', () => {
    const parsed = parseTranscript(fixture, '/tmp/thread.jsonl');

    expect(parsed.id).toBe('thread-1');
    expect(parsed.title).toBe('How do I split long replies?');
    expect(parsed.messages).toHaveLength(4);
    expect(parsed.messages[0]).toMatchObject({ role: 'user', text: 'How do I split long replies?' });
  });

  it('parses Codex Desktop payload records', () => {
    const parsed = parseTranscript(desktopFixture, '/tmp/desktop.jsonl');

    expect(parsed.id).toBe('desktop-thread');
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0]).toMatchObject({ role: 'user', text: 'User asks from desktop' });
    expect(parsed.messages[1]).toMatchObject({ role: 'assistant', text: 'Assistant answers from desktop' });
  });



  it('skips synthetic environment context messages', () => {
    const contextFixture = [
      JSON.stringify({ type: 'session_meta', payload: { id: 'context-thread', timestamp: '2026-05-12T01:00:00.000Z' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>\n  <cwd>/tmp/project</cwd>\n</environment_context>' }] } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Real user question' }] } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Real assistant answer' }] } })
    ].join('\n');

    const parsed = parseTranscript(contextFixture, '/tmp/context.jsonl');
    expect(parsed.title).toBe('Real user question');
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0]).toMatchObject({ role: 'user', text: 'Real user question' });
  });

  it('discovers files and loads paired conversation turns', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'codex-viewer-'));
    const file = path.join(dir, 'thread.jsonl');
    await writeFile(file, fixture, 'utf8');

    const threads = await discoverThreads({ roots: [dir] });
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ id: 'thread-1', parseStatus: 'ok', turnCount: 2 });

    const turns = await loadThread('thread-1', { roots: [dir] });
    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({
      userText: 'How do I split long replies?',
      assistantText: 'Use a compact question stream and a separate answer pane.'
    });
  });
});
