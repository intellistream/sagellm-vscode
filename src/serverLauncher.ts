/**
 * serverLauncher.ts
 * Handles hardware detection, backend/model selection, download, and gateway launch.
 */
import * as vscode from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { checkHealth, fetchModels } from "./gatewayClient";
import { StatusBarManager } from "./statusBar";

// ─────────────────────────────────────────────────────────────────────────────
// Model catalog
// ─────────────────────────────────────────────────────────────────────────────

interface CatalogModel {
  id: string;       // HuggingFace repo ID
  size: string;     // human-readable param count
  vram: string;     // minimum VRAM / RAM needed
  tags: string[];   // e.g. ["chat","fast","cpu-ok"]
  desc: string;     // one-line description
}

const MODEL_CATALOG: CatalogModel[] = [
  // ── Tiny / CPU-friendly ──────────────────────────────────────────────────
  { id: "Qwen/Qwen2.5-0.5B-Instruct",              size: "0.5B", vram: "~1 GB",  tags: ["chat","cpu-ok","fast"],   desc: "Tiny Qwen chat, runs on CPU" },
  { id: "Qwen/Qwen2.5-Coder-0.5B-Instruct",        size: "0.5B", vram: "~1 GB",  tags: ["code","cpu-ok","fast"],   desc: "Tiny code assistant" },
  { id: "TinyLlama/TinyLlama-1.1B-Chat-v1.0",      size: "1.1B", vram: "~2 GB",  tags: ["chat","cpu-ok"],          desc: "Lightweight general chat" },
  // ── Small (1–3 B) ────────────────────────────────────────────────────────
  { id: "Qwen/Qwen2.5-1.5B-Instruct",              size: "1.5B", vram: "~3 GB",  tags: ["chat","fast"],            desc: "Fast Qwen chat" },
  { id: "Qwen/Qwen2.5-Coder-1.5B-Instruct",        size: "1.5B", vram: "~3 GB",  tags: ["code","fast"],            desc: "Fast code assistant" },
  { id: "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",size:"1.5B", vram: "~3 GB",  tags: ["chat","reasoning"],       desc: "DeepSeek-R1 distilled, strong reasoning" },
  { id: "Qwen/Qwen2.5-3B-Instruct",                size: "3B",   vram: "~6 GB",  tags: ["chat"],                   desc: "Balanced Qwen chat" },
  { id: "Qwen/Qwen2.5-Coder-3B-Instruct",          size: "3B",   vram: "~6 GB",  tags: ["code"],                   desc: "Balanced code assistant" },
  // ── Medium (7 B) ─────────────────────────────────────────────────────────
  { id: "Qwen/Qwen2.5-7B-Instruct",                size: "7B",   vram: "~14 GB", tags: ["chat","powerful"],        desc: "Powerful Qwen chat (needs GPU)" },
  { id: "Qwen/Qwen2.5-Coder-7B-Instruct",          size: "7B",   vram: "~14 GB", tags: ["code","powerful"],        desc: "Powerful code assistant (needs GPU)" },
  { id: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", size: "7B",   vram: "~14 GB", tags: ["chat","reasoning","powerful"], desc: "DeepSeek-R1 distilled 7B" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Local HF cache helpers
// ─────────────────────────────────────────────────────────────────────────────

function hfCacheDir(): string {
  return path.join(os.homedir(), ".cache", "huggingface", "hub");
}

function hfDirName(modelId: string): string {
  return "models--" + modelId.replace(/\//g, "--");
}

export function isModelDownloaded(modelId: string): boolean {
  const dir = path.join(hfCacheDir(), hfDirName(modelId));
  return fs.existsSync(dir);
}

/** Return all model IDs that are already in the HF cache. */
function localModelIds(): Set<string> {
  const set = new Set<string>();
  try {
    for (const entry of fs.readdirSync(hfCacheDir())) {
      if (entry.startsWith("models--")) {
        set.add(entry.slice("models--".length).replace(/--/g, "/"));
      }
    }
  } catch { /* ignore */ }
  return set;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model download with VS Code progress bar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Download a HuggingFace model using huggingface-cli.
 * Shows a cancellable VS Code progress notification.
 * Returns true on success, false if cancelled or failed.
 */
export async function downloadModel(modelId: string): Promise<boolean> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `SageLLM: Downloading ${modelId}`,
      cancellable: true,
    },
    async (progress, token) => {
      return new Promise<boolean>((resolve) => {
        const proc = cp.spawn(
          "huggingface-cli",
          ["download", modelId, "--resume-download"],
          { env: { ...process.env } }
        );

        let lastPct = 0;

        // Parse tqdm-style progress:  "  45%|████▌     | 1.12G/2.47G [01:23<01:40,  9.3MB/s]"
        const parseLine = (line: string) => {
          const m = line.match(/(\d+)%\|/);
          if (m) {
            const pct = parseInt(m[1], 10);
            const increment = pct - lastPct;
            if (increment > 0) {
              lastPct = pct;
              // Extract speed/ETA for the message
              const speed = line.match(/[\d.]+\s*[MG]B\/s/)?.[0] ?? "";
              const eta   = line.match(/<([\d:]+),/)?.[1] ?? "";
              progress.report({
                increment,
                message: `${pct}%${speed ? "  " + speed : ""}${eta ? "  ETA " + eta : ""}`,
              });
            }
          } else if (line.includes("Downloading")) {
            // Show file name being downloaded
            const file = line.match(/Downloading (.+?):/)?.[1];
            if (file) progress.report({ message: file });
          }
        };

        let stderr = "";
        proc.stderr.on("data", (d: Buffer) => {
          const text = d.toString();
          stderr += text;
          for (const line of text.split(/\r?\n/)) parseLine(line);
        });
        proc.stdout.on("data", (d: Buffer) => {
          for (const line of d.toString().split(/\r?\n/)) parseLine(line);
        });

        proc.on("close", (code) => {
          if (code === 0) {
            progress.report({ increment: 100 - lastPct, message: "完成 ✓" });
            resolve(true);
          } else if (token.isCancellationRequested) {
            resolve(false);
          } else {
            vscode.window.showErrorMessage(
              `SageLLM: 下载失败 (exit ${code}).\n${stderr.slice(-300)}`
            );
            resolve(false);
          }
        });

        proc.on("error", (err) => {
          vscode.window.showErrorMessage(`SageLLM: 无法运行 huggingface-cli: ${err.message}`);
          resolve(false);
        });

        token.onCancellationRequested(() => {
          proc.kill("SIGTERM");
          resolve(false);
        });
      });
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend detection
// ─────────────────────────────────────────────────────────────────────────────

export interface BackendInfo {
  id: string;
  label: string;
  detected: boolean;
  description: string;
}

export function detectBackends(infoOutput: string): BackendInfo[] {
  const backends: BackendInfo[] = [
    { id: "cpu", label: "$(circuit-board) CPU", detected: true, description: "Always available" },
  ];
  const hasCuda   = /CUDA.*✅|✅.*CUDA|✅.*\d+\s*device/i.test(infoOutput);
  const hasAscend = /Ascend.*✅|✅.*Ascend|✅.*torch_npu/i.test(infoOutput);
  const cudaMatch = infoOutput.match(/CUDA[^\n]*✅[^\n]*?-\s*(.+)|✅\s*\d+\s*device[^-]*-\s*(.+)/i);
  const cudaName  = cudaMatch ? (cudaMatch[1] || cudaMatch[2] || "").trim().split("\n")[0] : "";
  if (hasCuda)   backends.push({ id: "cuda",   label: "$(zap) CUDA (GPU)",          detected: true, description: cudaName || "NVIDIA GPU detected" });
  if (hasAscend) backends.push({ id: "ascend", label: "$(hubot) Ascend (昇腾 NPU)", detected: true, description: "Ascend NPU detected" });
  return backends;
}

export async function detectBackendsFromCLI(): Promise<BackendInfo[]> {
  return new Promise((resolve) => {
    cp.exec("sagellm info", { timeout: 15000 }, (_err, stdout) => {
      try { resolve(detectBackends(stdout ?? "")); }
      catch { resolve([{ id: "cpu", label: "$(circuit-board) CPU", detected: true, description: "Always available" }]); }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Model picker items
// ─────────────────────────────────────────────────────────────────────────────

/** Try fetching models from an already-running gateway (non-throwing). */
async function tryFetchGatewayModels(): Promise<string[]> {
  try {
    const models = await fetchModels();
    return models.map((m) => m.id);
  } catch { return []; }
}

/**
 * Build the full QuickPick item list:
 *   1. Separator: Running gateway  (if server up)
 *   2. Separator: Downloaded  (local HF cache + catalog overlap + extras)
 *   3. Separator: Recommended – auto-download  (catalog items not yet local)
 *   4. Enter manually
 */
export async function buildModelPickerItems(
  recentModels: string[],
  savedModel: string
): Promise<vscode.QuickPickItem[]> {
  const SEP = vscode.QuickPickItemKind.Separator;

  const [gatewayIds, localIds] = await Promise.all([
    tryFetchGatewayModels(),
    Promise.resolve(localModelIds()),
  ]);

  const seen = new Set<string>();
  const items: vscode.QuickPickItem[] = [];

  const add = (item: vscode.QuickPickItem & { detail?: string }) => {
    const key = item.detail ?? item.label;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  // ── Section 0: last used ───────────────────────────────────────────────
  if (savedModel) {
    const local = localIds.has(savedModel);
    add({ label: `$(star-full) ${savedModel}`, description: local ? "✅ last used" : "☁️ last used (not cached)", detail: savedModel });
  }

  // ── Section 1: running gateway ─────────────────────────────────────────
  if (gatewayIds.length) {
    items.push({ label: "Running on gateway", kind: SEP });
    for (const id of gatewayIds) {
      add({ label: `$(server) ${id}`, description: "✅ serving now", detail: id });
    }
  }

  // ── Section 2: downloaded ──────────────────────────────────────────────
  const downloadedCatalog = MODEL_CATALOG.filter((m) => localIds.has(m.id));
  const downloadedExtra   = [...localIds].filter((id) => !MODEL_CATALOG.some((m) => m.id === id));
  const recentDownloaded  = recentModels.filter((id) => localIds.has(id));

  const downloadedItems: vscode.QuickPickItem[] = [];
  const addDownloaded = (id: string, desc: string) => {
    if (seen.has(id)) return; seen.add(id);
    downloadedItems.push({ label: `$(database) ${id}`, description: `✅ ${desc}`, detail: id });
  };
  downloadedCatalog.forEach((m) => addDownloaded(m.id, `${m.size} · ${m.vram} · ${m.desc}`));
  recentDownloaded.forEach((id) => addDownloaded(id, "recent"));
  downloadedExtra.forEach((id) => addDownloaded(id, "local cache"));

  if (downloadedItems.length) {
    items.push({ label: "Downloaded", kind: SEP });
    items.push(...downloadedItems);
  }

  // ── Section 3: recommended (not yet downloaded) ────────────────────────
  const recommendedItems: vscode.QuickPickItem[] = [];
  for (const m of MODEL_CATALOG) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const tagStr = m.tags.includes("cpu-ok") ? "runs on CPU · " : "";
    recommendedItems.push({
      label: `$(cloud-download) ${m.id}`,
      description: `☁️ ${m.size} · ${m.vram}  —  ${tagStr}${m.desc}`,
      detail: m.id,
    });
  }
  if (recommendedItems.length) {
    items.push({ label: "Recommended  (will auto-download)", kind: SEP });
    items.push(...recommendedItems);
  }

  // ── Section 4: recent not yet listed ──────────────────────────────────
  const extraRecent = recentModels.filter((id) => !seen.has(id));
  if (extraRecent.length) {
    items.push({ label: "Recent", kind: SEP });
    for (const id of extraRecent) {
      seen.add(id);
      items.push({ label: `$(history) ${id}`, description: "recent", detail: id });
    }
  }

  // ── Section 5: manual entry ────────────────────────────────────────────
  items.push({ label: "", kind: SEP });
  items.push({ label: "$(edit) Enter model path / HuggingFace ID…", description: "", detail: "__custom__" });
  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/** Prompt user to pick backend + model (with optional auto-download), then start. */
export async function promptAndStartServer(
  context: vscode.ExtensionContext,
  sb: StatusBarManager | null
): Promise<void> {
  const cfg  = vscode.workspace.getConfiguration("sagellm");
  const port = cfg.get<number>("gateway.port", 8901);

  // ── 1. Detect backends ────────────────────────────────────────────────────
  sb?.setConnecting();
  const backends     = await detectBackendsFromCLI();
  const backendItems = backends.map((b) => ({
    label: b.label,
    description: b.detected ? `✅ ${b.description}` : b.description,
    detail: b.id,
  }));

  const savedBackend = cfg.get<string>("backend", "");
  if (savedBackend) {
    const idx = backendItems.findIndex((i) => i.detail === savedBackend);
    if (idx > 0) backendItems.unshift(...backendItems.splice(idx, 1));
  } else {
    backendItems.reverse(); // prefer GPU
  }

  const pickedBackend = await vscode.window.showQuickPick(backendItems, {
    title: "SageLLM: Select Inference Backend",
    placeHolder: "Choose hardware backend to use",
  }) as vscode.QuickPickItem | undefined;
  if (!pickedBackend) { sb?.setGatewayStatus(false); return; }
  const backendId = pickedBackend.detail!;
  await cfg.update("backend", backendId, vscode.ConfigurationTarget.Global);

  // ── 2. Pick model ─────────────────────────────────────────────────────────
  const recentModels = context.globalState.get<string[]>("sagellm.recentModels", []);
  const savedModel   = cfg.get<string>("preloadModel", "").trim();

  const modelItems = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "SageLLM: Scanning models…", cancellable: false },
    () => buildModelPickerItems(recentModels, savedModel)
  );

  const totalDownloadable = MODEL_CATALOG.filter((m) => !isModelDownloaded(m.id)).length;
  const pickedModel = await vscode.window.showQuickPick(modelItems, {
    title: `SageLLM: Select Model  (☁️ ${totalDownloadable} available to download)`,
    placeHolder: "✅ downloaded · ☁️ will auto-download · $(edit) custom path",
    matchOnDescription: true,
    matchOnDetail: false,
  }) as vscode.QuickPickItem | undefined;
  if (!pickedModel) { sb?.setGatewayStatus(false); return; }

  let modelId = pickedModel.detail!;
  if (modelId === "__custom__") {
    modelId = (await vscode.window.showInputBox({
      title: "SageLLM: Model Path or HuggingFace ID",
      prompt: "e.g.  Qwen/Qwen2.5-7B-Instruct  or  /models/my-model",
      value: savedModel,
      ignoreFocusOut: true,
    })) ?? "";
    if (!modelId.trim()) { sb?.setGatewayStatus(false); return; }
    modelId = modelId.trim();
  }

  // ── 3. Download if not cached ─────────────────────────────────────────────
  if (!isModelDownloaded(modelId) && !modelId.startsWith("/")) {
    const choice = await vscode.window.showInformationMessage(
      `"${modelId}" 尚未下载。是否现在下载？`,
      { modal: true },
      "下载", "取消"
    );
    if (choice !== "下载") { sb?.setGatewayStatus(false); return; }

    const ok = await downloadModel(modelId);
    if (!ok) { sb?.setGatewayStatus(false); return; }
    vscode.window.showInformationMessage(`✅ ${modelId} 下载完成`);
  }

  // ── 4. Persist choices ────────────────────────────────────────────────────
  await cfg.update("preloadModel", modelId, vscode.ConfigurationTarget.Global);
  await context.globalState.update(
    "sagellm.recentModels",
    [modelId, ...recentModels.filter((m) => m !== modelId)].slice(0, 10)
  );

  // ── 5. Launch server ──────────────────────────────────────────────────────
  const baseCmd = cfg.get<string>("gatewayStartCommand", "sagellm serve");
  const cmd     = `${baseCmd} --backend ${backendId} --model ${modelId} --port ${port}`;
  const terminal = vscode.window.createTerminal({ name: "SageLLM Server", isTransient: false });
  terminal.sendText(cmd);
  terminal.show(false);
  vscode.window.showInformationMessage(`SageLLM: Starting ${backendId.toUpperCase()} · ${modelId}…`);

  // ── 6. Poll until healthy ─────────────────────────────────────────────────
  let attempts = 0;
  const poll = setInterval(async () => {
    attempts++;
    if (await checkHealth()) {
      clearInterval(poll);
      sb?.setGatewayStatus(true);
      vscode.window.showInformationMessage(`SageLLM: Server ready ✓  (${backendId} · ${modelId})`);
    } else if (attempts >= 20) {
      clearInterval(poll);
      sb?.setError("Server start timed out");
      vscode.window.showWarningMessage("SageLLM: Server did not respond within 60s. Check the terminal.");
    }
  }, 3000);
}

