/**
 * workspaceContext.ts
 *
 * Workspace-aware tools that the LLM can call to explore and read project code.
 * Mirrors the core tool-calling capabilities that coding assistants like Copilot use:
 *   - get_active_file   : get the currently open editor file
 *   - read_file         : read any file (optionally a line range)
 *   - list_directory    : list files/folders in a path
 *   - search_code       : grep-style ripgrep/text search across workspace
 *   - get_workspace_info: workspace root + quick file tree summary
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

// ─────────────────────────────────────────────────────────────────────────────
// Tool definitions (OpenAI function calling format)
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required?: string[];
    };
  };
}

export const WORKSPACE_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_active_file",
      description:
        "Get the content of the file currently open in the editor, along with the cursor position and any selected text.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read the contents of a file in the workspace. You can optionally specify a line range. The path can be absolute or relative to the workspace root.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to workspace root or absolute" },
          start_line: { type: "number", description: "First line to read (1-based, inclusive). Optional." },
          end_line: { type: "number", description: "Last line to read (1-based, inclusive). Optional." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description:
        "List the files and subdirectories in a directory. Returns names; trailing '/' indicates a directory.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path relative to workspace root (empty string or '.' for root).",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_code",
      description:
        "Search for a text pattern (regex supported) across workspace files. Returns matching lines with file paths and line numbers. Like grep.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Text or regex pattern to search for." },
          include_pattern: {
            type: "string",
            description: "Glob pattern to restrict which files are searched, e.g. '**/*.py'. Optional.",
          },
          max_results: {
            type: "number",
            description: "Maximum number of results to return (default 30).",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_workspace_info",
      description:
        "Get workspace metadata: root path, top-level directory listing, and currently open files.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tool execution
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolCallArgs {
  [key: string]: unknown;
}

/** Execute a tool call and return its text result. Never throws — returns error string on failure. */
export async function executeTool(name: string, args: ToolCallArgs): Promise<string> {
  try {
    switch (name) {
      case "get_active_file":  return await toolGetActiveFile();
      case "read_file":        return await toolReadFile(args);
      case "list_directory":   return await toolListDirectory(args);
      case "search_code":      return await toolSearchCode(args);
      case "get_workspace_info": return await toolGetWorkspaceInfo();
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Error executing tool ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── get_active_file ──────────────────────────────────────────────────────────

async function toolGetActiveFile(): Promise<string> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return "No file is currently open in the editor.";
  }
  const doc = editor.document;
  const filePath = doc.fileName;
  const wsRoot = getWorkspaceRoot();
  const relPath = wsRoot ? path.relative(wsRoot, filePath) : filePath;

  const selection = editor.selection;
  const selectedText = !selection.isEmpty ? doc.getText(selection) : null;
  const cursorLine = selection.active.line + 1;

  const content = doc.getText();
  const lines = content.split("\n");
  const MAX = 400; // cap at 400 lines to keep context manageable
  const truncated = lines.length > MAX;
  const displayLines = truncated ? lines.slice(0, MAX) : lines;

  let result = `File: ${relPath}\nLanguage: ${doc.languageId}\nTotal lines: ${lines.length}\nCursor at line: ${cursorLine}\n`;
  if (selectedText) {
    result += `\nSelected text (lines ${selection.start.line + 1}–${selection.end.line + 1}):\n\`\`\`\n${selectedText}\n\`\`\`\n`;
  }
  result += `\nContent${truncated ? ` (first ${MAX} lines)` : ""}:\n\`\`\`${doc.languageId}\n${displayLines.join("\n")}`;
  if (truncated) {
    result += `\n... (${lines.length - MAX} more lines — use read_file with start_line/end_line to see more)\n`;
  }
  result += "\n```";
  return result;
}

// ── read_file ────────────────────────────────────────────────────────────────

async function toolReadFile(args: ToolCallArgs): Promise<string> {
  const filePath = String(args["path"] ?? "");
  const startLine = args["start_line"] != null ? Number(args["start_line"]) : null;
  const endLine   = args["end_line"]   != null ? Number(args["end_line"])   : null;

  if (!filePath) return "Error: 'path' is required.";

  const absPath = resolveWorkspacePath(filePath);
  if (!absPath) return `Error: workspace root not found, cannot resolve '${filePath}'.`;
  if (!fs.existsSync(absPath)) return `Error: file not found: ${filePath}`;

  const stat = fs.statSync(absPath);
  if (stat.isDirectory()) return `Error: '${filePath}' is a directory. Use list_directory instead.`;

  // Guard against reading gigantic files
  const MAX_BYTES = 200_000;
  if (stat.size > MAX_BYTES) {
    if (startLine == null) {
      return `File is large (${Math.round(stat.size / 1024)} KB). Please specify start_line and end_line to read a portion.`;
    }
  }

  const raw = fs.readFileSync(absPath, "utf8");
  const lines = raw.split("\n");

  const sl = startLine != null ? Math.max(1, startLine) : 1;
  const el = endLine   != null ? Math.min(lines.length, endLine) : lines.length;

  const slice = lines.slice(sl - 1, el);
  const ext = path.extname(absPath).slice(1) || "text";
  const lineInfo = (sl !== 1 || el !== lines.length) ? ` (lines ${sl}–${el} of ${lines.length})` : ` (${lines.length} lines)`;

  return `File: ${filePath}${lineInfo}\n\`\`\`${ext}\n${slice.join("\n")}\n\`\`\``;
}

// ── list_directory ───────────────────────────────────────────────────────────

async function toolListDirectory(args: ToolCallArgs): Promise<string> {
  const dirPath = String(args["path"] ?? ".");
  const absPath = resolveWorkspacePath(dirPath || ".");
  if (!absPath) return "Error: no workspace folder open.";
  if (!fs.existsSync(absPath)) return `Error: directory not found: ${dirPath}`;

  const stat = fs.statSync(absPath);
  if (!stat.isDirectory()) return `Error: '${dirPath}' is a file, not a directory.`;

  const entries = fs.readdirSync(absPath, { withFileTypes: true });

  // Filter out noise
  const IGNORE = new Set([".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", ".pytest_cache", ".mypy_cache"]);
  const shown = entries
    .filter((e) => !IGNORE.has(e.name) && !e.name.startsWith("."))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));

  const relPath = dirPath === "." ? "(workspace root)" : dirPath;
  return `Directory: ${relPath}\n${shown.length === 0 ? "(empty)" : shown.join("\n")}`;
}

// ── search_code ──────────────────────────────────────────────────────────────

async function toolSearchCode(args: ToolCallArgs): Promise<string> {
  const pattern       = String(args["pattern"] ?? "");
  const includeGlob   = args["include_pattern"] ? String(args["include_pattern"]) : "**/*";
  const maxResults    = args["max_results"] != null ? Number(args["max_results"]) : 30;

  if (!pattern) return "Error: 'pattern' is required.";

  const wsRoot = getWorkspaceRoot();
  if (!wsRoot) return "Error: no workspace folder open.";

  const results: string[] = [];

  // Use VS Code's built-in findFiles + manual grep for accuracy
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "g");
  } catch {
    // fallback to literal
    regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  }

  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(wsRoot, includeGlob),
    "{**/node_modules/**,**/.git/**,**/__pycache__/**,**/.venv/**,**/venv/**,**/dist/**,**/build/**}",
    500
  );

  let count = 0;
  for (const uri of uris) {
    if (count >= maxResults) break;
    try {
      const raw = fs.readFileSync(uri.fsPath, "utf8");
      const lines = raw.split("\n");
      for (let i = 0; i < lines.length && count < maxResults; i++) {
        regex.lastIndex = 0;
        if (regex.test(lines[i])) {
          const relPath = path.relative(wsRoot, uri.fsPath);
          results.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
          count++;
        }
      }
    } catch {
      // skip unreadable files
    }
  }

  if (results.length === 0) {
    return `No matches found for pattern: ${pattern}`;
  }
  const header = count >= maxResults ? `First ${maxResults} matches` : `${count} match${count !== 1 ? "es" : ""}`;
  return `${header} for "${pattern}" in ${uris.length} files searched:\n${results.join("\n")}`;
}

// ── get_workspace_info ───────────────────────────────────────────────────────

async function toolGetWorkspaceInfo(): Promise<string> {
  const wsRoot = getWorkspaceRoot();
  if (!wsRoot) return "No workspace folder is open.";

  const openFiles = vscode.workspace.textDocuments
    .filter((d) => !d.isUntitled && d.uri.scheme === "file")
    .map((d) => path.relative(wsRoot, d.fileName))
    .filter((p) => !p.startsWith(".."));

  // Top-level listing
  let topLevel = "(unable to list)";
  try {
    const entries = fs.readdirSync(wsRoot, { withFileTypes: true });
    const IGNORE = new Set([".git", "node_modules", "__pycache__", ".venv", "venv"]);
    topLevel = entries
      .filter((e) => !IGNORE.has(e.name) && !e.name.startsWith("."))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((e) => (e.isDirectory() ? `  ${e.name}/` : `  ${e.name}`))
      .join("\n");
  } catch { /* ignore */ }

  const wsFolders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath).join(", ");
  return [
    `Workspace root: ${wsRoot}`,
    `All workspace folders: ${wsFolders || wsRoot}`,
    `\nTop-level contents:\n${topLevel}`,
    openFiles.length ? `\nCurrently open files:\n${openFiles.map((f) => `  ${f}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Context auto-injection helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a brief context block for the current editor state (injected into every message). */
export function buildActiveFileContext(): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return "";

  const doc = editor.document;
  const wsRoot = getWorkspaceRoot();
  const relPath = wsRoot ? path.relative(wsRoot, doc.fileName) : doc.fileName;

  const selection = editor.selection;
  const selectedText = !selection.isEmpty ? doc.getText(selection) : null;
  const totalLines = doc.lineCount;

  // Only include a preview of the file (first 80 lines) to keep system prompt light
  const PREVIEW_LINES = 80;
  const content = doc.getText();
  const lines = content.split("\n");
  const preview = lines.slice(0, PREVIEW_LINES).join("\n");
  const truncated = lines.length > PREVIEW_LINES;

  let ctx = `\n\n---\n**Active file**: \`${relPath}\` (${doc.languageId}, ${totalLines} lines)\n`;
  if (selectedText) {
    ctx += `**Selected text** (lines ${selection.start.line + 1}–${selection.end.line + 1}):\n\`\`\`${doc.languageId}\n${selectedText}\n\`\`\`\n`;
  }
  ctx += `**File preview** (${truncated ? `first ${PREVIEW_LINES}` : `all ${totalLines}`} lines):\n\`\`\`${doc.languageId}\n${preview}`;
  if (truncated) ctx += `\n... (use read_file tool for more)`;
  ctx += "\n```\n---";
  return ctx;
}

/** Resolve @file mentions in the user message and return enriched text + list of resolved paths. */
export async function resolveAtMentions(text: string): Promise<{ resolved: string; mentions: string[] }> {
  const mentions: string[] = [];
  let resolved = text;

  // Pattern: @file:some/path or @file:"some path with spaces"
  const re = /@file:(?:"([^"]+)"|(\S+))/g;
  let match: RegExpExecArray | null;
  const replacements: Array<{ original: string; replacement: string }> = [];

  while ((match = re.exec(text)) !== null) {
    const filePath = match[1] ?? match[2];
    const absPath = resolveWorkspacePath(filePath);
    if (absPath && fs.existsSync(absPath)) {
      mentions.push(filePath);
      const content = await toolReadFile({ path: filePath });
      replacements.push({ original: match[0], replacement: `\n${content}\n` });
    }
  }

  for (const { original, replacement } of replacements) {
    resolved = resolved.replace(original, replacement);
  }
  return { resolved, mentions };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function resolveWorkspacePath(relOrAbs: string): string | undefined {
  if (path.isAbsolute(relOrAbs)) return relOrAbs;
  const root = getWorkspaceRoot();
  if (!root) return undefined;
  return path.join(root, relOrAbs);
}
