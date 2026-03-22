# Development Guide

## Prerequisites

- Bun installed and available in PATH
- Git and a local clone of this repository
- Basic familiarity with OpenCode plugin workflows

## Setup

1. Install dependencies:

```bash
bun install
```

2. Validate typing:

```bash
bun run typecheck
```

3. Build the project:

```bash
bun run build
```

## Daily Development Commands

- Development watch build:

```bash
bun run dev
```

- Full build:

```bash
bun run build
```

- Type checking:

```bash
bun run typecheck
```

- Injection metrics report:

```bash
bun run metrics:injection
```

- Baseline/current metrics report:

```bash
bun run metrics:report
```

## Testing Notes

- The repository contains test files under src/, especially in src/memory/ and src/commands/.
- AGENTS guidance recommends Bun test commands when running tests.
- If you run tests locally, prefer focused execution when iterating.

## Coding Conventions

- TypeScript strict mode is mandatory.
- Use ESM-style imports with .js extensions for relative paths.
- Prefer import type for type-only imports.
- Avoid any when unknown + narrowing is possible.
- Use src/logger.ts for runtime logs (avoid console output).

## Reliability Guidelines

- Keep plugin hooks fast and non-blocking.
- Use fail-open behavior for recoverable hook errors.
- Keep expensive async operations outside SQLite transaction boundaries.
- Ensure rollbacks happen on transaction failures.

## Typical Change Workflow

1. Create a focused branch.
2. Implement small, scoped changes.
3. Run typecheck.
4. Run relevant tests.
5. Rebuild bundles.
6. Update docs when behavior changes.

## Troubleshooting

- Build errors:
  - run bun install to refresh dependencies
  - run bun run typecheck to isolate TS issues
- Runtime plugin issues:
  - inspect ~/.ai-vector-memories/plugin-debug.log
- Memory retrieval quality issues:
  - verify config flags and maxMemories settings

## Related Docs

- [Architecture](./architecture.md)
- [Deployment Guide](./deployment-guide.md)
- [README](../README.md)
