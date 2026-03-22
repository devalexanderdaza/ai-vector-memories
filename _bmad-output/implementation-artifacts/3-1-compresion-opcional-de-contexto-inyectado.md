# Story 3.1: Compresión opcional de contexto inyectado

Status: ready-for-dev

## Story

As a injection system,
I want to compress low-priority memories when budget is tight,
so that token usage is reduced without losing key signals.

## Acceptance Criteria

1. El modo de compresión es opcional y configurable.
2. Constraints y decisions no se degradan por debajo de umbral mínimo de presencia.
3. La reducción promedio de tokens supera el baseline inicial.

## Description

Como sistema de inyección, quiero comprimir memorias de baja prioridad cuando falte presupuesto, para reducir tokens sin perder señales clave.

## Technical Details

### Problem Statement

Currently, when the token budget is tight, `applyTokenBudget()` in `injection.ts` simply **skips** low-priority memories entirely. This means:
- Useful contextual information (semantic, episodic) is lost
- There's no middle ground between "full summary" and "not included"

### Solution: Proportional Summary Truncation

Implement **proportional summary truncation** that:
1. First, attempts to fit all selected memories with full summaries
2. If token budget is exceeded, compress summaries of **low-priority tiers only** (Tier 2 and Tier 3)
3. Tier 0 (constraints) and Tier 1 (preference, decision) are **never compressed below minimum presence**
4. Truncation uses intelligent word-boundary cutting with ellipsis
5. Configuration controls compression aggressiveness

### Key Components to Implement

1. **CompressionConfig interface** in `src/types/config.ts`:
   - `enabled`: boolean toggle
   - `maxCompressionRatio`: 0.0-1.0 (how much to truncate, e.g. 0.5 = keep 50%)
   - `minSummaryLength`: minimum characters to preserve
   - `excludedTiers`: tiers that cannot be compressed

2. **Compression functions** in `src/memory/compression.ts` (new file):
   - `compressMemorySummary(memory, maxChars, minLength)`: truncate with ellipsis
   - `applyCompression(memories, maxTokens, config)`: compress low-tier memories to fit budget
   - `getCompressibleTiers(config)`: returns [2, 3] by default

3. **Config integration** in `src/config/config.ts`:
   - Add `TRUE_MEM_COMPRESSION_ENABLED` env var
   - Add `compression` field to `TrueMemUserConfig`
   - Update `generateConfigWithComments()` to include compression settings

4. **Injection integration** in `src/adapters/opencode/injection.ts`:
   - Call compression after `selectMemoriesForInjection()` if budget still exceeded
   - Or integrate into `applyTokenBudget()` as a second-pass
   - Log compression events for telemetry

5. **Metrics tracking** in `src/memory/injection-metrics.ts`:
   - Track `compressionEvents` count
   - Track `tokensSavedByCompression`
   - Update TARGET_TOKEN_REDUCTION_PERCENT (currently 25%)

### Compression Strategy

```
Selected memories (pre-compression):
┌─────────────────────────────────────────────────────────┐
│ Tier 0: constraint [MAX 10] ──────► NEVER COMPRESS     │
│ Tier 1: preference, decision ──────► NEVER COMPRESS     │
│ Tier 2: learning, procedural ─────► COMPRESS IF NEEDED  │
│ Tier 3: semantic, episodic ───────► COMPRESS FIRST      │
└─────────────────────────────────────────────────────────┘

If token budget still exceeded after full-slot allocation:
1. Try compressing Tier 3 summaries (semantic, episodic)
2. If still over budget, compress Tier 2 summaries (learning, procedural)
3. Tier 0 and Tier 1 are never compressed (minimum presence guaranteed)
```

### Configuration Defaults

```typescript
const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  enabled: false,           // OFF by default (opt-in)
  maxCompressionRatio: 0.5, // Keep 50% of summary
  minSummaryLength: 50,     // Minimum characters to preserve
  excludedTiers: [0, 1],    // Never compress constraints/preferences/decisions
};
```

### File Structure

```
src/
├── types/
│   └── config.ts              # Add CompressionConfig
├── config/
│   └── config.ts              # Add compression config loading
├── memory/
│   └── compression.ts        # NEW - compression functions
└── adapters/opencode/
    └── injection.ts           # Integrate compression
```

### Related Components

- `src/adapters/opencode/injection.ts`: `selectMemoriesForInjection()`, `applyTokenBudget()`
- `src/memory/injection-metrics.ts`: Metrics tracking
- `src/config/config.ts`: Configuration loading

### Dependencies

- Story 1.2: Presupuesto estricto de tokens en selección (existing `applyTokenBudget`)
- Story 1.3: Trazabilidad de selección de memorias (existing telemetry)
- Story 2.1: Score híbrido configurable (existing scoring system)

## Tasks / Subtasks

- [ ] Add CompressionConfig interface to src/types/config.ts (AC: #1)
  - [ ] Define CompressionConfig interface with enabled, maxCompressionRatio, minSummaryLength, excludedTiers
  - [ ] Add compression field to TrueMemUserConfig with default
- [ ] Add compression config loading to src/config/config.ts (AC: #1)
  - [ ] Add TRUE_MEM_COMPRESSION_ENABLED env var parsing
  - [ ] Update loadConfig() to include compression settings
  - [ ] Update generateConfigWithComments() to include compression
  - [ ] Add saveConfig() support for compression settings
- [ ] Create src/memory/compression.ts with compression functions (AC: #2, #3)
  - [ ] Implement compressMemorySummary(memory, maxChars, minLength)
  - [ ] Implement intelligent truncation with word-boundary detection
  - [ ] Implement applyCompression(memories, maxTokens, config)
  - [ ] Implement getCompressibleTiers(config) helper
  - [ ] Add logging for compression events
- [ ] Integrate compression into injection.ts (AC: #1, #2, #3)
  - [ ] Load compression config in selectMemoriesForInjection()
  - [ ] Apply compression as second-pass after slot allocation
  - [ ] Ensure Tier 0 and Tier 1 are never compressed (minimum presence)
  - [ ] Add compression events to telemetry
- [ ] Add compression metrics tracking to injection-metrics.ts (AC: #3)
  - [ ] Track compressionEvents count
  - [ ] Track tokensSavedByCompression
  - [ ] Verify 25%+ token reduction target
- [ ] Write tests for compression.ts (AC: #3)
  - [ ] Test compressMemorySummary with various lengths
  - [ ] Test applyCompression with tier prioritization
  - [ ] Test that Tier 0/1 are never compressed
  - [ ] Test edge cases (empty summaries, very short summaries)
- [ ] Run typecheck and build verification (AC: #1)
  - [ ] bun run typecheck passes
  - [ ] bun run build succeeds

## Dev Notes

### Relevant Architecture Patterns and Constraints

- **Fail-open**: Compression must not throw errors; if compression fails, fall back to original behavior
- **Hook performance**: Compression should be synchronous and fast (no async/await in hot paths)
- **No LLM summarization**: Use simple truncation, not external AI summarization (too slow for hooks)
- **Config-driven**: Compression is opt-in via config, not automatic
- **Telemetry**: Log compression events for metrics

### Source Tree Components to Touch

- `src/types/config.ts` - Add CompressionConfig interface
- `src/config/config.ts` - Add compression config loading
- `src/memory/compression.ts` - NEW compression functions
- `src/adapters/opencode/injection.ts` - Integrate compression
- `src/memory/injection-metrics.ts` - Add compression metrics

### Testing Standards Summary

- Unit tests for compression functions (Bun test runner)
- Integration test for injection with compression enabled
- Verify Tier 0/1 are never compressed
- Verify token reduction exceeds 25% baseline

## Project Structure Notes

- Alignment with existing project patterns (ESM, strict TS, singleton services)
- Follow existing import grouping: Node built-ins → external deps → internal modules
- Follow 2-space indent, single quotes, semicolons

## References

- [Source: src/adapters/opencode/injection.ts] - Existing token estimation and budget application
- [Source: src/types/config.ts] - TrueMemUserConfig interface
- [Source: src/config/config.ts] - Configuration loading pattern
- [Source: src/memory/injection-metrics.ts] - Metrics tracking pattern
- [Source: _bmad-output/implementation-artifacts/2-1-score-hibrido-configurable.md] - Previous configurable system pattern

## Previous Story Intelligence

### Story 2.1 - Hybrid Scoring (pattern to follow)

- Created HybridScoreConfig interface with configurable weights
- Loaded config via `loadHybridScoreConfig()` helper
- Used defaults in `DEFAULT_HYBRID_SCORE_CONFIG` constant
- Integrated into injection via `assessMemoryRelationship()`
- Pattern: interface → defaults → loader → integration

### Story 2.2 - Reconsolidation Tests

- Tests stored in `src/memory/reconsolidate.test.ts`
- Used Bun test runner
- Pattern: one describe() per scenario type (duplicate, conflict, complement)

### Story 4.1 - Integration Tests

- Tests stored in `src/memory/integration-retrieval-injection.test.ts`
- Used Bun test runner
- Pattern: test full injection flow with mock database

## Git Intelligence Summary

Recent commits showing established patterns:
- `b40b2e4` - feat: add hybrid scoring, reconsolidation tests, integration test suite
- `c6f3dbc` - feat(memory): implement structured logging for memory selection with fail-open telemetry
- `aaee7d5` - feat(memory): implement strict token budget and tiered prioritization
- `f0d5ccb` - feat(memory): centralize runtime embeddings flag access

Key patterns:
- ESM TypeScript with `.js` extensions in imports
- Singleton service pattern via `getInstance()`
- Fail-open error handling in hooks
- File-based logging via `log()` from `src/logger.ts`
- Bun test runner for tests

## Latest Technical Information

### RuVector / Embeddings Context

- RuVector uses HNSW with cosine distance, 384-dim vectors
- Embeddings service falls back to Jaccard when unavailable
- No LLM summarization available in this plugin

### Config Priority

ENV vars > config.jsonc > defaults
Naming convention: `TRUE_MEM_*` prefix

## Project Context Reference

- **Technology**: TypeScript ^5.9.3, Bun runtime, ESM, strict mode
- **Hook rules**: Fail-open, fast paths, no stdout, file logging only
- **Memory tiers**: 0=constraint, 1=preference/decision, 2=learning/procedural, 3=semantic/episodic
- **Token estimation**: `Math.ceil(text.length / 4)` heuristic
- **Compression**: Simple truncation only, no external AI

## Dev Agent Record

### Agent Model Used

opencode/minimax-m2.5-free

### Debug Log References

- Logger file: ~/.ai-vector-memories/plugin-debug.log

### Completion Notes List

### File List

- src/types/config.ts (modified)
- src/config/config.ts (modified)
- src/memory/compression.ts (new)
- src/adapters/opencode/injection.ts (modified)
- src/memory/injection-metrics.ts (modified)
- src/memory/compression.test.ts (new)
