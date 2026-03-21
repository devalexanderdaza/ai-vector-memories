---
project_name: 'ai-vector-memories'
user_name: 'Alex'
date: '2026-03-21T14:24:34-05:00'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns']
existing_patterns_found: 0
status: 'complete'
optimized_for_llm: true
rule_count: 33
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- Language: TypeScript ^5.9.3 (`strict: true`, target ES2022, ESM)
- Runtime/Host: OpenCode plugin (`@opencode-ai/plugin` ^1.2.27, `@opencode-ai/sdk` ^1.2.27)
- Build tooling: Bun (bundles to `dist/`), `tsc --emitDeclarationOnly`
- CI/Release: GitHub Actions publishes on `main` when `package.json` changes; Node.js 22 used for publish
- Storage: SQLite (runtime-agnostic adapter for Bun + Node); default DB `~/.ai-vector-memories/memory.db`
- Vector/search: `ruvector` ^0.2.16 (local `~/.ai-vector-memories/ruvector.db`)
- IDs: `uuid` ^13.0.0
- Optional NLP embeddings: `@huggingface/transformers` ^4.0.0-next.1 (worker-style, enabled via config/env)

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- Strict TS is enforced (`tsconfig.json`): no implicit returns, no fallthrough in switch, `noUncheckedIndexedAccess`; avoid “works at runtime” code that fails typecheck.
- ESM project: keep relative imports with `.js` extensions in TS source (e.g. `import { log } from './logger.js'`), don’t use extensionless relative imports.
- Prefer `import type { ... }` for type-only imports to keep runtime output clean.
- Avoid `any`; use `unknown` and narrow.
- Keep formatting consistent with repo: 2-space indent, single quotes, semicolons.

### Framework-Specific Rules (OpenCode Plugin)

- Hooks must be fail-open: catch/log errors and continue when safe; don’t crash the host TUI.
- Avoid stdout/stderr during runtime; use file logger `log()` (`src/logger.ts`) only.
- Keep hook paths fast/non-blocking: prefer fire-and-forget for non-critical work; debounce noisy events (`message.updated`).
- Memory injection/extraction safety: never re-ingest injected context; preserve and respect injection markers filtering.
- Runtime state lives in `~/.ai-vector-memories/` (config JSONC, logs, DB, worktree cache); don’t change paths casually.
- SQLite: keep async work out of transactions; always `ROLLBACK` on transaction errors; close resources via shutdown handlers.

### Testing Rules

- No automated tests are currently present; validate changes with `bun run typecheck` and `bun run build`.
- If adding tests later, prefer Bun’s test runner (`bun test`) and keep tests fast (this runs inside a host process).

### Code Quality & Style Rules

- No linter/formatter is configured; keep edits consistent with existing style (2-space indent, single quotes, semicolons).
- Prefer small, safe changes: this plugin runs inside another host process; avoid blocking or heavy synchronous work in hooks.
- Logging: use `src/logger.ts` (`log()`), keep logs concise, and avoid logging secrets/large payloads.
- Keep config files JSONC and parse via `src/utils/jsonc.ts`; treat config as untrusted and fail-open with defaults.

### Development Workflow Rules

- Before shipping: run `bun run typecheck` and `bun run build`.
- Release automation: pushing to `main` with `package.json` changes triggers npm publish + GitHub Release (`.github/workflows/release.yml`).
- Avoid changing publish-critical metadata casually (`package.json` name/version/exports/files).

### Critical Don't-Miss Rules

- Do not write to stdout/stderr during plugin runtime (it can interfere with the OpenCode TUI); log to file only.
- Do not re-ingest injected memory context; preserve injection-marker filtering when changing injection/extraction.
- Do not do async work inside SQLite transactions; keep transactions minimal and always rollback on error.
- Do not allow project scope to degrade to `/` or empty; when project is undetermined, return/inject global-only memories to prevent cross-project leakage.
- Do not store oversized/unsafe payloads as memories (URLs/clipboard dumps/stack traces); keep stored summaries short and user-sourced.

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

Last Updated: 2026-03-21T14:24:34-05:00
