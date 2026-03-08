/**
 * sagePorts.ts
 *
 * Canonical port constants for the sageLLM / SAGE ecosystem.
 *
 * This file is the TypeScript mirror of:
 *   sage-common · src/sage/common/config/ports.py · SagePorts
 *
 * Keep in sync with that file when ports change.
 *
 * Architecture reference:
 *
 *   Browser / VS Code extension
 *        │
 *        ▼
 *   SAGELLM_GATEWAY     :8889  ← standalone sagellm-gateway process
 *   SAGELLM_SERVE_PORT  :8901  ← sagellm serve (gateway + engine, full-stack)
 *        │
 *        ▼  (internal, not exposed to the extension by default)
 *   SAGELLM_ENGINE_PORT :8902  ← real inference backend
 *
 * The VS Code extension connects to SAGELLM_SERVE_PORT (8901) by default
 * because `sagellm serve` is the recommended all-in-one startup command.
 * Users who run a standalone gateway can override to SAGELLM_GATEWAY (8889).
 */

export const SAGE_PORTS = {
  // ── Platform services ──────────────────────────────────────────────────────
  STUDIO_FRONTEND: 5173,    // Vite dev server (sage-studio)
  STUDIO_BACKEND:  8765,    // Studio FastAPI backend

  // ── sageLLM Gateway (OpenAI-compatible API entry point) ───────────────────
  SAGELLM_GATEWAY:      8889, // sagellm-gateway standalone process
  EDGE_DEFAULT:         8899, // sage-edge aggregator shell

  // ── sageLLM full-stack (sagellm serve = gateway + engine) ─────────────────
  // Instance 1 (primary)
  SAGELLM_SERVE_PORT:   8901, // sagellm serve --port          (shell / proxy)
  SAGELLM_ENGINE_PORT:  8902, // sagellm serve --engine-port   (real backend)
  // Instance 2 (secondary)
  SAGELLM_SERVE_PORT_2: 8903,
  SAGELLM_ENGINE_PORT_2: 8904,

  // ── Embedding services ────────────────────────────────────────────────────
  EMBEDDING_DEFAULT:    8090, // Primary embedding server
  EMBEDDING_SECONDARY:  8091,

  // ── Benchmark & testing ───────────────────────────────────────────────────
  BENCHMARK_EMBEDDING:  8950,
  BENCHMARK_API:        8951,
} as const;

/** Default port the extension connects to (sagellm serve full-stack). */
export const DEFAULT_GATEWAY_PORT = SAGE_PORTS.SAGELLM_SERVE_PORT; // 8901
