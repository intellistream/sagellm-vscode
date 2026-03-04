import * as https from "https";
import * as http from "http";
import * as vscode from "vscode";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
}

export interface ChatCompletionChunk {
  id: string;
  object: string;
  model: string;
  choices: Array<{
    delta: { role?: string; content?: string };
    finish_reason: string | null;
    index: number;
  }>;
}

export interface ModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface ModelsResponse {
  object: string;
  data: ModelInfo[];
}

export class GatewayConnectionError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "GatewayConnectionError";
  }
}

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("sagellm");
  const host = cfg.get<string>("gateway.host", "localhost");
  const port = cfg.get<number>("gateway.port", 8000);
  const apiKey = cfg.get<string>("gateway.apiKey", "");
  const tls = cfg.get<boolean>("gateway.tls", false);
  const baseUrl = `${tls ? "https" : "http"}://${host}:${port}`;
  return { baseUrl, apiKey };
}

function makeRequest(
  method: string,
  url: string,
  apiKey: string,
  body?: string
): Promise<{ statusCode: number; data: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, data }));
    });

    req.on("error", (err) =>
      reject(new GatewayConnectionError(`Network error: ${err.message}`))
    );
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new GatewayConnectionError("Request timed out after 30s"));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/** Fetch available models from sagellm-gateway /v1/models */
export async function fetchModels(): Promise<ModelInfo[]> {
  const { baseUrl, apiKey } = getConfig();
  try {
    const { statusCode, data } = await makeRequest(
      "GET",
      `${baseUrl}/v1/models`,
      apiKey
    );
    if (statusCode !== 200) {
      throw new GatewayConnectionError(
        `Gateway returned HTTP ${statusCode}`,
        statusCode
      );
    }
    const resp = JSON.parse(data) as ModelsResponse;
    return resp.data ?? [];
  } catch (err) {
    if (err instanceof GatewayConnectionError) {
      throw err;
    }
    throw new GatewayConnectionError(
      `Failed to reach sagellm-gateway at ${baseUrl}: ${String(err)}`
    );
  }
}

/** Check if the gateway is reachable */
export async function checkHealth(): Promise<boolean> {
  const { baseUrl, apiKey } = getConfig();
  try {
    const { statusCode } = await makeRequest(
      "GET",
      `${baseUrl}/v1/models`,
      apiKey
    );
    return statusCode === 200;
  } catch {
    return false;
  }
}

/**
 * Send a streaming chat completion request.
 * Calls onChunk for each text delta, returns full text when done.
 */
export async function streamChatCompletion(
  request: ChatCompletionRequest,
  onChunk: (delta: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const { baseUrl, apiKey } = getConfig();
  const body = JSON.stringify({ ...request, stream: true });

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }

    const parsed = new URL(`${baseUrl}/v1/chat/completions`);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        "Content-Length": Buffer.byteLength(body),
      },
    };

    let fullText = "";
    let buffer = "";

    const req = lib.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errData = "";
        res.on("data", (c) => (errData += c));
        res.on("end", () =>
          reject(
            new GatewayConnectionError(
              `Gateway returned HTTP ${res.statusCode}: ${errData}`,
              res.statusCode
            )
          )
        );
        return;
      }

      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") {
            continue;
          }
          if (trimmed.startsWith("data: ")) {
            try {
              const json = JSON.parse(trimmed.slice(6)) as ChatCompletionChunk;
              const delta = json.choices?.[0]?.delta?.content ?? "";
              if (delta) {
                fullText += delta;
                onChunk(delta);
              }
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      });

      res.on("end", () => resolve(fullText));
      res.on("error", (err) =>
        reject(new GatewayConnectionError(err.message))
      );
    });

    req.on("error", (err) =>
      reject(new GatewayConnectionError(`Network error: ${err.message}`))
    );
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new GatewayConnectionError("Chat request timed out after 120s"));
    });

    if (signal) {
      signal.addEventListener("abort", () => {
        req.destroy();
        resolve(fullText); // return whatever we got before abort
      });
    }

    req.write(body);
    req.end();
  });
}

export interface TextCompletionRequest {
  model: string;
  prompt: string;
  max_tokens?: number;
  temperature?: number;
  stop?: string[];
}

/**
 * POST to /v1/completions — native FIM endpoint.
 * Throws GatewayConnectionError with statusCode 404 if not supported by this gateway.
 */
export async function rawTextCompletion(
  request: TextCompletionRequest
): Promise<string> {
  const { baseUrl, apiKey } = getConfig();
  const body = JSON.stringify({ ...request, stream: false });
  const { statusCode, data } = await makeRequest(
    "POST",
    `${baseUrl}/v1/completions`,
    apiKey,
    body
  );
  if (statusCode === 404) {
    throw new GatewayConnectionError("Endpoint /v1/completions not available", 404);
  }
  if (statusCode !== 200) {
    throw new GatewayConnectionError(
      `Gateway returned HTTP ${statusCode}: ${data}`,
      statusCode
    );
  }
  const resp = JSON.parse(data) as { choices: Array<{ text: string }> };
  return resp.choices?.[0]?.text ?? "";
}

/** Non-streaming completion (for inline completion where we need the full result) */
export async function chatCompletion(
  request: ChatCompletionRequest
): Promise<string> {
  const { baseUrl, apiKey } = getConfig();
  const body = JSON.stringify({ ...request, stream: false });
  const { statusCode, data } = await makeRequest(
    "POST",
    `${baseUrl}/v1/chat/completions`,
    apiKey,
    body
  );
  if (statusCode !== 200) {
    throw new GatewayConnectionError(
      `Gateway returned HTTP ${statusCode}: ${data}`,
      statusCode
    );
  }
  const resp = JSON.parse(data) as {
    choices: Array<{ message: { content: string } }>;
  };
  return resp.choices?.[0]?.message?.content ?? "";
}
