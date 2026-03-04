import * as vscode from "vscode";
import { fetchModels, ModelInfo, GatewayConnectionError } from "./gatewayClient";

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
    let models = this.models;
    if (models.length === 0) {
      try {
        models = await this.refresh();
      } catch {
        vscode.window.showErrorMessage(
          "Cannot reach sagellm-gateway. Is it running? Run 'SageLLM: Start Gateway' or check your settings."
        );
        return undefined;
      }
    }

    if (models.length === 0) {
      vscode.window.showWarningMessage(
        "No models available on the gateway. Please load a model first."
      );
      return undefined;
    }

    const items: vscode.QuickPickItem[] = models.map((m) => ({
      label: m.id,
      description: m.owned_by,
      detail: `Object: ${m.object}`,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a SageLLM model",
      title: "SageLLM: Available Models",
    });

    if (picked) {
      await this.setModel(picked.label);
      return picked.label;
    }
    return undefined;
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
