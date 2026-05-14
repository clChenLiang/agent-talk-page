import { describe, expect, it, vi } from 'vitest';
import {
  createLauncherConfig,
  ensureDependencies,
  isCliEntrypoint,
  isServiceReady,
  openViewer,
  stopService,
  waitForService,
  viewerUrl
} from './codex-viewer.mjs';

describe('codex-viewer launcher', () => {
  it('uses the production service URL by default', () => {
    expect(viewerUrl(createLauncherConfig())).toBe('http://127.0.0.1:4174/');
  });



  it('installs packaged app dependencies when node_modules is missing', () => {
    const spawnSyncImpl = vi.fn().mockReturnValue({ status: 0 });
    const existsSyncImpl = vi.fn((path) => !String(path).endsWith('/node_modules'));

    ensureDependencies('/skill/assets/app', { spawnSyncImpl, existsSyncImpl });

    expect(spawnSyncImpl).toHaveBeenCalledWith('npm', ['install'], {
      cwd: '/skill/assets/app',
      stdio: 'inherit'
    });
  });

  it('skips dependency installation when node_modules already exists', () => {
    const spawnSyncImpl = vi.fn();
    const existsSyncImpl = vi.fn(() => true);

    ensureDependencies('/skill/assets/app', { spawnSyncImpl, existsSyncImpl });

    expect(spawnSyncImpl).not.toHaveBeenCalled();
  });

  it('recognizes a symlinked global command as the CLI entrypoint', () => {
    expect(isCliEntrypoint('file:///project/scripts/codex-viewer.mjs', '/Users/me/.local/bin/codex-viewer', {
      realpathSyncImpl: (value) => value === '/Users/me/.local/bin/codex-viewer'
        ? '/project/scripts/codex-viewer.mjs'
        : value
    })).toBe(true);
  });

  it('exposes a skill launcher script for skill-platform imports', async () => {
    const { access } = await import('node:fs/promises');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const launcherPath = resolve(dirname(fileURLToPath(import.meta.url)), 'codex-viewer');

    await expect(access(launcherPath)).resolves.toBeUndefined();
  });


  it('treats the health endpoint as the service readiness signal', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });

    await expect(isServiceReady(createLauncherConfig({ port: 4999 }), fetchImpl)).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:4999/api/health', { signal: expect.any(AbortSignal) });
  });


  it('opens the viewer with the macOS open command', () => {
    const unref = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue({ unref });

    openViewer(createLauncherConfig({ port: 4999 }), { spawnImpl, platform: 'darwin' });

    expect(spawnImpl).toHaveBeenCalledWith('open', ['http://127.0.0.1:4999/'], {
      detached: true,
      stdio: 'ignore'
    });
    expect(unref).toHaveBeenCalled();
  });


  it('stops the viewer process that listens on the configured port', () => {
    const spawnSyncImpl = vi.fn().mockReturnValue({ status: 0, stdout: '12345\n' });
    const killImpl = vi.fn();

    const result = stopService(createLauncherConfig({ port: 4999 }), { spawnSyncImpl, killImpl });

    expect(result).toEqual({ stopped: true, pids: [12345] });
    expect(spawnSyncImpl).toHaveBeenCalledWith('lsof', ['-tiTCP:4999', '-sTCP:LISTEN'], { encoding: 'utf8' });
    expect(killImpl).toHaveBeenCalledWith(12345, 'SIGTERM');
  });

  it('reports stop as a no-op when the viewer is not running', () => {
    const spawnSyncImpl = vi.fn().mockReturnValue({ status: 1, stdout: '' });
    const killImpl = vi.fn();

    const result = stopService(createLauncherConfig({ port: 4999 }), { spawnSyncImpl, killImpl });

    expect(result).toEqual({ stopped: false, pids: [] });
    expect(killImpl).not.toHaveBeenCalled();
  });

  it('waits until the service becomes healthy', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('not ready'))
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });

    await expect(waitForService(createLauncherConfig(), {
      fetchImpl,
      timeoutMs: 500,
      intervalMs: 1
    })).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
