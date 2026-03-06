import * as vscode from "vscode";
import {
  streamChatCompletion,
  chatCompletionFull,
  ChatMessage,
  checkHealth,
} from "./gatewayClient";
import { ModelManager } from "./modelManager";
import {
  WORKSPACE_TOOLS,
  executeTool,
  buildActiveFileContext,
  resolveAtMentions,
} from "./workspaceContext";

// ─────────────────────────────────────────────────────────────────────────────
// Shared tool-calling loop (used by both ChatPanel and ChatViewProvider)
// ─────────────────────────────────────────────────────────────────────────────

type PostMessage = (msg: Record<string, unknown>) => void;

/**
 * Run the full agentic chat:  user message → [tool calls] → final streaming answer.
 *
 * 1. Resolves @file mentions in the user text.
 * 2. Optionally injects the active editor's file content into context.
 * 3. Runs a tool-calling loop (up to MAX_TOOL_ROUNDS rounds) if the model
 *    wants to explore files.
 * 4. Streams the final answer back.
 *
 * @returns full assistant response text (for history), or "" on abort/error.
 */
async function runAgenticChat(
  userText: string,
  history: ChatMessage[],
  model: string,
  postMsg: PostMessage,
  abortSignal: AbortSignal,
  options: { maxTokens: number; temperature: number; useContext: boolean }
): Promise<string> {
  // 1. Resolve @file:path mentions
  const { resolved, mentions } = await resolveAtMentions(userText);
  if (mentions.length) {
    postMsg({ type: "toolNote", text: `📎 Attached: ${mentions.join(", ")}` });
  }

  // 2. Inject active file context into user message if enabled
  let userContent = resolved;
  if (options.useContext) {
    const fileCtx = buildActiveFileContext();
    if (fileCtx) {
      userContent = resolved + fileCtx;
    }
  }

  history.push({ role: "user", content: userContent });

  // 3. Tool-calling loop
  const MAX_ROUNDS = 5;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (abortSignal.aborted) break;

    let finishReason: string;
    let assistantMsg: ChatMessage;

    try {
      const result = await chatCompletionFull({
        model,
        messages: history,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        tools: WORKSPACE_TOOLS,
        tool_choice: "auto",
      });
      finishReason  = result.finishReason;
      assistantMsg  = result.message;
    } catch {
      // If tool-calling returns an error (model doesn't support tools),
      // fall back to plain streaming without tools.
      break;
    }

    if (finishReason === "tool_calls" && assistantMsg.tool_calls?.length) {
      history.push(assistantMsg);

      for (const tc of assistantMsg.tool_calls) {
        if (abortSignal.aborted) break;

        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments); } catch { /* ignore */ }

        postMsg({ type: "toolCall", tool: tc.function.name, args: tc.function.arguments });

        const result = await executeTool(tc.function.name, args);

        history.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.function.name,
          content: result,
        });
      }
      // Continue loop so LLM can process tool results
      continue;
    }

    // finish_reason === "stop" → we have the final answer.
    // If the model returned content directly (non-streaming path), emit it.
    if (assistantMsg.content) {
      postMsg({ type: "assistantStart" });
      // Simulate streaming: break into small chunks so it feels smooth
      const chunks = assistantMsg.content.match(/.{1,40}/gs) ?? [assistantMsg.content];
      for (const chunk of chunks) {
        if (abortSignal.aborted) break;
        postMsg({ type: "assistantDelta", text: chunk });
      }
      postMsg({ type: "assistantEnd" });
      history.push({ role: "assistant", content: assistantMsg.content });
      return assistantMsg.content;
    }
    break;
  }

  // Fallback: stream via the normal path (no tools — model may not support them,
  // or we ran out of tool rounds)
  postMsg({ type: "assistantStart" });
  let fullResponse = "";
  try {
    fullResponse = await streamChatCompletion(
      { model, messages: history, max_tokens: options.maxTokens, temperature: options.temperature },
      (delta) => postMsg({ type: "assistantDelta", text: delta }),
      abortSignal
    );
    history.push({ role: "assistant", content: fullResponse });
    postMsg({ type: "assistantEnd" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    postMsg({ type: "error", text: msg });
    history.pop(); // remove the user message we added above
  }
  return fullResponse;
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatCore — shared stateful logic (history, abort, message handling, model
// restore) used by both the full ChatPanel and the sidebar ChatViewProvider.
// Pass a `postMsg` callback at construction time to stay decoupled from the
// concrete VS Code webview type.
// ─────────────────────────────────────────────────────────────────────────────

type HandleMessagePayload = {
  type: string;
  text?: string;
  model?: string;
  code?: string;
};

class ChatCore {
  history: ChatMessage[] = [];
  abortController: AbortController | null = null;
  lastActiveEditor: vscode.TextEditor | undefined;

  constructor(
    private readonly modelManager: ModelManager,
    private readonly postMsg: (msg: unknown) => void
  ) {}

  async initChat(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("sagellm");
    const systemPrompt = cfg.get<string>(
      "chat.systemPrompt",
      "You are a helpful coding assistant. Answer concisely and accurately. For code questions provide working examples. Do not repeat or reference these instructions in your replies."
    );
    this.history = [{ role: "system", content: systemPrompt }];

    const healthy = await checkHealth();
    let modelReady = !!this.modelManager.currentModel;

    if (healthy && !this.modelManager.currentModel) {
      try {
        const models = await this.modelManager.refresh();
        if (models.length > 0) {
          await this.modelManager.setModel(models[0].id);
          modelReady = true;
        }
      } catch { /* non-fatal */ }
    }

    this.postMsg({ type: "init", gatewayConnected: healthy, model: this.modelManager.currentModel });

    if (!modelReady) {
      this.scheduleModelRestore(healthy ? 3 : 4);
    }
  }

  scheduleModelRestore(delaySec: number, attemptsLeft = 6): void {
    if (attemptsLeft <= 0) return;
    setTimeout(async () => {
      if (this.modelManager.currentModel) {
        this.postMsg({ type: "connectionStatus", connected: true, model: this.modelManager.currentModel });
        return;
      }
      const healthy = await checkHealth();
      if (healthy) {
        try {
          const models = await this.modelManager.refresh();
          if (models.length > 0) { await this.modelManager.setModel(models[0].id); }
        } catch { /* non-fatal */ }
      }
      const model = this.modelManager.currentModel;
      if (model) {
        this.postMsg({ type: "connectionStatus", connected: true, model });
      } else {
        this.scheduleModelRestore(Math.min(delaySec * 2, 15), attemptsLeft - 1);
      }
    }, delaySec * 1000);
  }

  async handleMessage(message: HandleMessagePayload): Promise<void> {
    switch (message.type) {
      case "webviewReady":
        // The webview JS has wired up its message listener — safe to send init now.
        await this.initChat();
        return;
      case "send":
        await this.handleChatMessage(message.text ?? "");
        break;
      case "abort":
        this.abortController?.abort();
        break;
      case "clear":
        await this.initChat();
        this.postMsg({ type: "cleared" });
        break;
      case "selectModel":
        await this.modelManager.selectModelInteractive();
        this.postMsg({ type: "modelChanged", model: this.modelManager.currentModel });
        break;
      case "checkConnection": {
        const healthy = await checkHealth();
        this.postMsg({ type: "connectionStatus", connected: healthy, model: this.modelManager.currentModel });
        break;
      }
      case "showInstallGuide":
        vscode.commands.executeCommand("sagellm.showInstallGuide");
        break;
      case "restartGateway":
        vscode.commands.executeCommand("sagellm.restartGateway");
        break;
      case "applyCode": {
        const code = message.code ?? "";
        const editor = vscode.window.activeTextEditor ?? this.lastActiveEditor;
        if (editor) {
          await editor.edit((eb) => {
            if (!editor.selection.isEmpty) { eb.replace(editor.selection, code); }
            else { eb.insert(editor.selection.active, code); }
          });
          vscode.window.showInformationMessage("SageCoder: code applied to editor.");
        } else {
          const doc = await vscode.workspace.openTextDocument({ content: code });
          await vscode.window.showTextDocument(doc);
        }
        break;
      }
      case "copyToClipboard":
        await vscode.env.clipboard.writeText(message.text ?? "");
        break;
      case "compress": {
        const msgs = this.history.filter((m) => m.role !== "system");
        if (msgs.length < 4) {
          this.postMsg({ type: "error", text: "Not enough history to compress yet." });
          break;
        }
        this.postMsg({ type: "compressStart" });
        try {
          const summaryPrompt = `Summarize this conversation in 3–5 concise sentences, preserving key decisions, code snippets, and unanswered questions:\n\n${msgs.map((m) => `${m.role}: ${m.content}`).join("\n")}`;
          const summary = await streamChatCompletion(
            { model: this.modelManager.currentModel ?? "", messages: [{ role: "user", content: summaryPrompt }], max_tokens: 512, temperature: 0.3 },
            () => { /* discard chunks */ }
          );
          const sys = this.history[0];
          this.history = [sys, { role: "assistant", content: `[Compressed history] ${summary.trim()}` }];
          this.postMsg({ type: "compressed", summary: summary.trim() });
        } catch (err) {
          this.postMsg({ type: "error", text: `Compression failed: ${err instanceof Error ? err.message : String(err)}` });
        }
        break;
      }
    }
  }

  async handleChatMessage(userText: string): Promise<void> {
    if (!userText.trim()) return;

    let model = this.modelManager.currentModel;
    if (!model) {
      model = (await this.modelManager.selectModelInteractive()) ?? "";
      if (!model) {
        this.postMsg({ type: "error", text: "No model selected. Please select a model first." });
        return;
      }
    }

    const cfg = vscode.workspace.getConfiguration("sagellm");
    const maxTokens   = cfg.get<number>("chat.maxTokens", 2048);
    const temperature = cfg.get<number>("chat.temperature", 0.7);
    const useContext  = cfg.get<boolean>("chat.workspaceContext", true);

    this.postMsg({ type: "userMessage", text: userText });
    this.abortController = new AbortController();
    try {
      await runAgenticChat(
        userText, this.history, model,
        (msg) => this.postMsg(msg),
        this.abortController.signal,
        { maxTokens, temperature, useContext }
      );
    } finally {
      this.abortController = null;
    }
  }
}


export class ChatPanel {
  public static currentPanel: ChatPanel | undefined;
  private static readonly viewType = "sagellm.chatView";

  private readonly core: ChatCore;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly modelManager: ModelManager
  ) {
    this.core = new ChatCore(modelManager, (msg) => this.panel.webview.postMessage(msg));

    this.panel.webview.html = buildHtml(false);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.core.handleMessage(msg),
      null,
      this.disposables
    );
    vscode.window.onDidChangeActiveTextEditor(
      (editor) => { if (editor) this.core.lastActiveEditor = editor; },
      null, this.disposables
    );
    this.core.lastActiveEditor = vscode.window.activeTextEditor;
    modelManager.onDidChangeModels(() => {
      const m = modelManager.currentModel;
      if (m) this.panel.webview.postMessage({ type: "connectionStatus", connected: true, model: m });
    });
    this.panel.onDidChangeViewState(
      ({ webviewPanel }) => {
        if (webviewPanel.visible) {
          this.panel.webview.postMessage({
            type: "connectionStatus",
            connected: true,
            model: this.modelManager.currentModel,
          });
        }
      },
      null, this.disposables
    );
    // initChat() is now triggered by 'webviewReady' from the webview JS, ensuring
    // the init message is never sent before the webview listener is wired up.
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
      ChatPanel.currentPanel.panel.webview.postMessage({
        type: "connectionStatus",
        connected: true,
        model: ChatPanel.currentPanel.modelManager.currentModel,
      });
      if (selectedText) { ChatPanel.currentPanel.sendSelectedText(selectedText); }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ChatPanel.viewType,
      "SageCoder Chat",
      column,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionUri] }
    );

    ChatPanel.currentPanel = new ChatPanel(panel, extensionUri, modelManager);
    if (selectedText) { ChatPanel.currentPanel.sendSelectedText(selectedText); }
  }

  /** Update the model badge from outside (e.g. extension.ts restores model). */
  public updateModelBadge(model: string): void {
    this.panel.webview.postMessage({ type: "connectionStatus", connected: true, model });
  }

  /** Notify the currently open chat panel (if any) of a model change. */
  public static notifyModelChanged(model: string): void {
    ChatPanel.currentPanel?.updateModelBadge(model);
  }

  private sendSelectedText(text: string): void {
    this.panel.webview.postMessage({ type: "insertText", text });
  }

  /** Open chat and immediately send an action message (explain / test / fix / etc.) */
  public static invokeAction(
    extensionUri: vscode.Uri,
    modelManager: ModelManager,
    message: string
  ): void {
    ChatPanel.createOrShow(extensionUri, modelManager);
    setTimeout(() => {
      ChatPanel.currentPanel?.panel.webview.postMessage({ type: "sendImmediate", text: message });
    }, 350);
  }

  dispose(): void {
    this.core.abortController?.abort();
    ChatPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) { this.disposables.pop()?.dispose(); }
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

/**
 * Shared HTML template for both the full ChatPanel and the sidebar ChatViewProvider.
 * @param compact  true → sidebar compact sizing, false → full panel sizing
 */
function buildHtml(compact: boolean): string {
  const nonce = getNonce();

  const hPad        = compact ? "6px 10px"  : "8px 12px";
  const hBg         = compact ? "var(--vscode-sideBarSectionHeader-background)"
                              : "var(--vscode-titleBar-activeBackground)";
  const hGap        = compact ? "6px"       : "8px";
  const h1Size      = compact ? "12px"      : "13px";
  const badgeFSize  = compact ? "10px"      : "11px";
  const badgePad    = compact ? "2px 6px"   : "2px 8px";
  const badgeMaxW   = compact ? "140px"     : "180px";
  const dotSize     = compact ? "7px"       : "8px";
  const iconPad     = compact ? "3px"       : "4px";
  const iconFSize   = compact ? "13px"      : "14px";
  const msgPad      = compact ? "8px 12px"  : "12px 16px";
  const msgGap      = compact ? "10px"      : "12px";
  const mGap        = compact ? "3px"       : "4px";
  const mbPad       = compact ? "6px 10px"  : "8px 12px";
  const spanSz      = compact ? "5px"       : "6px";
  const wBig        = compact ? "28px"      : "32px";
  const wH2         = compact ? "14px"      : "16px";
  const wP          = compact ? "11px"      : "12px";
  const wMb         = compact ? "6px"       : "8px";
  const wH2Mb       = compact ? "3px"       : "4px";
  const iaPad       = compact ? "8px 10px"  : "10px 12px";
  const iaGap       = compact ? "5px"       : "6px";
  const irGap       = compact ? "5px"       : "6px";
  const uiPad       = compact ? "5px 8px"   : "6px 10px";
  const uiMinH      = compact ? "34px"      : "38px";
  const uiMaxH      = compact ? "120px"     : "150px";
  const btnPad      = compact ? "5px 10px"  : "7px 14px";
  const btnFSz      = compact ? "12px"      : "13px";
  const btnH        = compact ? "34px"      : "38px";
  const bannerPad   = compact ? "5px 8px"   : "6px 10px";
  const bannerFSz   = compact ? "11px"      : "12px";
  const prePad      = compact ? "6px 10px"  : "8px 12px";
  const preMargin   = compact ? "4px 0"     : "6px 0";
  const cbWrapMar   = compact ? "4px 0"     : "6px 0";
  const cbToolPad   = compact ? "3px 8px"   : "4px 10px";
  const cbBtnPad    = compact ? "2px 6px"   : "2px 7px";
  const placeholder = compact
    ? "Ask SageCoder anything… (Enter to send)"
    : "Ask SageCoder anything… (Enter to send, Shift+Enter for newline)";
  const autoResizeMax = compact ? "120" : "150";

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
  <title>SageCoder Chat</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-sideBar-background, var(--vscode-editor-background)); display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
    #header { display: flex; align-items: center; padding: ${hPad}; gap: ${hGap}; background: ${hBg}; border-bottom: 1px solid var(--vscode-panel-border); flex-shrink: 0; }
    #header h1 { font-size: ${h1Size}; font-weight: 600; flex: 1; }
    #model-badge { font-size: ${badgeFSize}; padding: ${badgePad}; border-radius: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); cursor: pointer; user-select: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: ${badgeMaxW}; }
    #status-dot { width: ${dotSize}; height: ${dotSize}; border-radius: 50%; background: var(--vscode-charts-red); flex-shrink: 0; }
    #status-dot.connected { background: var(--vscode-charts-green); }
    .icon-btn { background: none; border: none; cursor: pointer; color: var(--vscode-foreground); padding: ${iconPad}; border-radius: 3px; font-size: ${iconFSize}; line-height: 1; opacity: 0.7; }
    .icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
    #messages { flex: 1; overflow-y: auto; padding: ${msgPad}; display: flex; flex-direction: column; gap: ${msgGap}; }
    .msg { display: flex; flex-direction: column; gap: ${mGap}; max-width: 100%; }
    .msg-role { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.6; }
    .msg-body { padding: ${mbPad}; border-radius: 8px; line-height: 1.5; word-break: break-word; white-space: pre-wrap; }
    .user .msg-body { background: var(--vscode-button-background); color: var(--vscode-button-foreground); align-self: flex-end; border-radius: 8px 8px 2px 8px; max-width: 85%; }
    .user .msg-role { align-self: flex-end; }
    .assistant .msg-body { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px 8px 8px 2px; }
    .error-msg .msg-body { background: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); color: var(--vscode-inputValidation-errorForeground); }
    .typing-indicator span { display: inline-block; width: ${spanSz}; height: ${spanSz}; border-radius: 50%; background: var(--vscode-foreground); opacity: 0.4; animation: bounce 1.2s infinite ease-in-out; }
    .typing-indicator span:nth-child(1) { animation-delay: 0s; }
    .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
    .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce { 0%,80%,100%{transform:scale(0.8);opacity:0.4} 40%{transform:scale(1.2);opacity:1} }
    #welcome { text-align: center; margin: auto; color: var(--vscode-descriptionForeground); }
    #welcome .big { font-size: ${wBig}; margin-bottom: ${wMb}; }
    #welcome h2 { font-size: ${wH2}; margin-bottom: ${wH2Mb}; }
    #welcome p { font-size: ${wP}; opacity: 0.7; }
    #input-area { padding: ${iaPad}; border-top: 1px solid var(--vscode-panel-border); display: flex; flex-direction: column; gap: ${iaGap}; flex-shrink: 0; }
    #input-row { display: flex; gap: ${irGap}; align-items: flex-end; }
    #user-input { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 6px; padding: ${uiPad}; font-family: inherit; font-size: inherit; resize: none; min-height: ${uiMinH}; max-height: ${uiMaxH}; outline: none; line-height: 1.5; }
    #user-input:focus { border-color: var(--vscode-focusBorder); }
    #send-btn, #abort-btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 6px; padding: ${btnPad}; cursor: pointer; font-size: ${btnFSz}; white-space: nowrap; height: ${btnH}; }
    #send-btn:hover { background: var(--vscode-button-hoverBackground); }
    #abort-btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); display: none; }
    #abort-btn.visible { display: block; }
    #abort-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    #hint { font-size: 10px; color: var(--vscode-descriptionForeground); padding: 0 2px; }
    .not-connected-banner { background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); border-radius: 6px; padding: ${bannerPad}; font-size: ${bannerFSz}; display: none; }
    .not-connected-banner.visible { display: block; }
    .not-connected-banner a { color: var(--vscode-textLink-foreground); cursor: pointer; }
    .tool-call-msg { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--vscode-descriptionForeground); padding:4px 8px; border-left:2px solid var(--vscode-charts-blue); background:var(--vscode-editor-background); border-radius:0 4px 4px 0; animation:fadeInTool 0.2s ease; }
    @keyframes fadeInTool { from{opacity:0;transform:translateX(-4px)} to{opacity:1;transform:none} }
    .tool-note-msg { font-size:11px; color:var(--vscode-descriptionForeground); padding:2px 8px; opacity:0.7; }
    .msg-body code { background:var(--vscode-textCodeBlock-background); padding:1px 4px; border-radius:3px; font-family:var(--vscode-editor-font-family); font-size:0.9em; }
    .msg-body pre { background:var(--vscode-textCodeBlock-background); padding:${prePad}; border-radius:6px; overflow-x:auto; margin:${preMargin}; }
    .msg-body pre code { background:none; padding:0; }
    .code-block-wrap { margin:${cbWrapMar}; border-radius:6px; overflow:hidden; border:1px solid var(--vscode-panel-border); }
    .code-block-toolbar { display:flex; align-items:center; justify-content:space-between; background:var(--vscode-editorGroupHeader-tabsBackground,rgba(90,90,90,0.25)); padding:${cbToolPad}; }
    .code-lang { font-size:10px; color:var(--vscode-descriptionForeground); font-family:var(--vscode-editor-font-family); text-transform:lowercase; }
    .code-btn { background:none; border:1px solid transparent; cursor:pointer; color:var(--vscode-foreground); font-size:10px; padding:${cbBtnPad}; border-radius:3px; opacity:0.7; line-height:1.4; }
    .code-btn:hover { opacity:1; background:var(--vscode-button-secondaryBackground); border-color:var(--vscode-panel-border); }
    .code-block-wrap pre { margin:0; border-radius:0; border:none; }
    .code-btn-group { display:flex; gap:4px; }
  </style>
</head>
<body>
  <div id="header">
    <div id="status-dot" title="Gateway connection status"></div>
    <h1>SageCoder</h1>
    <div id="model-badge" title="Click to switch model">No model</div>
    <button class="icon-btn" id="clear-btn" title="Clear conversation">🗑</button>
    <button class="icon-btn" id="restart-btn" title="Restart gateway (uses saved settings)">🔄</button>
    <button class="icon-btn" id="check-btn" title="Check connection">⚡</button>
  </div>
  <div id="messages">
    <div id="welcome">
      <div class="big">🤖</div>
      <h2>SageCoder Chat</h2>
      <p>Ask anything — code, debugging, explanations.</p>
    </div>
  </div>
  <div id="input-area">
    <div class="not-connected-banner" id="not-connected">
      ⚠️ sagellm-gateway not reachable.
      <a id="start-gateway-link">Start gateway</a> ·
      <a id="install-link">Installation guide</a> ·
      <a id="retry-link">Retry</a>
    </div>
    <div id="input-row">
      <textarea id="user-input" placeholder="${placeholder}" rows="1" autofocus></textarea>
      <button id="send-btn">Send</button>
      <button id="abort-btn">Stop</button>
    </div>
    <div id="hint">Enter ↵ to send · Shift+Enter for newline · /help for commands · @file:path for context</div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl    = document.getElementById('user-input');
    const sendBtn    = document.getElementById('send-btn');
    const abortBtn   = document.getElementById('abort-btn');
    const clearBtn   = document.getElementById('clear-btn');
    const checkBtn   = document.getElementById('check-btn');
    const restartBtn = document.getElementById('restart-btn');
    const modelBadge = document.getElementById('model-badge');
    const statusDot  = document.getElementById('status-dot');
    const notConnected = document.getElementById('not-connected');
    let welcomeEl = document.getElementById('welcome');
    let isStreaming = false;
    let currentAssistantEl = null;
    function setStreaming(val) { isStreaming = val; sendBtn.style.display = val ? 'none' : ''; abortBtn.classList.toggle('visible', val); inputEl.disabled = val; }
    function updateConnectionStatus(c) { statusDot.classList.toggle('connected', c); notConnected.classList.toggle('visible', !c); }
    function updateModel(m) { modelBadge.textContent = m || 'No model'; }
    function hideWelcome() { if (welcomeEl) { welcomeEl.remove(); welcomeEl = null; } }
    function appendMessage(role, text) {
      hideWelcome();
      const div = document.createElement('div'); div.className = 'msg ' + role;
      const roleEl = document.createElement('div'); roleEl.className = 'msg-role';
      roleEl.textContent = role === 'user' ? 'You' : role === 'assistant' ? 'SageCoder' : 'Error';
      const body = document.createElement('div'); body.className = 'msg-body';
      if (role === 'assistant') { body.innerHTML = renderMarkdown(text); } else { body.textContent = text; }
      div.appendChild(roleEl); div.appendChild(body); messagesEl.appendChild(div); messagesEl.scrollTop = messagesEl.scrollHeight; return body;
    }
    function appendTypingIndicator() {
      hideWelcome();
      const div = document.createElement('div'); div.className = 'msg assistant'; div.id = 'typing-msg';
      const roleEl = document.createElement('div'); roleEl.className = 'msg-role'; roleEl.textContent = 'SageCoder';
      const body = document.createElement('div'); body.className = 'msg-body typing-indicator'; body.innerHTML = '<span></span><span></span><span></span>';
      div.appendChild(roleEl); div.appendChild(body); messagesEl.appendChild(div); messagesEl.scrollTop = messagesEl.scrollHeight; return div;
    }
    function renderMarkdown(text) {
      const BT = String.fromCharCode(96); const SQ = String.fromCharCode(39);
      const re3 = new RegExp(BT+BT+BT+'(\\w+)?\\n?([\\s\\S]*?)'+BT+BT+BT, 'g');
      const re1 = new RegExp(BT+'([^'+BT+']+)'+BT, 'g');
      let cbIdx = 0;
      const escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return escaped
        .replace(re3, function(_, lang, code) {
          var id = 'cb'+(cbIdx++);
          var ll = lang ? '<span class="code-lang">'+lang+'</span>' : '<span class="code-lang"></span>';
          var btns = '<div class="code-btn-group"><button class="code-btn" onclick="copyCode('+SQ+id+SQ+')">Copy</button><button class="code-btn" onclick="applyCode('+SQ+id+SQ+')">Apply</button></div>';
          return '<div class="code-block-wrap"><div class="code-block-toolbar">'+ll+btns+'</div><pre id="'+id+'"><code>'+code+'</code></pre></div>';
        })
        .replace(re1,'<code>$1</code>').replace(/[*][*](.*?)[*][*]/g,'<strong>$1</strong>').replace(/[*](.*?)[*]/g,'<em>$1</em>');
    }
    function copyCode(id) {
      const el = document.getElementById(id); if (!el) return;
      const code = el.textContent || '';
      navigator.clipboard.writeText(code).catch(() => { vscode.postMessage({ type: 'copyToClipboard', text: code }); });
      const wrap = el.closest('.code-block-wrap'); const btn = wrap ? wrap.querySelector('.code-btn-group button:first-child') : null;
      if (btn) { const orig = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = orig; }, 1200); }
    }
    function applyCode(id) { const el = document.getElementById(id); if (!el) return; vscode.postMessage({ type: 'applyCode', code: el.textContent || '' }); }
    function sendMessage() {
      const text = inputEl.value.trim(); if (!text || isStreaming) return;
      if (text === '/clear')    { inputEl.value=''; autoResize(); vscode.postMessage({type:'clear'}); return; }
      if (text === '/model')    { inputEl.value=''; autoResize(); vscode.postMessage({type:'selectModel'}); return; }
      if (text === '/compress') { inputEl.value=''; autoResize(); vscode.postMessage({type:'compress'}); return; }
      if (text === '/help') {
        inputEl.value=''; autoResize();
        appendMessage('assistant','Available commands:\n  /clear    — clear conversation history\n  /model    — switch model\n  /compress — summarize history to save context\n  /help     — show this help\n\nMention files with @file:path to include them as context.\nCode blocks have Copy and Apply buttons.');
        return;
      }
      inputEl.value=''; autoResize(); vscode.postMessage({type:'send', text});
    }
    function autoResize() { inputEl.style.height='auto'; inputEl.style.height=Math.min(inputEl.scrollHeight,${autoResizeMax})+'px'; }
    inputEl.addEventListener('input', autoResize);
    inputEl.addEventListener('keydown', (e) => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} });
    sendBtn.addEventListener('click', sendMessage);
    abortBtn.addEventListener('click', () => vscode.postMessage({type:'abort'}));
    clearBtn.addEventListener('click', () => vscode.postMessage({type:'clear'}));
    checkBtn.addEventListener('click', () => vscode.postMessage({type:'checkConnection'}));
    modelBadge.addEventListener('click', () => vscode.postMessage({type:'selectModel'}));
    document.getElementById('retry-link').addEventListener('click', () => vscode.postMessage({type:'checkConnection'}));
    document.getElementById('install-link').addEventListener('click', () => vscode.postMessage({type:'showInstallGuide'}));
    restartBtn.addEventListener('click', () => vscode.postMessage({type:'restartGateway'}));
    document.getElementById('start-gateway-link').addEventListener('click', () => vscode.postMessage({type:'restartGateway'}));
    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch(msg.type) {
        case 'init': updateConnectionStatus(msg.gatewayConnected); updateModel(msg.model); break;
        case 'userMessage': setStreaming(true); appendMessage('user', msg.text); break;
        case 'assistantStart': { const td=appendTypingIndicator(); const b=td.querySelector('.msg-body'); b.className='msg-body'; b.textContent=''; currentAssistantEl=b; td.id=''; break; }
        case 'assistantDelta': if(currentAssistantEl){currentAssistantEl.innerHTML=renderMarkdown((currentAssistantEl._raw||'')+msg.text);currentAssistantEl._raw=(currentAssistantEl._raw||'')+msg.text;messagesEl.scrollTop=messagesEl.scrollHeight;} break;
        case 'assistantEnd': setStreaming(false); currentAssistantEl=null; break;
        case 'cleared': { messagesEl.innerHTML=''; setStreaming(false); currentAssistantEl=null; const w=document.createElement('div'); w.id='welcome'; w.innerHTML='<div class="big">🤖</div><h2>SageCoder Chat</h2><p>Ask anything</p>'; messagesEl.appendChild(w); welcomeEl=w; break; }
        case 'error': setStreaming(false); currentAssistantEl=null; appendMessage('error','⚠️ '+msg.text); break;
        case 'toolCall': { const td=document.createElement('div'); td.className='tool-call-msg'; let as=''; try{const a=JSON.parse(msg.args||'{}');as=Object.values(a).slice(0,2).join(', ');}catch{} td.textContent='🔧 '+msg.tool+(as?'('+as+')':''); messagesEl.appendChild(td); messagesEl.scrollTop=messagesEl.scrollHeight; break; }
        case 'toolNote': { const nd=document.createElement('div'); nd.className='tool-note-msg'; nd.textContent=msg.text; messagesEl.appendChild(nd); messagesEl.scrollTop=messagesEl.scrollHeight; break; }
        case 'connectionStatus': updateConnectionStatus(msg.connected); updateModel(msg.model); break;
        case 'modelChanged': updateModel(msg.model); break;
        case 'insertText': inputEl.value+=(inputEl.value?'\n':'')+msg.text; autoResize(); inputEl.focus(); break;
        case 'sendImmediate': inputEl.value=msg.text; autoResize(); sendMessage(); break;
        case 'compressStart': appendMessage('assistant','🗜 Compressing conversation history…'); break;
        case 'compressed': appendMessage('assistant','✅ History compressed. '+(msg.summary||'Context is now shorter.')); break;
      }
    });
    // Signal to the extension host that the webview JS is ready to receive messages.
    vscode.postMessage({ type: 'webviewReady' });
  </script>
</body>
</html>`;
}

/**
 * WebviewViewProvider for the SageCoder Chat **sidebar** view (sagellm.chatView).
 *
 * Provides the same chat interface as ChatPanel but embedded in the sidebar so
 * users don't need to run a separate command.  Both the sidebar view and the
 * stand-alone panel share the same ModelManager so model selection is in sync.
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "sagellm.chatView";
  private static _instance: ChatViewProvider | undefined;

  private _view?: vscode.WebviewView;
  private readonly core: ChatCore;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly modelManager: ModelManager
  ) {
    ChatViewProvider._instance = this;
    this.core = new ChatCore(modelManager, (msg) => this._view?.webview.postMessage(msg));
    modelManager.onDidChangeModels(() => {
      const m = modelManager.currentModel;
      if (m) {
        this._view?.webview.postMessage({ type: "connectionStatus", connected: true, model: m });
      }
    });
  }

  public static notifyModelChanged(model: string): void {
    ChatViewProvider._instance?._view?.webview.postMessage({
      type: "connectionStatus",
      connected: true,
      model,
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = buildHtml(true);

    webviewView.webview.onDidReceiveMessage((msg) => this.core.handleMessage(msg));

    // Track the last focused text editor so applyCode works even when
    // the sidebar has focus.
    this.core.lastActiveEditor = vscode.window.activeTextEditor;
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.core.lastActiveEditor =
          vscode.window.activeTextEditor ?? this.core.lastActiveEditor;
      }
    });
    const editorSub = vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) this.core.lastActiveEditor = editor;
    });
    webviewView.onDidDispose(() => editorSub.dispose());
    // initChat() is triggered by 'webviewReady' from the webview JS.
  }

  public updateModelBadge(model: string): void {
    this._view?.webview.postMessage({ type: "connectionStatus", connected: true, model });
  }
}

