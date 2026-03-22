# Architecture

## System Summary

ai-vector-memories is an event-driven OpenCode plugin. It registers hooks early, initializes lightweight dependencies fast, and processes heavier memory work asynchronously.

## Design Goals

- Keep host interactions responsive
- Preserve memory quality over time
- Avoid cross-project memory leakage
- Fail open on recoverable runtime errors

## Runtime Flow

1. Plugin entrypoint registers hooks immediately.
2. Initialization sets up config, storage, and retrieval services.
3. Hook events trigger extraction/retrieval logic.
4. Retrieval pipeline selects scoped memories and injects them.
5. Background processing updates memory stores and metrics.

## Main Components

### Plugin Bootstrap

- Path: src/index.ts
- Responsibilities:
  - initialize plugin state
  - guard hot reload behavior
  - delegate to adapter hooks
  - enforce non-blocking and fail-open patterns

### Adapter Layer

- Path: src/adapters/opencode/
- Responsibilities:
  - OpenCode hook integration
  - chat and tool lifecycle wiring
  - filtering to avoid memory self-ingestion

### Memory Layer

- Path: src/memory/
- Responsibilities:
  - classification and scoring
  - retrieval ranking
  - reconsolidation decisions
  - optional compression
  - adaptive quota behavior
  - metrics collection and reporting

### Extraction Queue

- Path: src/extraction/queue.ts
- Responsibilities:
  - asynchronous extraction scheduling
  - backpressure-friendly processing

### Storage Layer

- Path: src/storage/
- Responsibilities:
  - SQLite access and persistence
  - transaction-safe operations
  - memory query primitives

## Data and Retrieval Strategy

- SQLite stores memory units and metadata
- Lexical similarity (Jaccard) provides fast baseline retrieval
- Optional embeddings add semantic matching for hybrid search
- Reconsolidation classifies new information as:
  - duplicate
  - conflict
  - complement

## Operational Safety Rules

- Keep async heavy work outside transaction blocks
- Roll back transactions on errors
- Use file logging instead of console output
- Continue gracefully on non-critical failures

## Build and Artifact Model

- Plugin bundle: dist/index.js
- Type declarations: dist/index.d.ts
- Worker bundle: dist/memory/embedding-worker.js

## Related Docs

- [Project Overview](./project-overview.md)
- [Development Guide](./development-guide.md)
- [Source Tree Analysis](./source-tree-analysis.md)
