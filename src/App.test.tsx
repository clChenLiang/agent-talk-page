import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const writeText = vi.fn().mockResolvedValue(undefined);

const threads = [{
  id: '019e1b0b-9674-7f53-9357-421d7c03a0d2',
  title: 'Split UI idea',
  sourcePath: '/tmp/thread.jsonl',
  parseStatus: 'ok' as const,
  turnCount: 3
}, {
  id: 'thread-2',
  title: 'Another long thread',
  sourcePath: '/tmp/thread-2.jsonl',
  parseStatus: 'ok' as const,
  turnCount: 8
}];

const turns = [{
  id: 'turn-1',
  threadId: '019e1b0b-9674-7f53-9357-421d7c03a0d2',
  userText: 'Can we split the conversation?',
  assistantText: 'Yes. Keep questions compact and show full replies in another pane.',
  sourcePath: '/tmp/thread.jsonl'
}, {
  id: 'turn-2',
  threadId: '019e1b0b-9674-7f53-9357-421d7c03a0d2',
  userText: 'Please include a global overview for the thread.',
  assistantText: 'The overview can summarize the current thread shape and selected question.',
  sourcePath: '/tmp/thread.jsonl'
}, {
  id: 'turn-3',
  threadId: '019e1b0b-9674-7f53-9357-421d7c03a0d2',
  userText: '### Rich idea\n- First item\n- Second item\nUse `codex resume` here.',
  assistantText: 'Rich question received.',
  sourcePath: '/tmp/thread.jsonl'
}];

const threadTwoTurns = [{
  id: 'thread-2-turn-1',
  threadId: 'thread-2',
  userText: 'Second thread first question',
  assistantText: 'Second thread answer.',
  sourcePath: '/tmp/thread-2.jsonl'
}];

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/threads') return Promise.resolve(jsonResponse(threads));
      if (url === '/api/threads/019e1b0b-9674-7f53-9357-421d7c03a0d2/turns') return Promise.resolve(jsonResponse(turns));
      if (url === '/api/threads/thread-2/turns') return Promise.resolve(jsonResponse(threadTwoTurns));
      if (url === '/api/reveal') return Promise.resolve(jsonResponse({ ok: true }));
      if (url === '/api/open-codex') return Promise.resolve(jsonResponse({ ok: true }));
      return Promise.resolve(new Response('not found', { status: 404 }));
    }));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    vi.stubGlobal('navigator', navigator);
    writeText.mockClear();
  });

  it('renders compact question stream and selected full answer', async () => {
    render(<App />);

    expect((await screen.findAllByText('Split UI idea')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Rich idea/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/回复占位 · 23 chars/)).toBeInTheDocument();
    expect(screen.getByText('Rich question received.')).toBeInTheDocument();
  });

  it('shows newest questions first by default and can switch back to oldest first', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText('Rich question received.');
    expect(questionCardLabels()).toEqual(['Q3', 'Q2', 'Q1']);

    await user.click(screen.getByRole('button', { name: /当前最新在前，切换为最早在前/ }));

    expect(questionCardLabels()).toEqual(['Q1', 'Q2', 'Q3']);
    expect(screen.getByText('Yes. Keep questions compact and show full replies in another pane.')).toBeInTheDocument();
    expect(localStorage.getItem('codex-viewer-question-order')).toBe('oldest-first');
  });

  it('shows thread overview and toggles question/answer layout side', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText(/全局小图/)).toBeInTheDocument();
    expect(screen.getByText(/当前线程：3 个问题/)).toBeInTheDocument();
    expect(screen.getByTestId('workbench').firstElementChild).toBe(screen.getByTestId('thread-overview'));
    const shell = screen.getByTestId('conversation-shell');
    expect(shell).toHaveClass('question-left');
    const appShell = screen.getByTestId('app-shell');
    expect(appShell).toHaveClass('layout-list-left');

    await user.click(screen.getByRole('button', { name: /切换排列/ }));

    expect(shell).toHaveClass('question-right');
    expect(appShell).toHaveClass('layout-list-right');
  });

  it('uses body-style text for questions in the stream', async () => {
    render(<App />);

    const question = (await screen.findAllByText('Can we split the conversation?'))[0];

    expect(question).toHaveClass('turn-question');
    expect(question.tagName).not.toBe('STRONG');
  });

  it('renders markdown-like rich text for questions', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findAllByText('Can we split the conversation?');
    await user.click(screen.getAllByText(/Rich idea/)[0]);

    expect(screen.getAllByRole('heading', { name: 'Rich idea' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('First item').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Second item').length).toBeGreaterThan(0);
    expect(screen.getAllByText('codex resume')[0].tagName).toBe('CODE');
  });

  it('supports arrow-key navigation between question cards', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('Rich question received.')).toBeInTheDocument();

    await user.keyboard('{ArrowDown}');

    expect(screen.getByText('The overview can summarize the current thread shape and selected question.')).toBeInTheDocument();

    await user.keyboard('{ArrowUp}');

    expect(screen.getByText('Rich question received.')).toBeInTheDocument();
  });

  it('hides the thread list into a dropdown selector', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('button', { name: /隐藏对话列表/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /隐藏对话列表/ }));

    expect(screen.queryByRole('heading', { name: '对话列表' })).not.toBeInTheDocument();
    const selector = screen.getByRole('combobox', { name: /选择对话/ });
    expect(selector).toBeInTheDocument();

    await user.selectOptions(selector, 'thread-2');

    await waitFor(() => expect(screen.getByText('Second thread answer.')).toBeInTheDocument());
  });

  it('copies resume command for returning to the original thread', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('codex resume 019e1b0b-9674-7f53-9357-421d7c03a0d2')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /复制 resume 命令/i }));

    expect(await screen.findByText('已复制 resume 命令')).toBeInTheDocument();
  });
});

function questionCardLabels() {
  return screen.getAllByRole('button')
    .filter((button) => button.className.includes('turn-card'))
    .map((button) => button.querySelector('.turn-index')?.textContent ?? '');
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
