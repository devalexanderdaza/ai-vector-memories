# Source Tree Analysis

## High-Level Layout

```text
ai-vector-memories/
├── src/                    # Source code
│   ├── adapters/           # OpenCode integration points
│   ├── commands/           # CLI-like command handlers (reports, utilities)
│   ├── config/             # Runtime config loading and state helpers
│   ├── extraction/         # Async extraction queue
│   ├── memory/             # Core memory logic, scoring, retrieval, tests
│   ├── storage/            # SQLite persistence and query layer
│   ├── templates/          # Prompt/template helpers
│   ├── types/              # Shared type definitions
│   ├── index.ts            # Plugin entrypoint
│   ├── logger.ts           # File logger
│   └── shutdown.ts         # Shutdown and cleanup helpers
├── scripts/                # Utility scripts (metrics and reports)
├── docs/                   # Project documentation
├── _bmad/                  # BMAD framework assets and configs
├── _bmad-output/           # BMAD planning and implementation artifacts
├── package.json            # Scripts, dependencies, metadata
└── tsconfig.json           # TypeScript compiler settings
```

## Folder-by-Folder Notes

### src/adapters/

Contains integration logic with OpenCode runtime events and plugin hooks.

### src/memory/

Primary domain layer:

- classification and pattern handling
- similarity and ranking
- reconsolidation logic
- quota and compression strategy
- metrics and integration tests

### src/storage/

SQLite access and transaction-aware persistence operations.

### src/config/

Config parsing, runtime overrides, and environment-driven flags.

### src/commands/

Entrypoints for command/report behavior used during diagnostics and metrics generation.

### scripts/

Standalone scripts supporting operational reporting.

## Test Location Pattern

Tests are colocated with source in several areas, especially:

- src/memory/\*.test.ts
- src/commands/\*.test.ts

## Documentation and Process Areas

- docs/: developer-facing project docs
- \_bmad/: BMAD method configuration and modules
- \_bmad-output/: generated planning/implementation artifacts

## Related Docs

- [Architecture](./architecture.md)
- [Development Guide](./development-guide.md)
- [Project Overview](./project-overview.md)
