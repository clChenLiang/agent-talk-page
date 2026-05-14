# Slash command compatibility

This skill does not rely on a discovered native Codex slash-command registry. Instead, it makes slash-style invocations part of the skill trigger contract:

- `/codex-viewer` -> run `scripts/codex-viewer`
- `/codex-viewer stop` -> run `scripts/codex-viewer stop`
- `/viewer` -> run `scripts/codex-viewer`

If a future Codex installation exposes a native slash-command registry, register those commands to call the same bundled launcher.
