# Repository Agent Guide (AGENTS.md)

This repo is a Bun + TypeScript OpenCode plugin that provides persistent memory via SQLite and RuVector.
This file is the definitive guide for agentic coding tools (like Cursor, Copilot, OpenCode) operating here.

## Quick Start & Commands

The project uses `bun` as the primary runtime and package manager.

- **Install:** `bun install`
- **Typecheck:** `bun run typecheck` (runs `tsc --noEmit`)
- **Build:** `bun run build`
  - Bundles `src/index.ts` to `dist/index.js` (Bun bundler)
  - Emits TS declarations (`tsc --emitDeclarationOnly`)
  - Bundles worker `src/memory/embedding-worker.ts` to `dist/memory/`
- **Dev watch:** `bun run dev` (watches `src/index.ts` -> `dist/`)

## Testing (Bun Test)

There are currently no `*.test.ts` / `*.spec.ts` files. If/when tests exist, use Bun's test runner:

- Run all tests: `bun test`
- Run a single test file: `bun test src/foo.test.ts`
- Run tests by filename pattern: `bun test memory classifier`
- Run a single test by name (regex): `bun test --test-name-pattern "my test name"`
- Re-run a flaky test file: `bun test src/foo.test.ts --rerun-each 20`

## Linting & Formatting

- No linter/formatter is configured (no ESLint/Prettier/Biome configs).
- **Rule:** Keep edits consistent with existing style and rely heavily on `bun run typecheck`.

## Repository-Specific Rules & Context

- **Cursor / Copilot:** No `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md` exist.
- **CI / Release:** Pushes to `main` with `package.json` changes trigger a GitHub Action to publish to npm.

## Project Method & References

- **Method:** This repository uses BMAD Method for project workflow and coordination.
- **BMAD base config:** `_bmad/`
- **Project management artifacts:** `_bmad-output/`
- **Project documentation root:** `docs/`
- **BMAD guide (official):** https://docs.bmad-method.org/llms-full.txt
- **BMAD guide (local copy):** `docs/bmad-method/llms-full.txt`
- **Upstream fork origin:** https://github.com/rizal72/true-mem
- **RuVector docs index:** https://github.com/ruvnet/RuVector/blob/main/docs/INDEX.md
- **RuVector npm package README:** https://github.com/ruvnet/RuVector/blob/main/npm/packages/ruvector/README.md

## Code Style Guidelines

### 1. Language, Modules, and Compilation

- **Strict TypeScript:** `strict: true` in `tsconfig.json`.
- **ESM Project:** `package.json` has `"type": "module"`.
- **Imports:** Use `.js` extensions for relative TypeScript imports.
  - ✅ Good: `import { log } from './logger.js'`
  - ❌ Bad: `import { log } from './logger'` or `./logger.ts`

### 2. Formatting and General Style

- **Indentation:** 2 spaces.
- **Quotes:** Single quotes (`'`).
- **Semicolons:** Semicolons are explicitly used; keep them.
- **Structure:** Keep functions short and early-return when possible.

### 3. Imports Grouping

- Prefer `import type { ... }` for types.
- Avoid `any`; use `unknown` and type-narrow.
- Grouping:
  1. Node built-ins (`fs`, `path`, `crypto`)
  2. External deps (`@opencode-ai/*`, `uuid`, `ruvector`)
  3. Internal modules (`./` and `../`)

### 4. Types and Naming

- `PascalCase` for classes, types, interfaces.
- `camelCase` for functions, methods, variables.
- `UPPER_SNAKE_CASE` for module-level constants.
- Prefer explicit return types on exported functions.
- For optional properties:
  - In TypeScript objects: prefer `undefined`
  - At persistence boundaries (SQLite): use `null`

### 5. Error Handling and Logging

- **Fail-Open:** Hooks should catch errors, log them, and continue whenever safe.
- Only `throw` when the caller can safely handle it (e.g. init failures).
- Use the file logger `log()` (`src/logger.ts`) instead of `console.*` (interferes with TUI).
- Keep hook handlers fast. Prefer fire-and-forget async patterns for non-critical work.

### 6. Transactions, Async Work, and SQLite

- Keep async work (like similarity search) out of SQLite `BEGIN TRANSACTION` blocks.
- On any error inside a transaction, ensure `ROLLBACK` is executed.

### 7. Config and JSONC

- Config files are JSONC.
- Parsing: strip comments then `JSON.parse` (`src/utils/jsonc.ts`).
- Writing: preserve explanatory comments (`src/config/config.ts`).
- Read config as untrusted; catch errors and fall back to defaults.

## Runtime Files / Paths

Code uses `~/.ai-vector-memories/` for runtime state. Do not blindly rename/delete on user machines.

- **Debug log:** `~/.ai-vector-memories/plugin-debug.log`
- **Config:** `~/.ai-vector-memories/config.jsonc`
- **Worktree cache:** `~/.ai-vector-memories/.worktree-cache`
- **Database:** from `PsychMemConfig.dbPath`

## Feature Flags / Env Vars

- `TRUE_MEM_INJECTION_MODE`: `0` session-start only, `1` every prompt
- `TRUE_MEM_SUBAGENT_MODE`: `0` disable injection into sub-agents, `1` enable
- `TRUE_MEM_MAX_MEMORIES`: number of memories to inject
- `TRUE_MEM_EMBEDDINGS`: `0` Jaccard-only, `1` hybrid

## Practical Agent Tips

- Before changing hooks, scan for hot-reload handling (`src/index.ts`) and debounce logic (`src/adapters/opencode/index.ts`).
- Prevent memory self-ingestion (filter logic in `src/adapters/opencode/index.ts`).
- Prefer small, safe edits; this runs inside a host process.
