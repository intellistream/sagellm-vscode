import * as vscode from "vscode";
import { chatCompletion, GatewayConnectionError } from "./gatewayClient";
import { ModelManager } from "./modelManager";

export class SageLLMInlineCompletionProvider
  implements vscode.InlineCompletionItemProvider
{
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly modelManager: ModelManager) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionList | null> {
    const cfg = vscode.workspace.getConfiguration("sagellm");
    if (!cfg.get<boolean>("inlineCompletion.enabled", true)) {
      return null;
    }

    const model = this.modelManager.currentModel;
    if (!model) {
      return null;
    }

    // Build prefix (up to 2000 chars) and suffix (up to 500 chars)
    const docText = document.getText();
    const offset = document.offsetAt(position);
    const prefix = docText.slice(Math.max(0, offset - 2000), offset);
    const suffix = docText.slice(offset, Math.min(docText.length, offset + 500));
    const languageId = document.languageId;

    // Debounce: wait for typing to stop
    const delay = cfg.get<number>("inlineCompletion.triggerDelay", 400);
    await new Promise<void>((resolve) => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(resolve, delay);
    });

    if (token.isCancellationRequested) {
      return null;
    }

    const prompt = `<fim_prefix>${prefix}<fim_suffix>${suffix}<fim_middle>`;

    try {
      const completion = await chatCompletion({
        model,
        messages: [
          {
            role: "system",
            content: `You are a code completion engine. Complete the code in ${languageId}. Output ONLY the completion text, no explanation, no markdown fences.`,
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 200,
        temperature: 0.1,
      });

      if (token.isCancellationRequested || !completion.trim()) {
        return null;
      }

      return new vscode.InlineCompletionList([
        new vscode.InlineCompletionItem(
          completion,
          new vscode.Range(position, position)
        ),
      ]);
    } catch (err) {
      if (err instanceof GatewayConnectionError) {
        // Silent fail for inline completion — don't spam error messages
        return null;
      }
      return null;
    }
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }
}
