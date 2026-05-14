---
name: codex-conversation-viewer
description: Use when the user asks to open, start, stop, package, or use the separated Codex conversation viewer, including slash-style requests like /codex-viewer, /viewer, 打开对话查看器, 启动 codex viewer, stop codex-viewer, or restore/resume a viewed Codex thread.
---

# Codex Conversation Viewer

## Purpose

Open a local separated conversation viewer for Codex threads. It shows the user's questions as a compact stream and agent replies in a separate reading pane.

## Entrypoints

- **Agent slash-style request**: when the user says `/codex-viewer`, `/viewer`, `打开对话查看器`, or similar, run the bundled launcher script.
- **Stop request**: when the user says `/codex-viewer stop`, `codex-viewer stop`, or asks to stop the service, run the bundled launcher with `stop`.
- **Shell command**: the same launcher can be symlinked as `codex-viewer` on PATH.

## How to run

From this skill directory, prefer:

```sh
scripts/codex-viewer
```

To stop:

```sh
scripts/codex-viewer stop
```

The launcher starts the local production server if needed, opens the page with the OS browser opener, and reuses the running service if it is already healthy.

## Defaults

- URL: `http://127.0.0.1:4174/`
- Health check: `http://127.0.0.1:4174/api/health`
- Log file: `~/.codex-viewer.log`
- Environment overrides: `CODEX_VIEWER_HOST`, `CODEX_VIEWER_PORT`

## Notes for agents

- Treat `/codex-viewer` as a skill-level slash command: execute `scripts/codex-viewer` and report the resulting URL/status.
- Treat `/codex-viewer stop` as `scripts/codex-viewer stop`.
- If the user asks for a terminal command, provide `codex-viewer` and `codex-viewer stop`.
- If `codex-viewer` is not on PATH, run the bundled script by absolute path or create/update a symlink in `~/.local/bin`.
- Do not duplicate the app source into another workspace unless the user asks to modify the product.

## Repository layout

This repository is itself the skill package root for skill-platform import:

- `SKILL.md` - required skill instructions and trigger metadata.
- `agents/openai.yaml` - UI metadata for Codex skill listings.
- `scripts/codex-viewer` - skill launcher used by agents.
- `scripts/codex-viewer.mjs` - Node launcher for the local service.
- `src/`, `package.json`, `vite.config.ts` - bundled viewer app source.
- `dist/` - generated app build; recreated automatically if absent.

## Skill-platform import

Install from this GitHub repo with path `.` and skill name `codex-conversation-viewer` if the platform asks for a path inside the repo. The repository root contains `SKILL.md`, so no nested `skills/` directory is required.
