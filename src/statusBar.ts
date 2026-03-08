import * as vscode from "vscode";

export class StatusBarManager {
  private readonly statusBar: vscode.StatusBarItem;
  private gatewayRunning = false;
  private currentModel = "";

  constructor() {
    this.statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBar.command = "sagellm.openChat";
    this.update();
    this.statusBar.show();
  }

  setGatewayStatus(running: boolean): void {
    this.gatewayRunning = running;
    this.update();
  }

  setModel(model: string): void {
    this.currentModel = model;
    this.update();
  }

  setConnecting(): void {
    this.statusBar.text = "$(sync~spin) SageLLM";
    this.statusBar.tooltip = "Connecting to sagellm-gateway...";
    this.statusBar.backgroundColor = undefined;
  }

  setError(message: string): void {
    this.statusBar.text = "$(error) SageLLM";
    this.statusBar.tooltip = `SageLLM: ${message}\nClick to open chat`;
    this.statusBar.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground"
    );
  }

  private update(): void {
    if (!this.gatewayRunning) {
      this.statusBar.text = "$(circle-slash) SageLLM";
      this.statusBar.tooltip =
        "sagellm-gateway not connected — click to open chat and check status";
      this.statusBar.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
    } else {
      const model = this.currentModel ? ` (${this.currentModel})` : "";
      this.statusBar.text = `$(hubot) SageLLM${model}`;
      this.statusBar.tooltip = `sagellm-gateway connected${model}\nClick to open chat`;
      this.statusBar.backgroundColor = undefined;
    }
  }

  dispose(): void {
    this.statusBar.dispose();
  }
}
