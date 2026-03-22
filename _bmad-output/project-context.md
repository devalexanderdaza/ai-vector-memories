---
project_name: "ai-vector-memories"
user_name: "Alex"
date: "2026-03-22T22:10:00-05:00"
sections_completed:
  [
    "technology_stack",
    "language_rules",
    "framework_rules",
    "memory_rules",
    "testing_rules",
    "quality_rules",
    "workflow_rules",
    "anti_patterns",
  ]
existing_patterns_found: 56
status: "complete"
optimized_for_llm: true
rule_count: 61
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- Language: TypeScript ^5.9.3 (`strict: true`, target ES2022, ESM, `noUncheckedIndexedAccess`)
- Runtime/Host: OpenCode plugin (`@opencode-ai/plugin` ^1.2.27, `@opencode-ai/sdk` ^1.2.27)
- Build tooling: Bun (bundles `src/index.ts` → `dist/index.js`, also `src/memory/embedding-worker.ts` → `dist/memory/embedding-worker.js`), `tsc --emitDeclarationOnly` for declarations
- Test tooling: Vitest ^4.1.0 for unit/integration suites in `src/memory/*.test.ts` and `src/commands/*.test.ts`
- CI/Release: GitHub Actions (`.github/workflows/release.yml`) publishes to npm on `main` when `package.json` changes; Node.js 22 for publish step
- Storage: SQLite via runtime-agnostic adapter (`src/storage/sqlite-adapter.ts`); auto-selects `bun:sqlite` or `node:sqlite` (Node 22+); WAL mode; schema version 3
- Vector/search: `ruvector` ^0.2.16 (HNSW, cosine distance, 384-dim, O(log N) search); local `~/.ai-vector-memories/ruvector.db`
- IDs: `uuid` ^13.0.0
- Optional NLP embeddings: `@huggingface/transformers` ^4.0.0-next.1; runs as Node.js child process (NOT Worker thread) to avoid Bun/ONNX crashes; model: `Xenova/all-MiniLM-L6-v2` (384-dim, q8 quantized)
- BMAD Method: `_bmad/` directory for project workflow; docs in `docs/`; planning artifacts in `_bmad-output/`

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- Strict TS is enforced: no implicit returns, no fallthrough in switch, `noUncheckedIndexedAccess`; avoid "works at runtime" code that fails typecheck.
- ESM project: keep relative imports with `.js` extensions in TS source (e.g. `import { log } from './logger.js'`), don't use extensionless relative imports.
- Prefer `import type { ... }` for type-only imports to keep runtime output clean.
- Avoid `any`; use `unknown` and narrow.
- Keep formatting consistent with repo: 2-space indent, single quotes, semicolons.
- Naming: `PascalCase` for classes/types/interfaces, `camelCase` for functions/variables, `UPPER_SNAKE_CASE` for module-level constants.

### Framework-Specific Rules (OpenCode Plugin)

- Hooks must be fail-open: catch/log errors and continue when safe; don't crash the host TUI. Only `throw` for init failures.
- Avoid stdout/stderr during runtime; use file logger `log()` (`src/logger.ts`) only.
- Keep hook paths fast/non-blocking: prefer fire-and-forget for non-critical work; debounce noisy events (`message.updated` at 500ms).
- Plugin returns hooks immediately without awaiting init; uses `state.initPromise` for lazy await. Don't block the return.
- Hot-reload: module-level state persists across reloads; detect via `state.initialized`/`state.initializingLock` flags and re-init. State bridge via `~/.ai-vector-memories/state.json`.
- Runtime state lives in `~/.ai-vector-memories/` (config.jsonc, state.json, plugin-debug.log, memory.db, ruvector.db, .worktree-cache, models/).

### Memory System Rules

- **7 classification types** with specific scope/decay/Store rules:
  - `episodic`: temporal, project-scoped, always STM, decays at 0.05/hr (~32hr half-life). NEVER promotes to LTM.
  - `semantic`: factual, project or global, STM→LTM promotion.
  - `procedural`: workflow how-to, user-level, global default.
  - `learning`: discoveries, auto-promote to LTM.
  - `preference`: user prefs, user-level, global default.
  - `decision`: decisions made, auto-promote to LTM, project-scoped.
  - `constraint`: rules/limits, user-level, global, capped at 10 per injection.
- **Decay**: exponential `newStrength = strength * exp(-decayRate * hours)`. Threshold 0.1 triggers `decayed` status. Applied at session end.
- **Consolidation**: STM→LTM when strength >= 0.7 or frequency >= 3. `learning` and `decision` auto-promote.
- **Hybrid similarity**: retrieval/reconsolidation use `getSimilarity()` with fast-path Jaccard and semantic blend (0.3 lexical + 0.7 cosine) when embeddings are available; fallback remains Jaccard-only (fail-open).
- **Reconsolidation**: decision thresholds are `> 0.85 duplicate`, `> 0.7 conflict`, else complement; reconsolidation is classification-aware, so different classifications always coexist as complement.
- **Exact dedup**: use content hash (SHA-256 of normalized text) for O(1) duplicate detection before insert.
- **Injection tiers**: Tier 0 constraints (max 10), Tier 1 global quota, Tier 2 project quota, Tier 3 flexible slots. Slot allocation is deterministic and ratio-based.
- **Compression pass (optional)**: after base selection, low-priority summaries (Tier 3 then Tier 2) can be truncated proportionally under token pressure. Tier 0 and Tier 1 are never compressed.
- **Adaptive quotas (optional)**: global/project/flexible ratios can auto-adjust from rolling metrics; allocation must stay normalized and deterministic; on any failure, fallback to static quotas.
- **Self-ingestion prevention**: filter `[TRUE-MEM]`, `[LTM]`, `[STM]`, `<true_memory_context>` markers from conversation text before extraction.

### Service Architecture Rules

- **Singleton pattern** used extensively: `EmbeddingService.getInstance()`, `RuVectorService.getInstance()`, `InjectionMetricsCollector.getInstance()`, `ShutdownManager.getInstance()`, `getExtractionQueue()`.
- **Lazy imports**: use dynamic `await import()` for deferred loading (e.g., adapter in `index.ts`, ruvector-service in `database.ts`).
- **Extraction queue**: singleton sequential queue via `queueMicrotask`; one job at a time; errors don't block subsequent jobs.
- **Embedding worker**: runs as Node.js child process (NOT Worker thread) via IPC (`process.send`/`process.on('message')`); request-response with UUID correlation; 5-second timeout per request.
- **Circuit breaker**: `EmbeddingService` disables after 3 failures in 5 minutes. Falls back to Jaccard-only similarity.
- **Shutdown manager**: LIFO shutdown handlers registered via `registerShutdownHandler(name, fn)`. No signal handlers.
- **Config priority**: ENV vars > `~/.ai-vector-memories/config.jsonc` > `state.json` > defaults. Treat config as untrusted; catch parse errors and fall back.
- **Adaptive telemetry loop**: `InjectionMetricsCollector` records compression and quota-impact metrics and feeds adaptive quota adjustments (`recordQuotaImpact`, baseline vs adjusted snapshots).

### Testing Rules

- Automated tests exist with Vitest (unit + integration), including reconsolidation, compression, adaptive quota, retrieval/injection flow, and CLI metrics reporting.
- Primary validation commands: `bun run typecheck`, `bun run build`, `bun test`.
- Prefer targeted test runs while iterating, then run full suite before shipping changes touching memory selection/injection logic.

### Code Quality & Style Rules

- No linter/formatter is configured; keep edits consistent with existing style (2-space indent, single quotes, semicolons).
- Prefer small, safe changes: this plugin runs inside another host process; avoid blocking or heavy synchronous work in hooks.
- Logging: use `src/logger.ts` (`log()`), keep logs concise, avoid logging secrets/large payloads.
- Keep config files JSONC and parse via `src/utils/jsonc.ts`; strip comments then `JSON.parse`; preserve comments on write.
- For optional properties: use `undefined` in TypeScript objects, use `null` at SQLite persistence boundaries.

### Development Workflow Rules

- Before shipping: run `bun run typecheck` and `bun run build`.
- For memory/injection behavior changes, also run `bun test src/memory` and include integration paths when scope/isolation logic changes.
- Build produces: `dist/index.js`, `dist/index.d.ts`, `dist/memory/embedding-worker.js`.
- Metrics workflows available: `bun run metrics:injection` (log-based snapshot) and `bun run metrics:report` (collector report in markdown/json).
- Release automation: pushing to `main` with `package.json` changes triggers npm publish + GitHub Release.
- Avoid changing publish-critical metadata casually (`package.json` name/version/exports/files).
- Import grouping order: (1) Node built-ins, (2) external deps, (3) internal modules (`./` and `../`).
- Prefer explicit return types on exported functions.
- Keep functions short and early-return when possible.

### Critical Don't-Miss Rules

- Do not write to stdout/stderr during plugin runtime (interferes with OpenCode TUI); log to file only.
- Do not re-ingest injected memory context; preserve injection-marker filtering when changing injection/extraction.
- Do not do async work inside SQLite transactions; keep transactions minimal and always rollback on error.
- Do not bypass scope filtering after vector retrieval: selected memories must always be global or match current worktree to avoid cross-project leakage.
- Do not allow project scope to degrade to `/` or empty; when project is undetermined, return/inject global-only memories to prevent cross-project leakage.
- Do not store oversized/unsafe payloads as memories (URLs/clipboard dumps/stack traces); keep stored summaries short and user-sourced.
- Do not use Worker threads for embeddings; use Node.js child process to avoid Bun/ONNX native module crashes.
- Do not skip WAL mode on SQLite; it's required for concurrent read/write performance.
- Do not change the embedding worker communication protocol (IPC message-based with UUID correlation) without updating both `embeddings-nlp.ts` and `embedding-worker.ts`.
- Do not make adaptive quota/compression mandatory: both are opt-in and must fail-open to preserve base injection behavior.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code.
- Follow ALL rules exactly as documented.
- When in doubt, prefer the more restrictive option.
- Update this file if new patterns emerge.

**For Humans:**

- Keep this file lean and focused on agent needs.
- Update when the technology stack changes.
- Review quarterly for outdated rules.
- Remove rules that become obvious over time.

Last Updated: 2026-03-22T22:10:00-05:00
