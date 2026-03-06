import * as vscode from "vscode";
import * as cp from "child_process";
import { ModelManager, ModelsTreeProvider } from "./modelManager";
import { ChatPanel, ChatViewProvider } from "./chatPanel";
import { SageCoderInlineCompletionProvider } from "./inlineCompletion";
import { StatusBarManager } from "./statusBar";
import { checkHealth, GatewayConnectionError } from "./gatewayClient";
import {
  promptAndStartServer,
  MODEL_CATALOG,
  isModelDownloadInProgress,
} from "./serverLauncher";
import { DEFAULT_GATEWAY_PORT } from "./sagePorts";
import {
  checkPackagesIfDue,
  runFullDiagnostics,
  showDiagnosticsPanel,
} from "./diagnostics";
import { diffContentProvider } from "./diffEditor";

let activeGatewayTerminal: vscode.Terminal | null = null;
let statusBar: StatusBarManager | null = null;
let healthCheckInterval: ReturnType<typeof setInterval> | null = null;

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  // ── Core managers ──────────────────────────────────────────────────────────
  const modelManager = new ModelManager(context);
  statusBar = new StatusBarManager();
  context.subscriptions.push(statusBar);

  // ── Diff content provider (sagellm-diff:// virtual docs for diff view) ────
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      "sagellm-diff",
      diffContentProvider
    )
  );

  // ── Sidebar chat view (sagellm.chatView) ─────────────────────────────────
  const chatViewProvider = new ChatViewProvider(context.extensionUri, modelManager);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatViewProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // ── Tree view: Models sidebar ──────────────────────────────────────────────
  const modelsProvider = new ModelsTreeProvider(modelManager);
  const treeView = vscode.window.createTreeView("sagellm.modelsView", {
    treeDataProvider: modelsProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView);

  // ── Inline completion ──────────────────────────────────────────────────────
  const inlineProvider = new SageCoderInlineCompletionProvider(modelManager);
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: "**" }, // all files
      inlineProvider
    )
  );

  // ── Register commands ──────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("sagellm.openChat", () => {
      const editor = vscode.window.activeTextEditor;
      const selectedText = editor?.document.getText(editor.selection) ?? "";
      ChatPanel.createOrShow(
        context.extensionUri,
        modelManager,
        selectedText || undefined
      );
    }),

    vscode.commands.registerCommand("sagellm.selectModel", async () => {
      await modelManager.selectModelInteractive();
      statusBar?.setModel(modelManager.currentModel);
      modelsProvider.refresh();
    }),

    vscode.commands.registerCommand("sagellm.refreshModels", async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "SageCoder: Fetching models…", cancellable: false },
        async () => {
          try {
            await modelManager.refresh();
            modelsProvider.refresh();
            vscode.window.showInformationMessage(
              `SageCoder: ${modelManager.getModels().length} model(s) loaded`
            );
          } catch (err) {
            vscode.window.showErrorMessage(
              `SageCoder: ${err instanceof GatewayConnectionError ? err.message : String(err)}`
            );
          }
        }
      );
    }),

    vscode.commands.registerCommand("sagellm.startGateway", () =>
      promptAndStartServer(context, statusBar)
    ),

    vscode.commands.registerCommand("sagellm.configureServer", () =>
      promptAndStartServer(context, statusBar)
    ),

    vscode.commands.registerCommand("sagellm.stopGateway", () =>
      stopGateway(statusBar!)
    ),

    vscode.commands.registerCommand("sagellm.restartGateway", async () => {
      // Close any existing SageCoder terminals to avoid duplicates
      for (const term of vscode.window.terminals) {
        if (term.name.startsWith("SageCoder")) {
          term.dispose();
        }
      }
      // Kill any process holding the gateway port to prevent "Address already in use"
      const cfg = vscode.workspace.getConfiguration("sagellm");
      const port = cfg.get<number>("gateway.port", DEFAULT_GATEWAY_PORT);
      try {
        cp.execSync(`fuser -k ${port}/tcp 2>/dev/null; true`, { stdio: "ignore" });
      } catch {
        try {
          cp.execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null; true`, { stdio: "ignore" });
        } catch { /* ignore */ }
      }
      // Give OS a moment to release the port
      await new Promise<void>((resolve) => setTimeout(resolve, 1500));

      const preloadModel = cfg.get<string>("preloadModel", "").trim();
      const backend = cfg.get<string>("backend", "").trim();
      if (preloadModel && backend) {
        startGateway(statusBar);
      } else {
        promptAndStartServer(context, statusBar);
      }
    }),

    vscode.commands.registerCommand("sagellm.showInstallGuide", () => {
      showInstallGuide(context.extensionUri);
    }),

    // ── Code action commands (right-click menu) ──────────────────────────
    vscode.commands.registerCommand("sagellm.explainCode", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selection = editor.document.getText(editor.selection);
      if (!selection.trim()) {
        vscode.window.showWarningMessage("SageCoder: Select some code first.");
        return;
      }
      const lang = editor.document.languageId;
      const rel = vscode.workspace.asRelativePath(editor.document.uri);
      ChatPanel.invokeAction(
        context.extensionUri,
        modelManager,
        `Explain this ${lang} code from \`${rel}\`:\n\n\`\`\`${lang}\n${selection}\n\`\`\``
      );
    }),

    vscode.commands.registerCommand("sagellm.generateTests", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selection = editor.document.getText(editor.selection);
      if (!selection.trim()) {
        vscode.window.showWarningMessage("SageCoder: Select a function or class first.");
        return;
      }
      const lang = editor.document.languageId;
      ChatPanel.invokeAction(
        context.extensionUri,
        modelManager,
        `Write comprehensive unit tests for this ${lang} code. Cover edge cases.\n\n\`\`\`${lang}\n${selection}\n\`\`\``
      );
    }),

    vscode.commands.registerCommand("sagellm.fixCode", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selection = editor.document.getText(editor.selection);
      if (!selection.trim()) {
        vscode.window.showWarningMessage("SageCoder: Select the code to fix.");
        return;
      }
      const lang = editor.document.languageId;
      ChatPanel.invokeAction(
        context.extensionUri,
        modelManager,
        `Find bugs and fix this ${lang} code. Show the corrected version with a brief explanation of each fix.\n\n\`\`\`${lang}\n${selection}\n\`\`\``
      );
    }),

    vscode.commands.registerCommand("sagellm.generateDocstring", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selection = editor.document.getText(editor.selection);
      if (!selection.trim()) {
        vscode.window.showWarningMessage("SageCoder: Select a function or class.");
        return;
      }
      const lang = editor.document.languageId;
      ChatPanel.invokeAction(
        context.extensionUri,
        modelManager,
        `Write a docstring/JSDoc comment for this ${lang} code. Follow the language's standard documentation style.\n\n\`\`\`${lang}\n${selection}\n\`\`\``
      );
    }),

    vscode.commands.registerCommand("sagellm.runDiagnostics", async () => {
      let result;
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "SageCoder: 正在检测环境…",
          cancellable: false,
        },
        async () => {
          const modelIds = MODEL_CATALOG.map((m) => m.id);
          result = await runFullDiagnostics(modelIds);
        }
      );
      if (result) await showDiagnosticsPanel(result);
    }),

    vscode.commands.registerCommand("sagellm.checkConnection", async () => {
      statusBar?.setConnecting();
      const healthy = await checkHealth();
      statusBar?.setGatewayStatus(healthy);
      if (healthy) {
        await modelManager.refresh().catch(() => {});
        modelsProvider.refresh();
        statusBar?.setModel(modelManager.currentModel);
        vscode.window.showInformationMessage(
          "SageCoder: Gateway connected ✓"
        );
      } else {
        const cfg = vscode.workspace.getConfiguration("sagellm");
        const host = cfg.get("gateway.host", "localhost");
        const port = cfg.get("gateway.port", DEFAULT_GATEWAY_PORT);
        const choice = await vscode.window.showWarningMessage(
          `SageCoder: Cannot reach gateway at ${host}:${port}`,
          "Start Gateway",
          "Installation Guide",
          "Open Settings"
        );
        if (choice === "Start Gateway") {
          vscode.commands.executeCommand("sagellm.startGateway");
        } else if (choice === "Installation Guide") {
          vscode.commands.executeCommand("sagellm.showInstallGuide");
        } else if (choice === "Open Settings") {
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "@ext:intellistream.sagellm-vscode"
          );
        }
      }
    })
  );

  // ── Auto-start gateway if configured ──────────────────────────────────────
  const cfg = vscode.workspace.getConfiguration("sagellm");
  if (cfg.get<boolean>("autoStartGateway", true)) {
    const savedModel = cfg.get<string>("preloadModel", "").trim();
    const savedBackend = cfg.get<string>("backend", "").trim();
    if (savedModel && savedBackend) {
      // Check if gateway is already up before starting another instance
      checkHealth().then((alreadyRunning) => {
        if (!alreadyRunning) {
          startGateway(statusBar);
        }
      });
    } else {
      // Not yet configured: only show picker if gateway is NOT already running
      checkHealth().then((alreadyRunning) => {
        if (!alreadyRunning) {
          setTimeout(() => promptAndStartServer(context, statusBar), 1500);
        }
        // If already running, the initial connection check (below) handles model restore
      });
    }
  }

  // ── Background health check every 30s ─────────────────────────────────────
  healthCheckInterval = setInterval(async () => {
    const healthy = await checkHealth();
    statusBar?.setGatewayStatus(healthy);
    if (healthy && modelManager.currentModel) {
      statusBar?.setModel(modelManager.currentModel);
    }
  }, 30_000);
  context.subscriptions.push({
    dispose: () => {
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
      }
    },
  });

  // ── Initial connection check ───────────────────────────────────────────────
  async function tryConnectAndRestoreModel(showWarning: boolean): Promise<boolean> {
    const healthy = await checkHealth();
    statusBar?.setGatewayStatus(healthy);
    if (healthy) {
      let modelLoaded = false;
      try {
        const models = await modelManager.refresh();
        modelsProvider.refresh();
        // Always pick a model from gateway — don't rely on persisted state
        if (models.length > 0) {
          const toSelect = modelManager.currentModel || models[0].id;
          const valid = models.find(m => m.id === toSelect);
          await modelManager.setModel(valid ? valid.id : models[0].id);
          modelLoaded = true;
        }
        statusBar?.setModel(modelManager.currentModel);
        // Notify any open chat panel so its model badge updates immediately
        if (modelManager.currentModel) {
          ChatPanel.notifyModelChanged(modelManager.currentModel);
          ChatViewProvider.notifyModelChanged(modelManager.currentModel);
        }
        // Gateway reconnected — reset FIM endpoint availability cache so the
        // inline provider re-probes /v1/completions on the next keystroke.
        if (modelLoaded) { inlineProvider.resetCache(); }
      } catch {
        // gateway healthy but model fetch failed — non-fatal
      }
      // Return false when gateway is up but model list empty (still loading)
      // so the caller retries later.
      return modelLoaded;
    } else {
      if (showWarning && !isModelDownloadInProgress()) {
        const choice = await vscode.window.showWarningMessage(
          "SageCoder: Gateway not reachable. Configure and start now?",
          "Configure Server",
          "Dismiss"
        );
        if (choice === "Configure Server") {
          vscode.commands.executeCommand("sagellm.configureServer");
        }
      }
      return false;
    }
  }

  // Try at 2s; if not ready (gateway down or model not yet loaded), keep
  // retrying with increasing delays until a model is available or we give up.
  let retryAttempt = 0;
  const maxRetries = 10; // up to ~5 min total
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  context.subscriptions.push({ dispose: () => { if (retryTimer) clearTimeout(retryTimer); } });
  async function scheduleRetryConnect(): Promise<void> {
    retryAttempt++;
    if (retryAttempt > maxRetries) return;
    const delay = Math.min(2000 * retryAttempt, 30_000); // 2s, 4s, 6s … 30s
    retryTimer = setTimeout(async () => {
      const showWarning = retryAttempt >= 3;
      const ok = await tryConnectAndRestoreModel(showWarning);
      if (!ok) {
        scheduleRetryConnect();
      }
    }, delay);
  }
  scheduleRetryConnect();

  // ── Background package version check (throttled to once per day) ──────────
  // 90s delay so it doesn't run during the critical startup path
  setTimeout(() => checkPackagesIfDue(context), 90_000);
}

export function deactivate(): void {
  stopGateway(statusBar);
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
}

// ── Gateway lifecycle ─────────────────────────────────────────────────────────

function startGateway(sb: StatusBarManager | null): void {
  const cfg = vscode.workspace.getConfiguration("sagellm");
  const baseCmd = cfg.get<string>("gatewayStartCommand", "sagellm serve");
  const port = cfg.get<number>("gateway.port", DEFAULT_GATEWAY_PORT);
  const preloadModel = cfg.get<string>("preloadModel", "").trim();
  const backend = cfg.get<string>("backend", "").trim();

  if (activeGatewayTerminal) {
    vscode.window.showInformationMessage("SageCoder: Gateway is already running");
    return;
  }

  // Build full command
  let cmd = baseCmd;
  if (backend) cmd += ` --backend ${backend}`;
  if (preloadModel) cmd += ` --model ${preloadModel}`;
  cmd += ` --port ${port}`;

  const terminal = vscode.window.createTerminal({
    name: "SageCoder Gateway",
    isTransient: false,
    // Disable preflight canary — it loads the model twice before the engine starts,
    // causing OOM on low-memory machines and extending startup by 2–10 minutes.
    // The extension's own health-poll + startup canary (SAGELLM_STARTUP_CANARY)
    // still verifies model output quality after the engine is healthy.
    env: { SAGELLM_PREFLIGHT_CANARY: "0" },
  });
  activeGatewayTerminal = terminal;
  terminal.sendText(cmd);
  terminal.show(false);

  sb?.setConnecting();
  vscode.window.showInformationMessage(
    `SageCoder: Starting gateway with "${cmd}"…`
  );

  // Poll until healthy (up to 5 min — model loading + engine startup can be slow)
  let attempts = 0;
  const maxAttempts = 100; // 100 × 3s = 5 minutes
  const poll = setInterval(async () => {
    attempts++;
    const healthy = await checkHealth();
    if (healthy) {
      clearInterval(poll);
      sb?.setGatewayStatus(true);
      vscode.window.showInformationMessage("SageCoder: Gateway is ready ✓");
    } else if (attempts >= maxAttempts) {
      clearInterval(poll);
      sb?.setError("Gateway start timed out");
      vscode.window
        .showWarningMessage(
          "SageCoder: Gateway 5 分钟内未响应，请检查终端输出。",
          "运行诊断",
          "查看终端"
        )
        .then((choice) => {
          if (choice === "运行诊断") {
            vscode.commands.executeCommand("sagellm.runDiagnostics");
          }
        });
    } else if (attempts % 20 === 0) {
      // Show elapsed time every minute so user knows it's still loading
      const elapsed = Math.round(attempts * 3 / 60);
      sb?.setConnecting();
      vscode.window.setStatusBarMessage(`SageCoder: Loading model… (${elapsed} min elapsed)`, 5000);
    }
  }, 3000);
}

function stopGateway(sb: StatusBarManager | null): void {
  if (activeGatewayTerminal) {
    activeGatewayTerminal.dispose();
    activeGatewayTerminal = null;
  }
  sb?.setGatewayStatus(false);
}

// ── Install guide ─────────────────────────────────────────────────────────────

function showInstallGuide(_extensionUri: vscode.Uri): void {
  const panel = vscode.window.createWebviewPanel(
    "sagellm.installGuide",
    "SageCoder: Installation Guide",
    vscode.ViewColumn.One,
    { enableScripts: false }
  );
  panel.webview.html = getInstallGuideHtml();
}

function getInstallGuideHtml(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SageCoder Installation Guide</title>
  <style>
    body {
      font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
      color: var(--vscode-foreground); background: var(--vscode-editor-background);
      max-width: 720px; margin: 0 auto; padding: 32px 24px; line-height: 1.6;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    h2 { font-size: 16px; margin: 24px 0 8px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
    code, pre {
      font-family: var(--vscode-editor-font-family);
      background: var(--vscode-textCodeBlock-background);
      border-radius: 4px;
    }
    code { padding: 2px 6px; font-size: 0.9em; }
    pre { padding: 12px 16px; overflow-x: auto; margin: 8px 0; }
    pre code { background: none; padding: 0; }
    .step {
      display: flex; gap: 12px; margin-bottom: 16px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px; padding: 14px 16px;
    }
    .step-num {
      width: 28px; height: 28px; border-radius: 50%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      display: flex; align-items: center; justify-content: center;
      font-weight: bold; flex-shrink: 0; font-size: 13px;
    }
    .note {
      background: var(--vscode-inputValidation-infoBackground);
      border: 1px solid var(--vscode-inputValidation-infoBorder);
      border-radius: 6px; padding: 10px 14px; margin: 12px 0;
      font-size: 12px;
    }
    a { color: var(--vscode-textLink-foreground); }
  </style>
</head>
<body>
  <h1>🚀 SageCoder Setup Guide</h1>
  <p>Follow these steps to install SageCoder and connect this extension to it.</p>

  <h2>Prerequisites</h2>
  <div class="step">
    <div class="step-num">1</div>
    <div>
      <strong>Python 3.10+</strong> and a conda/virtualenv environment.<br/>
      <code>python --version</code>
    </div>
  </div>

  <h2>Install SageCoder</h2>
  <div class="step">
    <div class="step-num">2</div>
    <div>
      Install the SageCoder meta-package from PyPI:<br/>
      <pre><code>pip install isagellm</code></pre>
      Or install from source:<br/>
      <pre><code>git clone https://github.com/intellistream/sagellm
cd sagellm
pip install -e .[dev]</code></pre>
    </div>
  </div>

  <h2>Start the Server</h2>
  <div class="step">
    <div class="step-num">3</div>
    <div>
      Start the full inference stack (gateway + engine, OpenAI-compatible API):
      <pre><code>sagellm serve</code></pre>
      With a specific model and backend:
      <pre><code>sagellm serve --backend cpu --model Qwen/Qwen2.5-1.5B-Instruct</code></pre>
      On GPU (CUDA):
      <pre><code>sagellm serve --backend cuda --model Qwen/Qwen2.5-7B-Instruct</code></pre>
      <div class="note">💡 Tip: Add <code>SAGELLM_PREFLIGHT_CANARY=0</code> to skip the pre-validation step for faster first startup.</div>
    </div>
  </div>

  <h2>Configure the Extension</h2>
  <div class="step">
    <div class="step-num">4</div>
    <div>
      Open VS Code Settings (<code>Ctrl+,</code>) and search for <strong>SageCoder</strong>:
      <ul style="margin: 8px 0 0 16px;">
        <li><code>sagellm.gateway.host</code> — default: <code>localhost</code></li>
        <li><code>sagellm.gateway.port</code> — default: <code>8901</code> (<code>sagellm serve</code> default)</li>
        <li><code>sagellm.gateway.apiKey</code> — if your gateway requires auth</li>
      </ul>
    </div>
  </div>

  <div class="step">
    <div class="step-num">5</div>
    <div>
      Click the <strong>⚡ SageCoder</strong> item in the status bar, or run the command<br/>
      <strong>SageCoder: Check Connection</strong> to verify everything is working.
    </div>
  </div>

  <div class="note">
    ℹ️ The extension auto-starts <code>sagellm serve</code> when you enable
    <code>sagellm.autoStartGateway</code> in settings. Model loading may take
    several minutes — the extension polls for up to 5 minutes.
  </div>

  <h2>Resources</h2>
  <ul>
    <li><a href="https://github.com/intellistream/sagellm">SageCoder GitHub</a></li>
    <li><a href="https://github.com/intellistream/sagellm-vscode/issues">Report an issue</a></li>
  </ul>
</body>
</html>`;
}
