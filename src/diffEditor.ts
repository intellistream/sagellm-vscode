/**
 * diffEditor.ts
 *
 * Shows a native VS Code diff editor ("before vs after") before applying AI-
 * generated code, so the user can review and Accept or Discard each change.
 *
 * Flow:
 *  1. `applyWithDiff(code, editor)` is called from ChatCore.
 *  2. We compute what the file would look like after applying the code
 *     (respecting any active selection or cursor position).
 *  3. A virtual document (sagellm-diff:// scheme) is registered to serve the
 *     proposed content without writing to disk.
 *  4. The native `vscode.diff` command opens side-by-side view.
 *  5. An info notification with "Apply" / "Discard" buttons lets the user
 *     finalise or reject the change.
 */

import * as vscode from "vscode";
import * as path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Virtual document content provider
// ─────────────────────────────────────────────────────────────────────────────

const SCHEME = "sagellm-diff";

/** In-memory store: uri.path → proposed file text */
const proposedContents = new Map<string, string>();

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  private _emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._emitter.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return proposedContents.get(uri.path) ?? "";
  }

  /** Store proposed content and fire change event so VS Code refreshes. */
  store(key: string, content: string): vscode.Uri {
    proposedContents.set(key, content);
    const uri = vscode.Uri.parse(`${SCHEME}:${key}`);
    this._emitter.fire(uri);
    return uri;
  }

  /** Clean up after the diff is closed. */
  delete(key: string): void {
    proposedContents.delete(key);
  }
}

// Singleton — registered once in extension activate()
export const diffContentProvider = new DiffContentProvider();

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

let _pendingSeq = 0;

/**
 * Show a diff preview of `proposedCode` applied to the given editor, then ask
 * the user to Apply or Discard.
 *
 * @param proposedCode  The complete code snippet to apply.
 * @param editor        Active / last-active text editor (can be undefined —
 *                      in that case we open a new untitled document).
 */
export async function applyWithDiff(
  proposedCode: string,
  editor: vscode.TextEditor | undefined
): Promise<void> {
  if (!editor) {
    // No open file — just show the code in a new untitled document.
    const doc = await vscode.workspace.openTextDocument({
      content: proposedCode,
      language: "plaintext",
    });
    await vscode.window.showTextDocument(doc);
    return;
  }

  const doc = editor.document;
  const originalText = doc.getText();
  const sel = editor.selection;

  // Build the full proposed file content ─────────────────────────────────────
  let proposedFileText: string;
  let editRange: vscode.Range;

  if (!sel.isEmpty) {
    // Replace the current selection with the proposed code
    editRange = sel;
    const before = originalText.slice(0, doc.offsetAt(sel.start));
    const after = originalText.slice(doc.offsetAt(sel.end));
    proposedFileText = before + proposedCode + after;
  } else {
    // Insert at cursor position
    const offset = doc.offsetAt(sel.active);
    const before = originalText.slice(0, offset);
    const after = originalText.slice(offset);
    editRange = new vscode.Range(sel.active, sel.active);
    proposedFileText = before + proposedCode + after;
  }

  // Store proposed content under a unique key ────────────────────────────────
  const seq = ++_pendingSeq;
  const basename = path.basename(doc.fileName);
  const key = `/proposed-${seq}/${basename}`;
  const proposedUri = diffContentProvider.store(key, proposedFileText);

  // Open the diff view ───────────────────────────────────────────────────────
  const title = `SageCoder: ${basename} (review changes)`;
  await vscode.commands.executeCommand(
    "vscode.diff",
    doc.uri,
    proposedUri,
    title,
    { viewColumn: vscode.ViewColumn.Active, preview: true }
  );

  // Ask the user ─────────────────────────────────────────────────────────────
  const choice = await vscode.window.showInformationMessage(
    `Apply AI-generated changes to ${basename}?`,
    { modal: false },
    "Apply ✅",
    "Discard ❌"
  );

  // Close the diff tab ───────────────────────────────────────────────────────
  // (best-effort: close the active tab if it's still the diff we opened)
  await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");

  if (choice === "Apply ✅") {
    // Apply via WorkspaceEdit (undoable, respects dirty state, etc.) ─────────
    const we = new vscode.WorkspaceEdit();
    we.replace(doc.uri, editRange, proposedCode);
    const ok = await vscode.workspace.applyEdit(we);
    if (ok) {
      vscode.window.showInformationMessage(`SageCoder: changes applied to ${basename}.`);
    } else {
      vscode.window.showErrorMessage(`SageCoder: failed to apply changes to ${basename}.`);
    }
  }

  // Clean up virtual doc ─────────────────────────────────────────────────────
  diffContentProvider.delete(key);
}
