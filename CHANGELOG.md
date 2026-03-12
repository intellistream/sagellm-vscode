# Changelog

## [Unreleased]

### Added
- `.gitignore` 现在默认忽略本地 `.env` / `.env.local` / `.env.*` 配置文件，同时保留 `.env.example` / `.env.template` 模板文件可提交，避免扩展开发时误提交本地凭证。
- **Code block toolbar** — every code block in chat now has a toolbar with **Copy** and **Apply** buttons. Copy writes the code to the clipboard; Apply inserts it at the cursor in the active editor (or replaces the selection), or opens a new untitled document if no editor is active.
- **`write_file` tool** — the AI can now propose writing/creating files. A modal approval dialog is shown before any write, with a note on whether the file already exists. The written file is automatically opened in the editor.
- **`run_command` tool** — the AI can propose running shell commands. A modal approval dialog shows the command and working directory before execution. Output is returned to the model.
- **Slash commands**: `/model` (switch model), `/compress` (summarize conversation history to save context), `/help` (show available commands). `/clear` was already supported.
- **`/compress` context compression** — sends the current conversation to the model for summarization and replaces the history with the compressed summary, freeing up context window space for long sessions. Visual feedback shown in chat.
- **Updated hint bar** — now shows `/help for commands` instead of `/clear to reset`.

### Added (previous)
- **Rename: SageLLM → SageCoder** — display name, activity bar title, status bar, chat panel, all command titles, and extension description updated to "SageCoder". Internal `sagellm.*` config keys and command IDs are unchanged.
- **Extension description** updated to reflect code-generation-assistant positioning (inline completions, chat, explain/fix/test/docstring). Added `"Programming Languages"` VS Code category and `sagecoder`/`code generation`/`copilot` keywords.
- **Default system prompt** updated: model now introduces itself as "SageCoder, an expert AI coding assistant".

### Fixed
- **Download path unification**: Model downloads from the extension now write to the workstation `models_dir` (`~/Downloads/sagellm-models/<ModelName>`) instead of `~/.cache/huggingface/hub`. This aligns the extension's download destination with `sagellm-workstation`, so downloaded models are immediately found by the workstation local-path scanner with no duplication.
- **`setModel()` missing `await`**: `vscode.workspace.getConfiguration().update()` was called without `await`, meaning the setting could be lost if VS Code shut down before the promise resolved.
- **Retry timer leak on deactivate**: `scheduleRetryConnect()` created `setTimeout` timers that were never cancelled when the extension was deactivated. Added `retryTimer` tracking and a dispose subscription to clear it on shutdown.
- **Dead `gatewayProcess` variable**: `startGateway()` used a VS Code terminal, so `gatewayProcess: cp.ChildProcess` was never assigned — making `stopGateway()` a no-op. Replaced with `activeGatewayTerminal: vscode.Terminal` which is correctly assigned and disposed.
- **Inline completion skips template literals**: `shouldSkip()` ignored backtick-quoted template literal strings when counting unbalanced quotes, causing completions to be incorrectly suppressed inside TypeScript/JavaScript template literals.
- **`nativeCompletionsAvailable` not reset after gateway restart**: If the gateway reconnected (e.g. after a restart that added `/v1/completions` support), the inline provider kept the stale `false` value and never re-probed. `resetCache()` is now called on every successful gateway reconnect.

### Performance
- **Memoize `candidatePythons()`**: The function previously scanned the entire `~/miniforge3/envs/` directory on every call; called twice per download attempt. Now cached for the lifetime of the extension host.
- **Memoize `workstationModelDirs()`**: Previously re-read `config.ini` and iterated workspace folders on every call (invoked by `isModelDownloaded`, `localWorkstationModelPath`, `discoverWorkstationLocalModels`). Now cached and automatically invalidated via `onDidChangeWorkspaceFolders`.

### Fixed (model selection)
- **Model selection bypasses download step**: When a user selected a model from the "Available to download" list, the extension immediately offered to restart the gateway (which triggered `sagellm serve` and inline model pull with no progress UI). The flow now first asks to download via `huggingface-cli` (with VS Code progress notification, speed, and ETA), and only offers to restart the gateway after the download completes.

## [0.1.12] — 2026-03-05

### Fixed
- **Model load failure / startup timeout**: Increased health-poll timeout from 60 s to 5 minutes (100 × 3 s) in both `startGateway` and `promptAndStartServer`. Model loading (especially with preflight canary + engine startup) routinely exceeds 60 s on CPU.
- **Double model loading → OOM**: The `sagellm serve` preflight canary (`SAGELLM_PREFLIGHT_CANARY`) loaded the model via `transformers` before the engine server also loaded it, doubling peak memory usage and startup time. The extension now sets `SAGELLM_PREFLIGHT_CANARY=0` in the terminal environment. The engine's own post-startup canary (`SAGELLM_STARTUP_CANARY`) still validates output quality.
- **Install guide wrong command and port**: Step 3 showed `sagellm gateway start --port 8000`; corrected to `sagellm serve --port 8901` (matching `SagePorts.SAGELLM_SERVE_PORT` and the extension's default). Port reference in step 4 updated from `8000` to `8901`.
- **Loading progress feedback**: Status bar now shows elapsed minutes every 60 s while polling so users know a long model load is still in progress.

## [0.1.0] — 2026-03-04

### Added
- Initial release
- Chat panel with streaming responses (SSE)
- Inline code completion provider
- Model manager sidebar tree view
- Status bar with live gateway connection status
- Commands: openChat, selectModel, refreshModels, startGateway, stopGateway, checkConnection, showInstallGuide
- Configuration: host, port, apiKey, tls, model, autoStartGateway, inlineCompletion, chat settings
- Installation guide webview
- OpenAI-compatible gateway client (`/v1/chat/completions`, `/v1/models`)
