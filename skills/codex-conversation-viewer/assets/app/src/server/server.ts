import express from 'express';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverThreads, loadThread } from './codexSource';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const isDev = process.argv.includes('--dev');
const port = Number(process.env.PORT ?? (isDev ? 5174 : 4174));
const host = process.env.HOST ?? (isDev ? '127.0.0.1' : '127.0.0.1');

const app = express();
app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'separated-codex-conversation-viewer' });
});

app.get('/api/threads', async (_request, response) => {
  try {
    response.json(await discoverThreads());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/threads/:id/turns', async (request, response) => {
  try {
    response.json(await loadThread(request.params.id));
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/reveal', async (request, response) => {
  const sourcePath = typeof request.body?.sourcePath === 'string' ? request.body.sourcePath : undefined;
  if (!sourcePath) {
    response.status(400).json({ error: 'sourcePath is required' });
    return;
  }

  try {
    if (process.platform === 'darwin') {
      const child = spawn('open', ['-R', sourcePath], { detached: true, stdio: 'ignore' });
      child.unref();
      response.json({ ok: true });
      return;
    }

    response.json({ ok: false, message: 'Reveal is only implemented for macOS in the MVP.' });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/open-codex', async (request, response) => {
  const sourcePath = typeof request.body?.sourcePath === 'string' ? request.body.sourcePath : undefined;
  if (!sourcePath) {
    response.status(400).json({ error: 'sourcePath is required' });
    return;
  }

  try {
    const workspacePath = (await readWorkspacePathFromTranscript(sourcePath)) ?? path.dirname(sourcePath);
    const child = spawn('codex', ['app', workspacePath], { detached: true, stdio: 'ignore' });
    child.unref();
    response.json({
      ok: true,
      workspacePath,
      message: '已尝试打开 Codex App 工作区；如果没有进入对应对话，请使用 resume 命令。'
    });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

async function readWorkspacePathFromTranscript(sourcePath: string): Promise<string | undefined> {
  const content = await readFile(sourcePath, 'utf8');
  for (const line of content.split(/\r?\n/).slice(0, 30)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as unknown;
      const cwd = findStringKey(record, 'cwd');
      if (cwd) return cwd;
    } catch {
      // Ignore malformed transcript lines; the viewer parser does the same.
    }
  }
  return undefined;
}

function findStringKey(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record[key] === 'string') return record[key];
  for (const nested of Object.values(record)) {
    const found = findStringKey(nested, key);
    if (found) return found;
  }
  return undefined;
}

if (!isDev) {
  const distDir = path.join(projectRoot, 'dist');
  app.use(express.static(distDir));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(port, host, () => {
  console.log(`Separated Codex Conversation Viewer listening on http://${host}:${port}`);
  if (isDev) {
    console.log('Run Vite separately with: npx vite --host 127.0.0.1');
  }
});
