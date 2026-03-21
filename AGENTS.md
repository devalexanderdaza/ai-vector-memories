# Repository Agent Guide (AGENTS.md)

This repo is a Bun + TypeScript OpenCode plugin that provides persistent "memory"
(SQLite + optional embeddings/RuVector). This file is for agentic coding tools
operating inside this repository.

If you add new tooling (lint/tests/format), update this file.

## Quick Start

- Install: `bun install`
- Typecheck: `bun run typecheck`
- Build: `bun run build`
- Dev watch: `bun run dev`

## Commands (Build / Lint / Test)

Build
- `bun run build`
  - Bundles `src/index.ts` to `dist/index.js` (Bun bundler)
  - Emits TypeScript declarations (`tsc --emitDeclarationOnly`)
  - Bundles worker `src/memory/embedding-worker.ts` to `dist/memory/`

Development
- `bun run dev`
  - Watches and rebuilds `src/index.ts` into `dist/`

Typecheck
- `bun run typecheck` (runs `tsc --noEmit`)

Lint / Format
- No linter/formatter is configured (no ESLint/Prettier/Biome configs or scripts).
- Keep edits consistent with existing style and rely on `bun run typecheck`.

Tests
- There are currently no `*.test.ts` / `*.spec.ts` files in this repo.
- If/when tests exist, use Bun's test runner:
  - Run all tests: `bun test`
  - Run a single test file: `bun test src/foo.test.ts`
  - Run tests by filename pattern(s): `bun test memory classifier`
  - Run a single test by name (regex): `bun test --test-name-pattern "my test name"`
  - Re-run a flaky test file: `bun test src/foo.test.ts --rerun-each 20`

CI / Release
- GitHub Action publishes to npm on pushes to `main` when `package.json` changes:
  - `.github/workflows/release.yml`

## Repository-Specific Rules (Cursor / Copilot)

- No `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md` found.

If any of these files are added later, they override this document.

## Runtime Files / Paths

Important: code uses `~/.ai-vector-memories/` for runtime state. Some documentation may
still mention `~/.ai-vector-memories/`; do not blindly rename/delete either on
user machines.

- Debug log: `~/.ai-vector-memories/plugin-debug.log` (`src/logger.ts`)
- Config (JSONC): `~/.ai-vector-memories/config.jsonc` (`src/config/config.ts`)
- Worktree cache: `~/.ai-vector-memories/.worktree-cache` (`src/adapters/opencode/index.ts`)
- Database path: from `PsychMemConfig.dbPath` (default comes from `src/config.ts`)

OpenCode config
- Plugin list: `~/.config/opencode/opencode.jsonc`

## Feature Flags / Env Vars

- `TRUE_MEM_INJECTION_MODE`: `0` session-start only, `1` every prompt
- `TRUE_MEM_SUBAGENT_MODE`: `0` disable injection into sub-agents, `1` enable
- `TRUE_MEM_MAX_MEMORIES`: number of memories to inject
- `TRUE_MEM_EMBEDDINGS`: `0` Jaccard-only, `1` hybrid (embeddings worker)

## Code Style Guidelines

### Language, modules, and compilation

- TypeScript with `strict: true` (`tsconfig.json`).
- ESM project (`package.json` has `"type": "module"`).
- Keep TS relative imports using `.js` extensions (Bun/Node ESM):
  - Good: `import { log } from './logger.js'`
  - Avoid: `import { log } from './logger'` or `./logger.ts`

### Formatting and general style

- Indentation: 2 spaces.
- Quotes: single quotes.
- Semicolons: used; keep them.
- Keep functions short and early-return when possible.

### Imports

- Prefer `import type { ... }` for types.
- Avoid `any`; use `unknown` and narrow.
- Keep a simple import grouping:
  1) Node built-ins (`fs`, `path`, `os`, `crypto`)
  2) External deps (`@opencode-ai/*`, `uuid`, `ruvector`)
  3) Internal modules (relative `./` and `../`)

### Types and naming

- Naming conventions:
  - `PascalCase` for classes, types, interfaces
  - `camelCase` for functions, methods, variables
  - `UPPER_SNAKE_CASE` for module-level constants
- Prefer explicit return types on exported functions when not obvious.
- For optional properties:
  - In TypeScript objects: prefer `undefined` (idiomatic optional)
  - At persistence boundaries (SQLite): use `null` as needed

### Error handling and logging

- This is an OpenCode plugin; hooks should be "fail-open":
  - Catch errors, log them, and continue whenever safe.
  - Only throw when the caller can safely handle it (e.g. init failures).
- Use the file logger `log()` (`src/logger.ts`) instead of `console.*`.
- Keep hook handlers fast; avoid blocking UI.
  - Prefer fire-and-forget async patterns for non-critical work (see `src/index.ts`).

### Transactions, async work, and SQLite

- Keep async work out of SQLite transactions.
  - Example pattern: do similarity search before `BEGIN TRANSACTION`.
- On any error inside a transaction:
  - Ensure `ROLLBACK` happens.
  - Re-throw or convert to a typed error as appropriate.

### Config and JSONC

- Config files are JSONC.
  - Parsing: strip comments then `JSON.parse` (`src/utils/jsonc.ts`).
  - Writing: preserve explanatory comments (`src/config/config.ts`).
- When reading config:
  - Treat it as untrusted; catch and log parse errors.
  - Fall back to defaults.

### OpenCode-specific behavior

- Avoid writing to stdout/stderr during plugin runtime; it can interfere with the TUI.
- Be careful with memory injection markers; do not re-ingest injected content.
  - Filtering exists in `src/adapters/opencode/index.ts`.

## Release Workflow Notes

- Automation: push to `main` with updated `package.json` triggers npm publish.
- Version bump commands used in this repo:
  - `npm version patch -m "release: v%s - <SHORT_REASON>"`
  - `npm version minor -m "release: v%s - <SHORT_REASON>"`
  - `npm version major -m "release: v%s - <SHORT_REASON>"`

## Practical Agent Tips

- Before changing behavior in hooks, scan for:
  - Hot-reload handling (`src/index.ts`)
  - Debounce/queue logic (`src/extraction/queue.ts`, `src/adapters/opencode/index.ts`)
  - Scope leakage safeguards (`src/storage/database.ts`, `src/adapters/opencode/index.ts`)
- Prefer small, safe edits: this plugin runs inside another host process.
