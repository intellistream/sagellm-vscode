import * as vscode from "vscode";
import {
  streamChatCompletion,
  ChatMessage,
  checkHealth,
} from "./gatewayClient";
import { ModelManager } from "./modelManager";

export class ChatPanel {
  public static currentPanel: ChatPanel | undefined;
  private static readonly viewType = "sagellm.chatView";

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private history: ChatMessage[] = [];
  private abortController: AbortController | null = null;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly modelManager: ModelManager
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables
    );
    this.initChat();
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    modelManager: ModelManager,
    selectedText?: string
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    if (ChatPanel.currentPanel) {
      ChatPanel.currentPanel.panel.reveal(column);
      if (selectedText) {
        ChatPanel.currentPanel.sendSelectedText(selectedText);
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ChatPanel.viewType,
      "SageLLM Chat",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    ChatPanel.currentPanel = new ChatPanel(panel, extensionUri, modelManager);
    if (selectedText) {
      ChatPanel.currentPanel.sendSelectedText(selectedText);
    }
  }

  private async initChat(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("sagellm");
    const systemPrompt = cfg.get<string>(
      "chat.systemPrompt",
      "You are a helpful AI assistant integrated into VS Code."
    );
    this.history = [{ role: "system", content: systemPrompt }];

    const healthy = await checkHealth();
    this.panel.webview.postMessage({
      type: "init",
      gatewayConnected: healthy,
      model: this.modelManager.currentModel,
    });
  }

  private sendSelectedText(text: string): void {
    this.panel.webview.postMessage({ type: "insertText", text });
  }

  private async handleMessage(message: {
    type: string;
    text?: string;
    model?: string;
  }): Promise<void> {
    switch (message.type) {
      case "send":
        await this.handleChatMessage(message.text ?? "");
        break;
      case "abort":
        this.abortController?.abort();
        break;
      case "clear":
        await this.initChat();
        this.panel.webview.postMessage({ type: "cleared" });
        break;
      case "selectModel":
        await this.modelManager.selectModelInteractive();
        this.panel.webview.postMessage({
          type: "modelChanged",
          model: this.modelManager.currentModel,
        });
        break;
      case "checkConnection": {
        const healthy = await checkHealth();
        this.panel.webview.postMessage({
          type: "connectionStatus",
          connected: healthy,
          model: this.modelManager.currentModel,
        });
        break;
      }
    }
  }

  private async handleChatMessage(userText: string): Promise<void> {
    if (!userText.trim()) {
      return;
    }

    let model = this.modelManager.currentModel;
    if (!model) {
      model = (await this.modelManager.selectModelInteractive()) ?? "";
      if (!model) {
        this.panel.webview.postMessage({
          type: "error",
          text: "No model selected. Please select a model first.",
        });
        return;
      }
    }

    const cfg = vscode.workspace.getConfiguration("sagellm");
    const maxTokens = cfg.get<number>("chat.maxTokens", 2048);
    const temperature = cfg.get<number>("chat.temperature", 0.7);

    this.history.push({ role: "user", content: userText });
    this.panel.webview.postMessage({ type: "userMessage", text: userText });
    this.panel.webview.postMessage({ type: "assistantStart" });

    this.abortController = new AbortController();

    try {
      const fullResponse = await streamChatCompletion(
        { model, messages: this.history, max_tokens: maxTokens, temperature },
        (delta) => {
          this.panel.webview.postMessage({ type: "assistantDelta", text: delta });
        },
        this.abortController.signal
      );

      this.history.push({ role: "assistant", content: fullResponse });
      this.panel.webview.postMessage({ type: "assistantEnd" });
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "Unknown error occurred";
      this.panel.webview.postMessage({ type: "error", text: errMsg });
      // Remove the user message from history if send failed
      this.history.pop();
    } finally {
      this.abortController = null;
    }
  }

  private getHtml(): string {
    const nonce = getNonce();
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
  <title>SageLLM Chat</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* ── header ── */
    #header {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      gap: 8px;
      background: var(--vscode-titleBar-activeBackground);
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }
    #header h1 { font-size: 13px; font-weight: 600; flex: 1; }
    #model-badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 180px;
    }
    #status-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--vscode-charts-red);
      flex-shrink: 0;
    }
    #status-dot.connected { background: var(--vscode-charts-green); }
    .icon-btn {
      background: none; border: none; cursor: pointer;
      color: var(--vscode-foreground); padding: 4px; border-radius: 3px;
      font-size: 14px; line-height: 1; opacity: 0.7;
    }
    .icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }

    /* ── messages ── */
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .msg { display: flex; flex-direction: column; gap: 4px; max-width: 100%; }
    .msg-role {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.6;
    }
    .msg-body {
      padding: 8px 12px;
      border-radius: 8px;
      line-height: 1.5;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .user .msg-body {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      align-self: flex-end;
      border-radius: 8px 8px 2px 8px;
      max-width: 85%;
    }
    .user .msg-role { align-self: flex-end; }
    .assistant .msg-body {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px 8px 8px 2px;
    }
    .error-msg .msg-body {
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-inputValidation-errorForeground);
    }
    .typing-indicator span {
      display: inline-block; width: 6px; height: 6px; border-radius: 50%;
      background: var(--vscode-foreground); opacity: 0.4;
      animation: bounce 1.2s infinite ease-in-out;
    }
    .typing-indicator span:nth-child(1) { animation-delay: 0s; }
    .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
    .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
      40% { transform: scale(1.2); opacity: 1; }
    }
    #welcome {
      text-align: center; margin: auto;
      color: var(--vscode-descriptionForeground);
    }
    #welcome .big { font-size: 32px; margin-bottom: 8px; }
    #welcome h2 { font-size: 16px; margin-bottom: 4px; }
    #welcome p { font-size: 12px; opacity: 0.7; }

    /* ── input ── */
    #input-area {
      padding: 10px 12px;
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex-shrink: 0;
    }
    #input-row { display: flex; gap: 6px; align-items: flex-end; }
    #user-input {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 6px;
      padding: 6px 10px;
      font-family: inherit;
      font-size: inherit;
      resize: none;
      min-height: 38px;
      max-height: 150px;
      outline: none;
      line-height: 1.5;
    }
    #user-input:focus { border-color: var(--vscode-focusBorder); }
    #send-btn, #abort-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none; border-radius: 6px;
      padding: 7px 14px; cursor: pointer;
      font-size: 13px; white-space: nowrap;
      height: 38px;
    }
    #send-btn:hover { background: var(--vscode-button-hoverBackground); }
    #abort-btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); display: none; }
    #abort-btn.visible { display: block; }
    #abort-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    #hint { font-size: 10px; color: var(--vscode-descriptionForeground); padding: 0 2px; }
    .not-connected-banner {
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      display: none;
    }
    .not-connected-banner.visible { display: block; }
    .not-connected-banner a { color: var(--vscode-textLink-foreground); cursor: pointer; }

    /* code blocks inside assistant messages */
    .msg-body code {
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 4px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
    }
    .msg-body pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 8px 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 6px 0;
    }
    .msg-body pre code { background: none; padding: 0; }
  </style>
</head>
<body>
  <div id="header">
    <div id="status-dot" title="Gateway connection status"></div>
    <h1>SageLLM</h1>
    <div id="model-badge" title="Click to switch model">No model</div>
    <button class="icon-btn" id="clear-btn" title="Clear conversation">🗑</button>
    <button class="icon-btn" id="check-btn" title="Check connection">⚡</button>
  </div>

  <div id="messages">
    <div id="welcome">
      <div class="big">🤖</div>
      <h2>SageLLM Chat</h2>
      <p>Ask anything — code, debugging, explanations.</p>
    </div>
  </div>

  <div id="input-area">
    <div class="not-connected-banner" id="not-connected">
      ⚠️ sagellm-gateway not reachable.
      <a id="install-link">Installation guide</a> ·
      <a id="retry-link">Retry</a>
    </div>
    <div id="input-row">
      <textarea
        id="user-input"
        placeholder="Ask SageLLM anything… (Enter to send, Shift+Enter for newline)"
        rows="1"
        autofocus
      ></textarea>
      <button id="send-btn">Send</button>
      <button id="abort-btn">Stop</button>
    </div>
    <div id="hint">Enter ↵ to send · Shift+Enter for new line · /clear to reset</div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const abortBtn = document.getElementById('abort-btn');
    const clearBtn = document.getElementById('clear-btn');
    const checkBtn = document.getElementById('check-btn');
    const modelBadge = document.getElementById('model-badge');
    const statusDot = document.getElementById('status-dot');
    const notConnected = document.getElementById('not-connected');
    const welcomeEl = document.getElementById('welcome');

    let isStreaming = false;
    let currentAssistantEl = null;

    function setStreaming(val) {
      isStreaming = val;
      sendBtn.style.display = val ? 'none' : '';
      abortBtn.classList.toggle('visible', val);
      inputEl.disabled = val;
    }

    function updateConnectionStatus(connected) {
      statusDot.classList.toggle('connected', connected);
      notConnected.classList.toggle('visible', !connected);
    }

    function updateModel(model) {
      modelBadge.textContent = model || 'No model';
    }

    function hideWelcome() {
      if (welcomeEl) welcomeEl.remove();
    }

    function appendMessage(role, text) {
      hideWelcome();
      const div = document.createElement('div');
      div.className = 'msg ' + role;

      const roleEl = document.createElement('div');
      roleEl.className = 'msg-role';
      roleEl.textContent = role === 'user' ? 'You' : role === 'assistant' ? 'SageLLM' : 'Error';

      const body = document.createElement('div');
      body.className = 'msg-body';

      if (role === 'assistant') {
        body.innerHTML = renderMarkdown(text);
      } else {
        body.textContent = text;
      }

      div.appendChild(roleEl);
      div.appendChild(body);
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return body;
    }

    function appendTypingIndicator() {
      hideWelcome();
      const div = document.createElement('div');
      div.className = 'msg assistant';
      div.id = 'typing-msg';

      const roleEl = document.createElement('div');
      roleEl.className = 'msg-role';
      roleEl.textContent = 'SageLLM';

      const body = document.createElement('div');
      body.className = 'msg-body typing-indicator';
      body.innerHTML = '<span></span><span></span><span></span>';

      div.appendChild(roleEl);
      div.appendChild(body);
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    // Minimal markdown renderer
    function renderMarkdown(text) {
      // avoid backtick literals inside template literal — build regex at runtime
      const BT = String.fromCharCode(96);
      const re3 = new RegExp(BT+BT+BT+'([\\s\\S]*?)'+BT+BT+BT, 'g');
      const re1 = new RegExp(BT+'([^'+BT+']+)'+BT, 'g');
      return text
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(re3, '<pre><code>$1</code></pre>')
        .replace(re1, '<code>$1</code>')
        .replace(/[*][*](.*?)[*][*]/g, '<strong>$1</strong>')
        .replace(/[*](.*?)[*]/g, '<em>$1</em>');
    }

    function sendMessage() {
      const text = inputEl.value.trim();
      if (!text || isStreaming) return;
      if (text === '/clear') {
        inputEl.value = '';
        vscode.postMessage({ type: 'clear' });
        return;
      }
      inputEl.value = '';
      autoResize();
      vscode.postMessage({ type: 'send', text });
    }

    function autoResize() {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
    }

    inputEl.addEventListener('input', autoResize);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    sendBtn.addEventListener('click', sendMessage);
    abortBtn.addEventListener('click', () => vscode.postMessage({ type: 'abort' }));
    clearBtn.addEventListener('click', () => vscode.postMessage({ type: 'clear' }));
    checkBtn.addEventListener('click', () => vscode.postMessage({ type: 'checkConnection' }));
    modelBadge.addEventListener('click', () => vscode.postMessage({ type: 'selectModel' }));
    document.getElementById('retry-link').addEventListener('click', () => vscode.postMessage({ type: 'checkConnection' }));
    document.getElementById('install-link').addEventListener('click', () => vscode.postMessage({ type: 'showInstallGuide' }));

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'init':
          updateConnectionStatus(msg.gatewayConnected);
          updateModel(msg.model);
          break;

        case 'userMessage':
          setStreaming(true);
          appendMessage('user', msg.text);
          break;

        case 'assistantStart': {
          const typingDiv = appendTypingIndicator();
          const body = typingDiv.querySelector('.msg-body');
          body.className = 'msg-body';
          body.textContent = '';
          currentAssistantEl = body;
          typingDiv.id = '';
          break;
        }
        case 'assistantDelta':
          if (currentAssistantEl) {
            currentAssistantEl.innerHTML = renderMarkdown(
              (currentAssistantEl._raw || '') + msg.text
            );
            currentAssistantEl._raw = (currentAssistantEl._raw || '') + msg.text;
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
          break;

        case 'assistantEnd':
          setStreaming(false);
          currentAssistantEl = null;
          break;

        case 'cleared':
          messagesEl.innerHTML = '';
          setStreaming(false);
          currentAssistantEl = null;
          const w = document.createElement('div');
          w.id = 'welcome'; w.classList.add('');
          w.innerHTML = '<div class="big">🤖</div><h2>SageLLM Chat</h2><p>Ask anything</p>';
          messagesEl.appendChild(w);
          break;

        case 'error':
          setStreaming(false);
          currentAssistantEl = null;
          appendMessage('error', '⚠️ ' + msg.text);
          break;

        case 'connectionStatus':
          updateConnectionStatus(msg.connected);
          updateModel(msg.model);
          break;

        case 'modelChanged':
          updateModel(msg.model);
          break;

        case 'insertText':
          inputEl.value += (inputEl.value ? '\\n' : '') + msg.text;
          autoResize();
          inputEl.focus();
          break;
      }
    });
  </script>
</body>
</html>`;
  }

  dispose(): void {
    this.abortController?.abort();
    ChatPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
