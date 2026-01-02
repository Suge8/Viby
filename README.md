# HAPI

HAPI means "哈皮," a Chinese transliteration of [Happy](https://github.com/slopus/happy). Great credit to the original project.

Run Claude Code / Codex / Gemini sessions locally and control them remotely through a Web / PWA / Telegram Mini App.

> **Why HAPI?** HAPI is a local-first alternative to Happy. See [Why Not Happy?](docs/WHY_NOT_HAPPY.md) for the key differences.

## Features

- Start AI coding sessions from any machine.
- Monitor and control sessions from your phone or browser.
- Approve or deny tool permissions remotely.
- Browse files and view git diffs.
- Track session progress with todo lists.
- Supports multiple AI backends: Claude Code, Codex, and Gemini.

## Getting Started

```bash
npm install -g @twsxtd/hapi
hapi server
```

Open `http://localhost:3006` and log in with the token.

More options: [Quick Start](docs/guide/quick-start.md) | [Installation](docs/guide/installation.md)

## Docs

- [Quick Start](docs/guide/quick-start.md)
- [Installation](docs/guide/installation.md)
- [PWA](docs/guide/pwa.md)
- [How it Works](docs/guide/how-it-works.md)
- [Why HAPI](docs/guide/why-hapi.md)
- [FAQ](docs/guide/faq.md)

## Requirements

- Claude CLI installed and logged in (`claude` on PATH) for Claude Code sessions.
- Bun if building from source.

## Build from source

```bash
bun install
bun run build:single-exe
```
