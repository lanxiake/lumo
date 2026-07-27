<!-- 语言 / Language: English | [简体中文](./README.zh-CN.md) -->

# Lumo

An open-source AI **virtual companion for kids** — a friendly on-screen character
who chats, teaches, and plays. Lumo helps children explore **no-code programming,
music, data, languages, games, and drawing** through natural conversation.

- **Bring your own model** — configure any OpenAI- or Anthropic-compatible
  provider in the app. Your API key stays **on the device** and talks directly to
  your provider. No Lumo backend, no relay server, no account.
- **Runs standalone** — the AI agent runs on-device inside an embedded Node.js
  runtime (`nodejs-mobile`). No login, no registration, no cloud dependency.
- **Voice built in** — on-device speech recognition (sherpa-onnx) and online
  text-to-speech.
- **Android & iOS** — built with React Native.

> Lumo grew out of an internal project and was rebuilt as a focused,
> self-contained learning companion. The "pet" character is just the face — the
> heart is a capable tutor and playmate.

## How it works

```
┌─────────────────────────────┐
│  React Native app (UI)      │
│  ├─ Live2D character         │
│  ├─ Voice (ASR on-device)    │
│  └─ Settings: model provider │
└──────────────┬──────────────┘
               │  RN ⇄ Node bridge
┌──────────────┴──────────────┐
│  Embedded Node.js runtime    │
│  └─ AI agent  ──────────────►│  your OpenAI / Anthropic endpoint
└─────────────────────────────┘
```

The app ships an AI agent that runs **inside the device**. When you set a model
provider in Settings, the agent streams directly to that endpoint using your key.
Nothing routes through a Lumo server.

## Monorepo layout

| Path                     | What it is                                             |
| ------------------------ | ------------------------------------------------------ |
| `app/`                   | React Native app (Android + iOS)                       |
| `app/node-runtime/`      | On-device Node.js agent host + RN bridge               |
| `packages/core/`         | Character rendering, state machine, emotion/lip-sync   |
| `packages/agent-runtime/`| Agent loop, tools, compaction, model streaming         |
| `packages/protocol/`     | Shared message/schema contracts                        |

## Getting started

Requires Node.js >= 18 and [pnpm](https://pnpm.io) 9.

```bash
pnpm install

# Download on-device speech recognition models
pnpm setup:sherpa

# Run
pnpm android    # Android
pnpm ios        # iOS (macOS + Xcode required)
```

Then open **Settings → 模型提供商** in the app and enter your provider (protocol,
base URL, API key, model). Start chatting.

### Optional: web search

Lumo can use a self-hosted [SearXNG](https://docs.searxng.org/) for `web_search` /
`web_fetch`. Set `SEARXNG_BASE_URL` (see `.env.example`). Leave it unset to
disable web search.

## Development

```bash
pnpm typecheck   # type-check all packages
pnpm test        # run unit tests
```

## Privacy

Lumo is designed for children. It does **not** collect data and has no backend.
Conversation content never leaves the device except in the direct call to the
model provider you configure. See per-package notes for details.

## License

[MIT](./LICENSE)
