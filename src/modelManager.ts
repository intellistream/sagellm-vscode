import * as vscode from "vscode";
import { fetchModels, ModelInfo, GatewayConnectionError } from "./gatewayClient";
import { MODEL_CATALOG, isModelDownloaded } from "./serverLauncher";

const SEP = vscode.QuickPickItemKind.Separator;

export class ModelManager {
  private models: ModelInfo[] = [];
  private selectedModel = "";
  private readonly _onDidChangeModels = new vscode.EventEmitter<ModelInfo[]>();
  readonly onDidChangeModels = this._onDidChangeModels.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.selectedModel =
      vscode.workspace.getConfiguration("sagellm").get<string>("model", "") ||
      context.globalState.get<string>("sagellm.selectedModel", "");
  }

  get currentModel(): string {
    return this.selectedModel;
  }

  getModels(): ModelInfo[] {
    return this.models;
  }

  async refresh(): Promise<ModelInfo[]> {
    try {
      this.models = await fetchModels();
      this._onDidChangeModels.fire(this.models);
      return this.models;
    } catch (err) {
      if (err instanceof GatewayConnectionError) {
        throw err;
      }
      throw new Error(String(err));
    }
  }

  async selectModelInteractive(): Promise<string | undefined> {
    // Fetch currently loaded gateway models (best-effort)
    let loadedModels: ModelInfo[] = [];
    try {
      loadedModels = await this.refresh();
    } catch { /* gateway offline */ }
    const loadedIds = new Set(loadedModels.map((m) => m.id));

    const items: vscode.QuickPickItem[] = [];

    // ── 1. Running in gateway ────────────────────────────────────────────
    if (loadedModels.length > 0) {
      items.push({ label: "Running in gateway", kind: SEP });
      for (const m of loadedModels) {
        items.push({
          label: `$(check) ${m.id}`,
          description: "● active",
          detail: m.id,
        });
      }
    }

    // ── 2. Downloaded locally (catalog) ─────────────────────────────────
    const downloadedLocal = MODEL_CATALOG.filter(
      (m) => isModelDownloaded(m.id) && !loadedIds.has(m.id)
    );
    if (downloadedLocal.length > 0) {
      items.push({ label: "Downloaded — restart gateway to load", kind: SEP });
      for (const m of downloadedLocal) {
        items.push({
          label: `$(package) ${m.id}`,
          description: `${m.size} · ${m.vram}`,
          detail: m.id,
        });
      }
    }

    // ── 3. Available to download ─────────────────────────────────────────
    const downloadable = MODEL_CATALOG.filter(
      (m) => !isModelDownloaded(m.id) && !loadedIds.has(m.id)
    );
    if (downloadable.length > 0) {
      items.push({ label: "Available to download", kind: SEP });
      for (const m of downloadable) {
        items.push({
          label: `$(cloud-download) ${m.id}`,
          description: `${m.size} · ${m.vram} · ${m.desc}`,
          detail: m.id,
        });
      }
    }

    // ── 4. Custom entry ──────────────────────────────────────────────────
    items.push({ label: "", kind: SEP });
    items.push({
      label: "$(edit) Enter model path / HuggingFace ID…",
      description: "",
      detail: "__custom__",
    });

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "$(check) active  $(package) local  $(cloud-download) downloadable",
      title: "SageLLM: Select Model",
      matchOnDescription: true,
    });

    if (!picked || picked.kind === SEP) return undefined;

    let modelId = picked.detail ?? "";
    if (modelId === "__custom__") {
      modelId =
        (await vscode.window.showInputBox({
          title: "SageLLM: Model Path or HuggingFace ID",
          prompt: "e.g.  Qwen/Qwen2.5-7B-Instruct  or  /models/my-model",
          value: this.selectedModel,
          ignoreFocusOut: true,
        })) ?? "";
      if (!modelId.trim()) return undefined;
      modelId = modelId.trim();
    }

    await this.setModel(modelId);

    // If not already loaded in the gateway → offer to restart
    if (!loadedIds.has(modelId)) {
      await vscode.workspace
        .getConfiguration("sagellm")
        .update("preloadModel", modelId, vscode.ConfigurationTarget.Global);
      const choice = await vscode.window.showInformationMessage(
        `"${modelId}" is not currently loaded. Restart gateway to use it?`,
        "Restart Gateway",
        "Later"
      );
      if (choice === "Restart Gateway") {
        vscode.commands.executeCommand("sagellm.restartGateway");
      }
    }

    return modelId;
  }

  async setModel(modelId: string): Promise<void> {
    this.selectedModel = modelId;
    await this.context.globalState.update("sagellm.selectedModel", modelId);
    vscode.workspace
      .getConfiguration("sagellm")
      .update("model", modelId, vscode.ConfigurationTarget.Global);
  }

  /** Ensure a model is selected, prompting if not */
  async ensureModel(): Promise<string | undefined> {
    if (this.selectedModel) {
      return this.selectedModel;
    }
    return this.selectModelInteractive();
  }

  dispose(): void {
    this._onDidChangeModels.dispose();
  }
}

/** Tree view for the Models sidebar panel */
export class ModelsTreeProvider
  implements vscode.TreeDataProvider<ModelTreeItem>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    ModelTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly modelManager: ModelManager) {
    modelManager.onDidChangeModels(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(element: ModelTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): ModelTreeItem[] {
    const models = this.modelManager.getModels();
    if (models.length === 0) {
      return [
        new ModelTreeItem(
          "No models loaded",
          vscode.TreeItemCollapsibleState.None,
          true
        ),
      ];
    }
    return models.map(
      (m) =>
        new ModelTreeItem(
          m.id,
          vscode.TreeItemCollapsibleState.None,
          false,
          m.id === this.modelManager.currentModel,
          m
        )
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

class ModelTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    isPlaceholder = false,
    isActive = false,
    public readonly model?: ModelInfo
  ) {
    super(label, collapsibleState);
    if (isPlaceholder) {
      this.contextValue = "placeholder";
      this.iconPath = new vscode.ThemeIcon("info");
    } else if (isActive) {
      this.iconPath = new vscode.ThemeIcon("check");
      this.contextValue = "activeModel";
      this.description = "active";
    } else {
      this.iconPath = new vscode.ThemeIcon("hubot");
      this.contextValue = "model";
      this.command = {
        command: "sagellm.selectModel",
        title: "Select Model",
        arguments: [label],
      };
    }
  }
}
