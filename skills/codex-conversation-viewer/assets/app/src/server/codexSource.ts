import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ConversationTurn, ThreadSummary } from '../shared/types';

type RawMessage = {
  role: 'user' | 'assistant';
  text: string;
  createdAt?: string;
  offset: number;
};

type ParseResult = {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  messages: RawMessage[];
};

export type CodexSourceOptions = {
  roots?: string[];
};

export async function discoverThreads(options: CodexSourceOptions = {}): Promise<ThreadSummary[]> {
  const files = await discoverCandidateFiles(options.roots ?? defaultRoots());
  const summaries = await Promise.all(
    files.map(async (file) => {
      try {
        const content = await readFile(file, 'utf8');
        const parsed = parseTranscript(content, file);
        const turns = pairMessages(parsed.messages, parsed.id, file);
        const fileStat = await stat(file);
        return {
          id: parsed.id,
          title: parsed.title,
          sourcePath: file,
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt ?? fileStat.mtime.toISOString(),
          parseStatus: 'ok' as const,
          turnCount: turns.length
        };
      } catch (error) {
        const fileStat = await stat(file).catch(() => undefined);
        return {
          id: idForPath(file),
          title: path.basename(file),
          sourcePath: file,
          updatedAt: fileStat?.mtime.toISOString(),
          parseStatus: 'error' as const,
          parseError: error instanceof Error ? error.message : String(error)
        };
      }
    })
  );

  return summaries.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
}

export async function loadThread(threadId: string, options: CodexSourceOptions = {}): Promise<ConversationTurn[]> {
  const files = await discoverCandidateFiles(options.roots ?? defaultRoots());
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const parsed = parseTranscript(content, file);
    if (parsed.id === threadId) {
      return pairMessages(parsed.messages, parsed.id, file);
    }
  }
  throw new Error(`Thread not found: ${threadId}`);
}

export async function discoverCandidateFiles(roots: string[]): Promise<string[]> {
  const existing = roots.filter((root) => existsSync(root));
  const nested = await Promise.all(existing.map((root) => walkJsonLikeFiles(root)));
  return nested.flat();
}

export function defaultRoots(): string[] {
  const home = os.homedir();
  const codexHome = process.env.CODEX_HOME;
  return [
    codexHome ? path.join(codexHome, 'sessions') : undefined,
    path.join(home, '.codex', 'sessions'),
    path.join(home, '.codex', 'logs')
  ].filter(Boolean) as string[];
}

export function parseTranscript(content: string, sourcePath: string): ParseResult {
  const lines = content.split(/\r?\n/);
  const messages: RawMessage[] = [];
  let sessionId: string | undefined;
  let title = path.basename(sourcePath);
  let createdAt: string | undefined;
  let updatedAt: string | undefined;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let record: unknown;
    try {
      record = JSON.parse(trimmed);
    } catch {
      return;
    }

    const item = extractItem(record);
    const payload = isObject(record) ? record.payload : undefined;
    const type = getString(item, 'type') ?? getString(payload, 'type') ?? getString(record, 'type');
    if (type === 'session_meta') {
      const id = getString(item, 'id') ?? getString(item, 'session_id') ?? getString(payload, 'id') ?? getString(record, 'id');
      if (id) sessionId = id;
      title = getString(item, 'title') ?? getString(payload, 'title') ?? getString(record, 'title') ?? title;
      createdAt = getString(item, 'timestamp') ?? getString(payload, 'timestamp') ?? getString(record, 'timestamp') ?? createdAt;
      updatedAt = createdAt ?? updatedAt;
      return;
    }

    const role = normalizeRole(getString(item, 'role') ?? getString(payload, 'role') ?? getString(record, 'role'));
    if (!role) return;

    const extractedText = extractText(item) ?? extractText(payload) ?? extractText(record);
    if (!extractedText?.trim()) return;
    const text = extractedText;
    if (isSyntheticContextMessage(text)) return;

    const timestamp = getString(item, 'timestamp') ?? getString(payload, 'timestamp') ?? getString(record, 'timestamp');
    if (timestamp) updatedAt = timestamp;
    messages.push({ role, text, createdAt: timestamp, offset: index + 1 });
  });

  if (!messages.length) {
    throw new Error('No user or assistant messages found');
  }

  const firstUser = messages.find((message) => message.role === 'user')?.text;
  if (firstUser) title = summarize(firstUser, 64);

  return {
    id: sessionId ?? idForPath(sourcePath),
    title,
    createdAt,
    updatedAt,
    messages
  };
}

export function pairMessages(messages: RawMessage[], threadId: string, sourcePath: string): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let current: ConversationTurn | undefined;

  for (const message of messages) {
    if (message.role === 'user') {
      current = {
        id: `${threadId}-${turns.length + 1}`,
        threadId,
        userText: message.text,
        userCreatedAt: message.createdAt,
        sourcePath,
        sourceOffsets: { user: message.offset }
      };
      turns.push(current);
      continue;
    }

    if (message.role === 'assistant') {
      if (!current) {
        current = {
          id: `${threadId}-${turns.length + 1}`,
          threadId,
          userText: '(No user message found before this assistant reply)',
          sourcePath,
          sourceOffsets: {}
        };
        turns.push(current);
      }
      if (current.assistantText) {
        current.assistantText = `${current.assistantText}\n\n${message.text}`;
      } else {
        current.assistantText = message.text;
        current.assistantCreatedAt = message.createdAt;
        current.sourceOffsets = { ...current.sourceOffsets, assistant: message.offset };
      }
    }
  }

  return turns;
}

async function walkJsonLikeFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkJsonLikeFiles(fullPath)));
    } else if (/\.(jsonl|json|log)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function extractItem(record: unknown): unknown {
  if (!isObject(record)) return record;
  if (isObject(record.payload) && record.payload.item) return record.payload.item;
  return record.item ?? record;
}

function extractText(record: unknown): string | undefined {
  if (!isObject(record)) return undefined;
  const direct = getString(record, 'text') ?? getString(record, 'content');
  if (direct) return direct;

  const content = record.content;
  if (Array.isArray(content)) {
    return content.map((part) => extractText(part)).filter(Boolean).join('\n');
  }

  const message = record.message;
  if (isObject(message)) return extractText(message);

  const payload = record.payload;
  if (isObject(payload)) return extractText(payload);

  return undefined;
}

function normalizeRole(role: string | undefined): 'user' | 'assistant' | undefined {
  if (role === 'user') return 'user';
  if (role === 'assistant') return 'assistant';
  return undefined;
}

function getString(record: unknown, key: string): string | undefined {
  if (!isObject(record)) return undefined;
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function summarize(text: string, max: number): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > max ? `${singleLine.slice(0, max - 1)}...` : singleLine;
}

function isSyntheticContextMessage(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('<environment_context>') || trimmed.startsWith('<permissions instructions>') || trimmed.startsWith('<app-context>');
}

function idForPath(filePath: string): string {
  return createHash('sha1').update(filePath).digest('hex').slice(0, 16);
}
