# SageLLM for VS Code

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/intellistream.sagellm-vscode)](https://marketplace.visualstudio.com/items?itemName=intellistream.sagellm-vscode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Bring [SageLLM](https://github.com/intellistream/sagellm) inference power directly into VS Code — chat panel, inline code completion, and model management, all powered by your local or remote `sagellm-gateway`.

## Features

- **Chat Panel** — Conversational AI in a VS Code sidebar or split view
- **Inline Code Completion** — Ghost-text completions as you type, powered by SageLLM
- **Model Management** — Browse and switch between loaded models from the sidebar
- **One-Click Gateway** — Start/stop `sagellm-gateway` directly from VS Code
- **Status Bar** — Live connection status and active model at a glance
- **OpenAI-compatible** — Works with any endpoint that speaks the OpenAI chat API

## Quick Start

### 1. Install SageLLM

```bash
pip install isagellm
```

### 2. Start the gateway

```bash
sagellm gateway start --port 8000
```

### 3. Connect the extension

Click **SageLLM: Check Connection** in the Command Palette (`Ctrl+Shift+P`) or click the status bar item.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `sagellm.gateway.host` | `localhost` | Gateway hostname |
| `sagellm.gateway.port` | `8000` | Gateway port |
| `sagellm.gateway.apiKey` | `` | Bearer token (if auth enabled) |
| `sagellm.gateway.tls` | `false` | Use HTTPS |
| `sagellm.model` | `` | Default model ID |
| `sagellm.autoStartGateway` | `false` | Launch gateway on VS Code start |
| `sagellm.gatewayStartCommand` | `sagellm gateway start` | Command to start gateway |
| `sagellm.inlineCompletion.enabled` | `true` | Enable inline completions |
| `sagellm.inlineCompletion.triggerDelay` | `400` | Debounce delay (ms) |
| `sagellm.chat.systemPrompt` | _(coding assistant)_ | System prompt for chat |
| `sagellm.chat.maxTokens` | `2048` | Max tokens per response |
| `sagellm.chat.temperature` | `0.7` | Sampling temperature |

## Commands

| Command | Description |
|---------|-------------|
| `SageLLM: Open Chat` | Open the chat panel |
| `SageLLM: Select Model` | Choose from available models |
| `SageLLM: Refresh Models` | Reload model list from gateway |
| `SageLLM: Start Gateway` | Launch sagellm-gateway in a terminal |
| `SageLLM: Stop Gateway` | Stop gateway process |
| `SageLLM: Check Connection` | Test connectivity and show status |
| `SageLLM: Installation Guide` | Show setup instructions |

## Architecture

```
VS Code Extension (TypeScript)
    ↕ HTTP (streaming SSE)
sagellm-gateway  (/v1/chat/completions, /v1/models)
    ↕
sagellm-control-plane → sagellm-core → Hardware
```

## Development

```bash
git clone https://github.com/intellistream/sagellm-vscode
cd sagellm-vscode
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

### Publish

```bash
npm install -g @vscode/vsce
vsce package        # build .vsix
vsce publish        # publish to Marketplace (requires PAT)
```

## License

MIT — see [LICENSE](LICENSE)
