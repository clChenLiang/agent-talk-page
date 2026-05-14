import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ConversationTurn, ThreadSummary } from './shared/types';

type LoadState = 'loading' | 'ready' | 'error';
type QuestionSide = 'left' | 'right';
type ThreadListSide = 'left' | 'right';
type QuestionOrder = 'newest-first' | 'oldest-first';

const QUESTION_ORDER_STORAGE_KEY = 'codex-viewer-question-order';

export default function App() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>();
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [selectedTurnId, setSelectedTurnId] = useState<string>();
  const [threadState, setThreadState] = useState<LoadState>('loading');
  const [turnState, setTurnState] = useState<LoadState>('ready');
  const [questionSide, setQuestionSide] = useState<QuestionSide>('left');
  const [threadListSide, setThreadListSide] = useState<ThreadListSide>('left');
  const [threadListHidden, setThreadListHidden] = useState(false);
  const [questionOrder, setQuestionOrder] = useState<QuestionOrder>(() => readStoredQuestionOrder());
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState<string>();
  const [openStatus, setOpenStatus] = useState<string>();

  useEffect(() => {
    fetch('/api/threads')
      .then(assertOk)
      .then((data: ThreadSummary[]) => {
        setThreads(data);
        setSelectedThreadId(data.find((thread) => thread.parseStatus === 'ok')?.id);
        setThreadState('ready');
      })
      .catch((caught: Error) => {
        setError(caught.message);
        setThreadState('error');
      });
  }, []);

  useEffect(() => {
    if (!selectedThreadId) {
      setTurns([]);
      setSelectedTurnId(undefined);
      return;
    }

    setTurnState('loading');
    fetch(`/api/threads/${encodeURIComponent(selectedThreadId)}/turns`)
      .then(assertOk)
      .then((data: ConversationTurn[]) => {
        setTurns(data);
        setSelectedTurnId(questionOrder === 'newest-first' ? data.at(-1)?.id : data[0]?.id);
        setTurnState('ready');
      })
      .catch((caught: Error) => {
        setError(caught.message);
        setTurnState('error');
      });
  }, [selectedThreadId]);

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId);
  const selectedTurn = turns.find((turn) => turn.id === selectedTurnId);
  const selectedTurnIndex = Math.max(0, turns.findIndex((turn) => turn.id === selectedTurnId));
  const displayedTurns = useMemo(() => {
    return questionOrder === 'newest-first' ? [...turns].reverse() : turns;
  }, [questionOrder, turns]);
  const selectedDisplayIndex = Math.max(0, displayedTurns.findIndex((turn) => turn.id === selectedTurnId));

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || turns.length < 2) return;

      const currentIndex = displayedTurns.findIndex((turn) => turn.id === selectedTurnId);
      if (currentIndex < 0) return;

      const nextKeys = new Set(['ArrowDown', 'ArrowRight']);
      const previousKeys = new Set(['ArrowUp', 'ArrowLeft']);
      const direction = nextKeys.has(event.key) ? 1 : previousKeys.has(event.key) ? -1 : 0;
      if (direction === 0) return;

      const nextIndex = Math.min(displayedTurns.length - 1, Math.max(0, currentIndex + direction));
      if (nextIndex === currentIndex) return;

      event.preventDefault();
      setSelectedTurnId(displayedTurns[nextIndex].id);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [displayedTurns, selectedTurnId, turns.length]);

  useEffect(() => {
    localStorage.setItem(QUESTION_ORDER_STORAGE_KEY, questionOrder);
  }, [questionOrder]);

  const resumeCommand = useMemo(() => {
    if (!selectedThread) return '';
    return `codex resume ${selectedThread.id}`;
  }, [selectedThread]);

  const threadOverview = useMemo(() => {
    const totalTurns = turns.length || selectedThread?.turnCount || 0;
    const totalReplyChars = turns.reduce((sum, turn) => sum + (turn.assistantText?.length ?? 0), 0);
    return { totalTurns, totalReplyChars };
  }, [selectedThread?.turnCount, turns]);

  async function copyText(label: string, text: string) {
    await navigator.clipboard?.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(undefined), 1400);
  }

  async function revealSource() {
    if (!selectedThread) return;
    await fetch('/api/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath: selectedThread.sourcePath })
    });
  }

  async function openCodexApp() {
    if (!selectedThread) return;
    setOpenStatus(undefined);
    const response = await fetch('/api/open-codex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath: selectedThread.sourcePath })
    });
    const body = await response.json().catch(() => ({}));
    setOpenStatus(body.message ?? (body.ok ? '已尝试打开 Codex App。' : '无法自动打开，请使用 resume 命令。'));
  }

  function toggleArrangement() {
    setQuestionSide((side) => (side === 'left' ? 'right' : 'left'));
    setThreadListSide((side) => (side === 'left' ? 'right' : 'left'));
  }

  function selectThread(threadId: string) {
    setSelectedThreadId(threadId);
  }

  function toggleQuestionOrder() {
    setQuestionOrder((order) => {
      const nextOrder = order === 'newest-first' ? 'oldest-first' : 'newest-first';
      const nextSelectedTurn = nextOrder === 'newest-first' ? turns.at(-1) : turns[0];
      setSelectedTurnId(nextSelectedTurn?.id);
      return nextOrder;
    });
  }

  const overviewBar = (
    <section className="mini-overview" aria-label="Thread overview" data-testid="thread-overview">
      <div className="overview-summary">
        <p className="eyebrow">全局小图</p>
        <strong>当前线程：{threadOverview.totalTurns} 个问题</strong>
        <span>方向键切换问题 · 正在阅读 Q{selectedTurn ? selectedTurnIndex + 1 : 0} · 约 {threadOverview.totalReplyChars} 个回复字符</span>
      </div>
      <div className="overview-rail" aria-hidden="true">
        {displayedTurns.map((turn) => (
          <button
            className={turn.id === selectedTurnId ? 'active' : ''}
            key={turn.id}
            onClick={() => setSelectedTurnId(turn.id)}
            title={compactUserText(turn.userText)}
            type="button"
          />
        ))}
      </div>
      <div className="overview-controls">
        {threadListHidden && (
          <label className="thread-dropdown">
            <span>对话</span>
            <select aria-label="选择对话" value={selectedThreadId ?? ''} onChange={(event) => selectThread(event.target.value)}>
              {threads.map((thread) => (
                <option key={thread.id} value={thread.id}>{thread.title}</option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="ghost-button" aria-label="切换排列布局" onClick={toggleArrangement}>切换排列</button>
        <button type="button" className="ghost-button" aria-label={threadListHidden ? '显示对话列表面板' : '隐藏对话列表面板'} onClick={() => setThreadListHidden((hidden) => !hidden)}>
          {threadListHidden ? '显示对话列表' : '隐藏对话列表'}
        </button>
      </div>
    </section>
  );

  const questionPane = (
    <section className="questions-pane" aria-label="Question stream">
      <div className="pane-header inline">
        <div>
          <p className="eyebrow">问题流</p>
          <h2>{selectedThread?.title ?? 'Select a thread'}</h2>
        </div>
        <button
          aria-label={questionOrder === 'newest-first' ? '当前最新在前，切换为最早在前' : '当前最早在前，切换为最新在前'}
          className="order-toggle"
          onClick={toggleQuestionOrder}
          type="button"
        >
          {questionOrder === 'newest-first' ? '最新在前' : '最早在前'}
        </button>
      </div>
      {turnState === 'loading' && <p className="muted">Loading turns...</p>}
      {turnState === 'error' && <p className="error">{error}</p>}
      {turnState === 'ready' && selectedThread && turns.length === 0 && (
        <div className="empty-card">No user/assistant turns found in this thread.</div>
      )}
      <div className="turn-list">
        {displayedTurns.map((turn) => {
          const originalIndex = turns.findIndex((candidate) => candidate.id === turn.id);
          return (
          <button
            className={`turn-card ${turn.id === selectedTurnId ? 'selected' : ''}`}
            key={turn.id}
            onClick={() => setSelectedTurnId(turn.id)}
            type="button"
          >
            <span className="turn-index">Q{originalIndex + 1}</span>
            <RichQuestionText className="turn-question rich-question rich-question-compact" text={turn.userText} />
            <span className="assistant-placeholder">
              回复占位 · {turn.assistantText?.length ?? 0} chars · 点击阅读
            </span>
          </button>
        );
        })}
      </div>
    </section>
  );

  const readerPane = (
    <section className="reader-pane" aria-label="Answer reader">
      {!selectedTurn && <div className="empty-reader">Choose a question to read the assistant reply.</div>}
      {selectedTurn && (
        <article className="reader-card">
          <div className="reader-topbar">
            <p className="eyebrow">回复阅读区</p>
            <span className="shortcut-hint">快捷键：↑/↓ 或 ←/→ 切换问题</span>
          </div>
          <h2>问题</h2>
          <RichQuestionText className="question-copy rich-question" text={selectedTurn.userText} />
          <div className="reader-actions">
            <button type="button" onClick={() => copyText('问题', selectedTurn.userText)}>复制问题</button>
            <button type="button" onClick={() => copyText('回复', selectedTurn.assistantText ?? '')}>复制回复</button>
          </div>
          <h2>Agent 回复</h2>
          <div className="answer-text">{selectedTurn.assistantText || 'No assistant reply found for this turn.'}</div>
          <aside className="return-box">
            <h3>回到原线程</h3>
            <p>我没有找到已验证的 Codex App 单线程深链。这里优先给出可在终端恢复原对话的命令；也可以尝试打开 Codex App 后再用命令恢复。</p>
            <code className="command-line">{resumeCommand}</code>
            <div className="reader-actions">
              <button type="button" onClick={() => copyText('resume 命令', resumeCommand)}>复制 resume 命令</button>
              <button type="button" onClick={openCodexApp}>打开 Codex App</button>
              <button type="button" className="secondary-button" onClick={revealSource}>显示原始记录文件</button>
            </div>
            {openStatus && <p className="open-status">{openStatus}</p>}
          </aside>
          {copied && <p className="copied">已复制 {copied}</p>}
        </article>
      )}
    </section>
  );

  const threadsPane = (
    <section className="threads-pane" aria-label="Threads">
      <div className="pane-header threads-header">
        <div>
          <p className="eyebrow">本地 Codex 线程</p>
          <h1>对话列表</h1>
          <p className="pane-note">{threads.length} threads · 只展示你的输入主线</p>
        </div>
      </div>
      {threadState === 'loading' && <p className="muted">Loading local threads...</p>}
      {threadState === 'error' && <p className="error">{error}</p>}
      {threadState === 'ready' && threads.length === 0 && (
        <div className="empty-card">
          <strong>No local threads found</strong>
          <p>Scanned the default Codex session/log paths. You can add parser sources later.</p>
        </div>
      )}
      <div className="thread-list">
        {threads.map((thread) => (
          <button
            className={`thread-item ${thread.id === selectedThreadId ? 'selected' : ''}`}
            key={thread.id}
            onClick={() => selectThread(thread.id)}
            type="button"
          >
            <span>{thread.title}</span>
            <small>{thread.turnCount ?? 0} questions</small>
            {thread.parseStatus === 'error' && <em>Parse error</em>}
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <main
      className={`app-shell layout-list-${threadListSide} ${threadListHidden ? 'list-hidden' : ''}`}
      data-testid="app-shell"
    >
      {!threadListHidden && threadsPane}
      <div className="workbench" data-testid="workbench">
        {overviewBar}
        <div className={`conversation-shell question-${questionSide}`} data-testid="conversation-shell">
          {questionPane}
          {readerPane}
        </div>
      </div>
    </main>
  );
}

async function assertOk(response: Response) {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || response.statusText);
  }
  return response.json();
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
}

function readStoredQuestionOrder(): QuestionOrder {
  return localStorage.getItem(QUESTION_ORDER_STORAGE_KEY) === 'oldest-first' ? 'oldest-first' : 'newest-first';
}

function RichQuestionText({ className, text }: { className: string; text: string }) {
  const compactedText = compactUserText(text);
  const blocks = parseRichQuestionBlocks(compactedText);

  if (blocks.length === 1 && blocks[0].type === 'paragraph') {
    return <p className={className}>{renderInlineRichText(blocks[0].text)}</p>;
  }

  return (
    <div className={className}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const HeadingTag = block.level <= 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5';
          return <HeadingTag key={index}>{renderInlineRichText(block.text)}</HeadingTag>;
        }

        if (block.type === 'list') {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineRichText(item)}</li>
              ))}
            </ul>
          );
        }

        return <p key={index}>{renderInlineRichText(block.text)}</p>;
      })}
    </div>
  );
}

type RichQuestionBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; text: string };

function parseRichQuestionBlocks(text: string): RichQuestionBlock[] {
  const blocks: RichQuestionBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    blocks.push({ type: 'paragraph', text: paragraphLines.join('\n') });
    paragraphLines = [];
  }

  function flushList() {
    if (listItems.length === 0) return;
    blocks.push({ type: 'list', items: listItems });
    listItems = [];
  }

  for (const line of text.split('\n')) {
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      continue;
    }

    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      listItems.push(listItem[1].trim());
      continue;
    }

    flushList();
    paragraphLines.push(line.trimEnd());
  }

  flushParagraph();
  flushList();

  return blocks.length > 0 ? blocks : [{ type: 'paragraph', text: '' }];
}

function renderInlineRichText(text: string) {
  const parts = text.split(/(`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }

    return <Fragment key={index}>{part}</Fragment>;
  });
}

function compactUserText(text: string): string {
  return text.trimStart()
    .replace(/^# In app browser:\n(?:.|\n)*?## My request for Codex:\n/i, '')
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
