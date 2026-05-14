#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, realpathSync, writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');

export function createLauncherConfig(overrides = {}) {
  const port = Number(overrides.port ?? process.env.CODEX_VIEWER_PORT ?? 4174);
  const host = String(overrides.host ?? process.env.CODEX_VIEWER_HOST ?? '127.0.0.1');
  return {
    host,
    port,
    projectRoot: String(overrides.projectRoot ?? projectRoot),
    logPath: String(overrides.logPath ?? `${process.env.HOME ?? projectRoot}/.codex-viewer.log`)
  };
}

export function viewerUrl(config) {
  return `http://${config.host}:${config.port}/`;
}

export function healthUrl(config) {
  return `${viewerUrl(config)}api/health`;
}

export async function isServiceReady(config, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetchImpl(healthUrl(config), { signal: controller.signal });
    return Boolean(response?.ok);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function waitForService(config, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const intervalMs = options.intervalMs ?? 250;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isServiceReady(config, fetchImpl)) return true;
    await sleep(intervalMs);
  }

  return false;
}

export function startService(config) {
  ensureDependencies(config.projectRoot);
  ensureBuilt(config.projectRoot);
  const logFd = openSync(config.logPath, 'a');
  writeSync(logFd, `
[${new Date().toISOString()}] starting codex viewer on ${viewerUrl(config)}
`);

  const child = spawn('npm', ['run', 'start', '--', '--host', config.host], {
    cwd: config.projectRoot,
    detached: true,
    env: {
      ...process.env,
      HOST: config.host,
      PORT: String(config.port)
    },
    stdio: ['ignore', logFd, logFd]
  });

  closeSync(logFd);
  child.unref();
  return child.pid;
}

export function openViewer(config, options = {}) {
  const url = viewerUrl(config);
  const platform = options.platform ?? process.platform;
  const spawnImpl = options.spawnImpl ?? spawn;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawnImpl(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

export function stopService(config, options = {}) {
  const spawnSyncImpl = options.spawnSyncImpl ?? spawnSync;
  const killImpl = options.killImpl ?? process.kill;
  const result = spawnSyncImpl('lsof', [`-tiTCP:${config.port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  const pids = String(result.stdout ?? '')
    .split(/\s+/)
    .map((pid) => Number(pid))
    .filter((pid) => Number.isInteger(pid) && pid > 0);

  for (const pid of pids) {
    killImpl(pid, 'SIGTERM');
  }

  return { stopped: pids.length > 0, pids };
}

export function isCliEntrypoint(importMetaUrl, argvPath, options = {}) {
  if (!argvPath) return false;
  const realpathSyncImpl = options.realpathSyncImpl ?? realpathSync;
  return fileURLToPath(importMetaUrl) === realpathSyncImpl(argvPath);
}

export function ensureDependencies(root, options = {}) {
  const existsSyncImpl = options.existsSyncImpl ?? existsSync;
  const spawnSyncImpl = options.spawnSyncImpl ?? spawnSync;

  if (existsSyncImpl(resolve(root, 'node_modules'))) return;

  const install = spawnSyncImpl('npm', ['install'], {
    cwd: root,
    stdio: 'inherit'
  });

  if (install.status !== 0) {
    throw new Error(`npm install failed with exit code ${install.status ?? 'unknown'}`);
  }
}

function ensureBuilt(root) {
  if (existsSync(resolve(root, 'dist', 'index.html'))) return;

  const build = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    stdio: 'inherit'
  });

  if (build.status !== 0) {
    throw new Error(`npm run build failed with exit code ${build.status ?? 'unknown'}`);
  }
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function main() {
  const config = createLauncherConfig();

  if (process.argv[2] === 'stop') {
    const result = stopService(config);
    if (result.stopped) {
      console.log(`Stopped Codex Viewer pid=${result.pids.join(',')}: ${viewerUrl(config)}`);
      return;
    }

    console.log(`Codex Viewer is not running: ${viewerUrl(config)}`);
    return;
  }

  if (await isServiceReady(config)) {
    openViewer(config);
    console.log(`Codex Viewer is already running: ${viewerUrl(config)}`);
    return;
  }

  const pid = startService(config);
  const ready = await waitForService(config);
  if (!ready) {
    console.error(`Codex Viewer did not become ready. Check logs: ${config.logPath}`);
    process.exitCode = 1;
    return;
  }

  openViewer(config);
  console.log(`Started Codex Viewer pid=${pid}: ${viewerUrl(config)}`);
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
