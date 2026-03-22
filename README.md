# AI Vector Memories for OpenCode

Persistent memory plugin for OpenCode with SQLite + RuVector retrieval and cognitive memory management.

## Why This Project Exists

AI coding sessions lose context quickly. This plugin stores reusable knowledge from conversations so the assistant can remember:

- User preferences
- Project decisions
- Long-lived constraints
- High-signal semantic facts

The goal is practical continuity across sessions with low runtime overhead.

## What You Get

- Persistent memory with global and project scopes
- Hybrid retrieval (Jaccard + optional embeddings)
- Decision-aware reconsolidation (duplicate/conflict/complement)
- Injection quotas and optional adaptive balancing
- Optional compression under token pressure
- Fail-open plugin behavior to avoid blocking host workflows

## Quick Start

### 1. Install in OpenCode

Add the plugin name to your OpenCode config:

```jsonc
{
  "plugin": ["ai-vector-memories"],
}
```

Restart OpenCode.

### 2. Runtime Directory

On first run, the plugin creates:

- `~/.ai-vector-memories/config.jsonc`
- `~/.ai-vector-memories/plugin-debug.log`
- SQLite database files (path controlled by config)

### 3. Local Development Setup

```bash
bun install
bun run typecheck
bun run build
```

## Configuration

Default config file: `~/.ai-vector-memories/config.jsonc`

```jsonc
{
  "injectionMode": 1,
  "subagentMode": 1,
  "embeddingsEnabled": 0,
  "maxMemories": 20,
}
```

### Config Fields

- `injectionMode`
  - `0`: inject only at session start
  - `1`: inject on every prompt
- `subagentMode`
  - `0`: disable injection in subagents
  - `1`: enable injection in subagents
- `embeddingsEnabled`
  - `0`: Jaccard-only retrieval
  - `1`: hybrid retrieval with embeddings
- `maxMemories`
  - max items injected per prompt

### Environment Variable Overrides

- `TRUE_MEM_INJECTION_MODE`
- `TRUE_MEM_SUBAGENT_MODE`
- `TRUE_MEM_EMBEDDINGS`
- `TRUE_MEM_MAX_MEMORIES`

## Common Commands

- `bun run dev`: watch and rebuild plugin bundle
- `bun run build`: production build + type declarations + worker bundle
- `bun run typecheck`: strict TypeScript validation
- `bun run metrics:injection`: injection metrics snapshot
- `bun run metrics:report`: baseline/current metrics report

## Architecture at a Glance

- `src/index.ts`: plugin bootstrap, hook registration, fail-open runtime behavior
- `src/adapters/opencode/`: OpenCode integration and hook handling
- `src/memory/`: classification, retrieval, reconsolidation, quotas, compression
- `src/extraction/`: async extraction queue
- `src/storage/`: SQLite access and persistence logic

Read the full architecture guide: [docs/architecture.md](docs/architecture.md).

## For New Developers

Use this reading order:

1. [docs/index.md](docs/index.md)
2. [docs/project-overview.md](docs/project-overview.md)
3. [docs/architecture.md](docs/architecture.md)
4. [docs/development-guide.md](docs/development-guide.md)
5. [docs/source-tree-analysis.md](docs/source-tree-analysis.md)

## Troubleshooting

- Plugin appears loaded but no memory injection:
  - Check `~/.ai-vector-memories/plugin-debug.log`
  - Confirm `injectionMode` and `maxMemories`
- Unexpected retrieval behavior:
  - Verify `embeddingsEnabled` and related model initialization
  - Inspect reconsolidation and scoring settings in config
- Build issues:
  - Run `bun install` again
  - Run `bun run typecheck` and resolve reported errors first

## Contributing

Contributions are welcome.

- Keep TypeScript strictness intact
- Preserve fail-open behavior in runtime hooks
- Keep async heavy work out of transaction blocks
- Prefer small, focused pull requests

## References

- [AGENTS.md](AGENTS.md): repository conventions for coding agents
- [docs/index.md](docs/index.md): complete documentation map
- RuVector docs: https://github.com/ruvnet/RuVector/blob/main/docs/INDEX.md

## License

MIT. See [LICENSE](LICENSE).
