import * as vscode from "vscode";
import {
  chatCompletion,
  rawTextCompletion,
  GatewayConnectionError,
} from "./gatewayClient";
import { ModelManager } from "./modelManager";

// ── FIM token sets per model family ──────────────────────────────────────────

interface FimTokens {
  prefix: string;
  suffix: string;
  middle: string;
  stopSequences: string[];
}

function getFimTokens(modelId: string): FimTokens {
  const m = modelId.toLowerCase();
  if (m.includes("qwen")) {
    return {
      prefix: "<|fim_prefix|>",
      suffix: "<|fim_suffix|>",
      middle: "<|fim_middle|>",
      stopSequences: ["<|endoftext|>", "<|fim_pad|>", "<|fim_suffix|>", "<|im_end|>"],
    };
  }
  if (m.includes("deepseek")) {
    return {
      prefix: "<｜fim▁begin｜>",
      suffix: "<｜fim▁hole｜>",
      middle: "<｜fim▁end｜>",
      stopSequences: ["<｜fim▁begin｜>", "<｜fim▁hole｜>", "<｜fim▁end｜>", "<|eos_token|>"],
    };
  }
  if (m.includes("codellama") || m.includes("mistral")) {
    return {
      prefix: "<PRE>",
      suffix: "<SUF>",
      middle: "<MID>",
      stopSequences: ["<EOT>"],
    };
  }
  if (m.includes("starcoder") || m.includes("starchat")) {
    return {
      prefix: "<fim_prefix>",
      suffix: "<fim_suffix>",
      middle: "<fim_middle>",
      stopSequences: ["<|endoftext|>", "<fim_prefix>"],
    };
  }
  // Generic fallback — works for most HuggingFace code models
  return {
    prefix: "<|fim_prefix|>",
    suffix: "<|fim_suffix|>",
    middle: "<|fim_middle|>",
    stopSequences: ["<|endoftext|>"],
  };
}

// ── Context helpers ───────────────────────────────────────────────────────────

/**
 * Collect a snippet from each other open text editor to give the model
 * cross-file context ("what other files look like in this project").
 */
function getTabContext(currentUri: vscode.Uri, maxChars: number): string {
  if (maxChars <= 0) return "";

  const openDocs = vscode.workspace.textDocuments
    .filter(
      (doc) =>
        doc.uri.toString() !== currentUri.toString() &&
        !doc.isUntitled &&
        doc.uri.scheme === "file" &&
        doc.getText().length > 10
    )
    .slice(0, 4); // cap at 4 extra files

  if (openDocs.length === 0) return "";

  const snippets: string[] = [];
  let remaining = maxChars;

  for (const doc of openDocs) {
    if (remaining <= 0) break;
    const rel = vscode.workspace.asRelativePath(doc.uri);
    const text = doc.getText().slice(0, Math.min(remaining, 1200));
    const snippet = `// [${rel}]\n${text}`;
    snippets.push(snippet);
    remaining -= snippet.length;
  }

  return `// ─── Related open files ───\n${snippets.join("\n\n")}\n// ─── Current file ───\n`;
}

// ── Smart trigger guard ───────────────────────────────────────────────────────

/**
 * Returns true when inline completion should NOT be triggered at this position.
 * Prevents noisy completions mid-word, in comments, or on trivially short lines.
 */
function shouldSkip(document: vscode.TextDocument, position: vscode.Position): boolean {
  const lineText = document.lineAt(position.line).text;
  const beforeCursor = lineText.slice(0, position.character);
  const trimmed = beforeCursor.trimStart();

  // Empty or too-short line (< 3 non-whitespace chars)
  if (trimmed.length < 3) return true;

  // Mid-word: letter/digit/underscore immediately after cursor
  const charAfter = lineText[position.character];
  if (charAfter !== undefined && /[\w]/.test(charAfter)) return true;

  // Line is a single-line comment
  if (/^\s*(\/\/|#|--|\/\*)/.test(lineText)) return true;

  // Inside a string (heuristic: odd number of unescaped quotes before cursor)
  const singleQuotes = (beforeCursor.match(/(?<!\\)'/g) ?? []).length;
  const doubleQuotes = (beforeCursor.match(/(?<!\\)"/g) ?? []).length;
  if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) return true;

  return false;
}

// ── Completion cleanup ────────────────────────────────────────────────────────

function cleanCompletion(raw: string, fim: FimTokens): string {
  let text = raw;

  // Truncate at any FIM/special tokens that leaked through
  for (const stop of fim.stopSequences) {
    const idx = text.indexOf(stop);
    if (idx !== -1) text = text.slice(0, idx);
  }
  for (const token of [fim.prefix, fim.suffix, fim.middle]) {
    const idx = text.indexOf(token);
    if (idx !== -1) text = text.slice(0, idx);
  }

  // Drop trailing blank lines
  const lines = text.split("\n");
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  return lines.join("\n");
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class SageLLMInlineCompletionProvider
  implements vscode.InlineCompletionItemProvider
{
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** null = untested, true = available, false = not available */
  private nativeCompletionsAvailable: boolean | null = null;

  constructor(private readonly modelManager: ModelManager) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionList | null> {
    const cfg = vscode.workspace.getConfiguration("sagellm");
    if (!cfg.get<boolean>("inlineCompletion.enabled", true)) return null;

    const model = this.modelManager.currentModel;
    if (!model) return null;

    if (shouldSkip(document, position)) return null;

    // ── Build context ──────────────────────────────────────────────────────
    const docText = document.getText();
    const offset = document.offsetAt(position);

    const contextLines = cfg.get<number>("inlineCompletion.contextLines", 80);
    const prefixLineStart = Math.max(0, position.line - contextLines);
    const prefixOffset = document.offsetAt(new vscode.Position(prefixLineStart, 0));
    const prefix = docText.slice(prefixOffset, offset);
    const suffix = docText.slice(offset, Math.min(offset + 400, docText.length));

    const tabCtxChars = cfg.get<number>("inlineCompletion.tabContextChars", 2000);
    const useTabCtx = cfg.get<boolean>("inlineCompletion.useTabContext", true);
    const tabContext = useTabCtx ? getTabContext(document.uri, tabCtxChars) : "";
    const fullPrefix = tabContext + prefix;

    // ── Debounce ───────────────────────────────────────────────────────────
    const delay = cfg.get<number>("inlineCompletion.triggerDelay", 350);
    await new Promise<void>((resolve) => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(resolve, delay);
    });
    if (token.isCancellationRequested) return null;

    const fim = getFimTokens(model);
    const maxTokens = cfg.get<number>("inlineCompletion.maxTokens", 150);
    const temperature = cfg.get<number>("inlineCompletion.temperature", 0.05);

    let rawCompletion = "";

    try {
      // ── Try native /v1/completions (preferred) ─────────────────────────
      if (this.nativeCompletionsAvailable !== false) {
        try {
          rawCompletion = await rawTextCompletion({
            model,
            prompt: `${fim.prefix}${fullPrefix}${fim.suffix}${suffix}${fim.middle}`,
            max_tokens: maxTokens,
            temperature,
            stop: [...fim.stopSequences, "\n\n\n"],
          });
          this.nativeCompletionsAvailable = true;
        } catch (err) {
          if (err instanceof GatewayConnectionError && err.statusCode === 404) {
            // Gateway doesn't support /v1/completions — fall through to chat
            this.nativeCompletionsAvailable = false;
          } else {
            throw err;
          }
        }
      }

      // ── Fallback: chat completions with FIM format in message ──────────
      if (this.nativeCompletionsAvailable === false) {
        rawCompletion = await chatCompletion({
          model,
          messages: [
            {
              role: "user",
              content:
                `Complete the following ${document.languageId} code. ` +
                `Output ONLY the completion text — no explanation, no markdown fences.\n\n` +
                `${fim.prefix}${fullPrefix}${fim.suffix}${suffix}${fim.middle}`,
            },
          ],
          max_tokens: maxTokens,
          temperature,
        });
      }

      if (token.isCancellationRequested) return null;

      const completion = cleanCompletion(rawCompletion, fim);
      if (!completion.trim()) return null;

      return new vscode.InlineCompletionList([
        new vscode.InlineCompletionItem(
          completion,
          new vscode.Range(position, position)
        ),
      ]);
    } catch (err) {
      if (err instanceof GatewayConnectionError) return null; // silent fail
      return null;
    }
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }
}
