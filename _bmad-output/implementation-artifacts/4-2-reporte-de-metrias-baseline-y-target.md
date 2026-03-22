# Story 4.2: Reporte de metricas baseline y target

Status: review

## Story

As a technical lead,
I want a baseline and target metrics report for the memory system,
so that I can make data-driven decisions about when to promote changes to production.

## Acceptance Criteria

1. Se publica baseline de recall, precision top-5, tokens promedio y latencia p95.
2. Se registran targets de salida por fase.
3. El reporte se puede regenerar con un comando documentado.

## Description

Como responsable tecnico, quiero un reporte de baseline y target de memoria, para decidir cuando promover cambios a produccion.

El sistema de metricas ya existe en `src/memory/injection-metrics.ts` con `InjectionMetricsCollector`. Esta historia extiende esa funcionalidad para:
1. Generar reportes formateados (JSON/Markdown) con metricas comparativas baseline vs actual
2. Crear un comando CLI documentado para regenerar el reporte bajo demanda
3. Definir targets de salida claros por fase (MVP, Beta, GA)

## Tasks / Subtasks

- [x] Extend InjectionMetricsCollector with report generation (AC: #1, #2)
  - [x] Add `generateReport(format: 'json' | 'markdown')` method
  - [x] Include recall proxy metric (memories selected vs pool available)
  - [x] Include precision-top-5 proxy metric (high-tier memories in first 5 selected)
  - [x] Include avgTokensUsed, avgTokenUsagePercent, p95SelectionLatencyMs
  - [x] Format baseline vs current comparison clearly
  - [x] Add phase targets section with defined thresholds
- [x] Define phase targets as constants (AC: #2)
  - [x] MVP targets: p95 < 120ms (no embeddings), token reduction >= 0%
  - [x] Beta targets: p95 < 250ms (with embeddings), token reduction >= 15%
  - [x] GA targets: token reduction >= 25%, recall proxy >= 0.7
- [x] Create metrics report command (AC: #3)
  - [x] Add `bun run metrics:report` script to package.json
  - [x] Create `src/commands/metrics-report.ts` CLI entry point
  - [x] Support `--format json|markdown` flag (default: markdown)
  - [x] Support `--output <file>` flag (default: stdout)
  - [x] Document command usage in README or AGENTS.md
- [x] Write tests for report generation (AC: #1, #3)
  - [x] Test generateReport returns valid JSON structure
  - [x] Test markdown format includes all required sections
  - [x] Test phase target evaluation logic
  - [x] Test CLI command execution
- [x] Verify implementation quality gates
  - [x] `bun run typecheck` passes
  - [x] `bun run build` succeeds
  - [x] Report command executes without errors

## Dev Notes

### Relevant Architecture Patterns and Constraints

- **Singleton pattern**: `InjectionMetricsCollector.getInstance()` - extend existing class, do not create new singleton
- **Fail-open**: Report generation must catch errors and return partial results if possible
- **File logging only**: Use `log()` from `src/logger.ts`, no stdout in library code (CLI can use stdout)
- **ESM project**: Keep `.js` extensions in relative imports
- **State persistence**: Metrics state persists to `~/.ai-vector-memories/metrics-state.json`

### Source Tree Components to Touch

- `src/memory/injection-metrics.ts` - Add generateReport() method and phase target constants
- `src/commands/metrics-report.ts` - NEW CLI entry point
- `package.json` - Add `metrics:report` script
- `AGENTS.md` or `README.md` - Document the new command

### Existing Metrics Infrastructure

The `InjectionMetricsCollector` already tracks:
- `selectionLatencyMs` - Time to select memories
- `selectedMemories` - Count of memories selected
- `tokensUsed` - Tokens consumed by injection
- `tokenUsagePercent` - Percentage of token budget used
- `embeddingsEnabled` - Whether embeddings were active
- `compressionEvents` - Number of compression operations
- `tokensSavedByCompression` - Tokens saved by compression
- `scopeGlobalSelected` - Global scope memories count
- `scopeProjectSelected` - Project scope memories count

The `getSummary()` method already computes:
- `baseline: MetricsSnapshot | null` - First 50 samples
- `current: MetricsSnapshot` - Rolling window average
- `targets: TargetEvaluation` - Token reduction and latency checks
- `quotaImpact: QuotaImpactSummary | null` - Adaptive quota impact

### Report Structure (Markdown Example)

```markdown
# Memory System Metrics Report

Generated: 2026-03-22T12:00:00-05:00

## Baseline vs Current

| Metric | Baseline | Current | Delta |
|--------|----------|---------|-------|
| Avg Selection Latency | 45ms | 38ms | -15.6% |
| p95 Selection Latency | 112ms | 95ms | -15.2% |
| Avg Tokens Used | 850 | 720 | -15.3% |
| Avg Token Usage % | 68% | 57% | -16.2% |
| Compression Events | 0 | 145 | +145 |
| Tokens Saved by Compression | 0 | 4350 | +4350 |

## Proxy Metrics

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Recall Proxy | 0.72 | 0.70 | PASS |
| Precision Top-5 | 0.80 | 0.75 | PASS |

## Phase Target Evaluation

| Phase | Criteria | Status |
|-------|----------|--------|
| MVP | p95 < 120ms (no embed) | PASS |
| Beta | p95 < 250ms (embed), reduction >= 15% | PASS |
| GA | reduction >= 25%, recall >= 0.70 | IN PROGRESS |
```

### Testing Standards Summary

- Bun test runner (`bun test`)
- Unit tests for report generation logic
- Integration test for CLI command
- Mock metrics data for deterministic tests

## Project Structure Notes

- Alignment with existing patterns: singleton services, fail-open error handling
- CLI commands should be standalone entry points, not library code
- Keep report format flexible for future integrations (CI, dashboards)

## References

- [Source: src/memory/injection-metrics.ts] - Existing metrics collector implementation
- [Source: _bmad-output/implementation-artifacts/3-1-compresion-opcional-de-contexto-inyectado.md] - Compression metrics integration pattern
- [Source: _bmad-output/implementation-artifacts/3-2-politica-de-cuotas-adaptable-por-metrias.md] - Quota impact reporting pattern
- [Source: AGENTS.md] - Project conventions and commands

## Previous Story Intelligence

### Story 4.1 - Integration Tests (completed)

- Created `src/memory/integration-retrieval-injection.test.ts`
- Used vitest with mocked logger
- Pattern: describe blocks per scenario, clear assertions

### Story 3.1 - Compression Metrics

- Added `compressionEvents` and `tokensSavedByCompression` to InjectionMetricsRecord
- Pattern: extend interface, add safe defaults, persist to state file

### Story 3.2 - Quota Impact Metrics

- Added `QuotaImpactRecord` and `recordQuotaImpact()` method
- Added `buildQuotaImpactSummary()` for aggregated reporting
- Pattern: separate record type for specific feature, aggregate in getSummary()

## Git Intelligence Summary

Recent commits showing established patterns:
- `6899a42` - fix: persist injection metrics state to disk
- `10dfcfa` - feat: implement adaptive quota policy by metrics (3.2)
- `7c770e1` - feat: implement optional context compression (Story 3.1)
- `472a281` - feat(debug): add injection metrics report command

Key patterns:
- ESM TypeScript with `.js` extensions in imports
- Singleton service pattern via `getInstance()`
- Fail-open error handling in all paths
- File-based state persistence (`metrics-state.json`)

## Latest Technical Information

### Bun CLI Commands

Bun supports running TypeScript files directly:
```json
{
  "scripts": {
    "metrics:report": "bun run src/commands/metrics-report.ts"
  }
}
```

CLI argument parsing can use simple `process.argv` slicing or lightweight libs like `minimist`.

### Report Format Best Practices

- JSON format for programmatic consumption (CI integration)
- Markdown format for human readability (PR comments, docs)
- Include generation timestamp for reproducibility
- Include sample count for statistical validity indication

## Project Context Reference

- **Technology**: TypeScript ^5.9.3, Bun runtime, ESM, strict mode
- **Hook rules**: Fail-open, fast paths, no stdout in library code, file logging only
- **Metrics state**: Persisted to `~/.ai-vector-memories/metrics-state.json`
- **CLI output**: Commands can write to stdout; library code must not

## Dev Agent Record

### Agent Model Used

github-copilot/gpt-5.3-codex

### Debug Log References

- Logger file: ~/.ai-vector-memories/plugin-debug.log
- Metrics state: ~/.ai-vector-memories/metrics-state.json

### Completion Notes List

- Added report generation to `InjectionMetricsCollector` with `generateReport('json' | 'markdown')` and fail-open fallback output.
- Added proxy metrics and phase targets evaluation (MVP/Beta/GA) based on baseline vs current summary snapshots.
- Extended injection metric recording path to persist report inputs: pool size, top-5 selected memories, and high-tier top-5 counts.
- Added CLI command `src/commands/metrics-report.ts` with `--format` and `--output` flags.
- Added tests for report payload/markdown rendering and CLI argument/runtime behavior.
- Documented report command usage in README Usage section.
- Validation completed successfully: `bun run typecheck`, `bun test`, `bun run build`, `bun run metrics:report --format json`.

### File List

- src/memory/injection-metrics.ts
- src/adapters/opencode/index.ts
- src/commands/metrics-report.ts
- src/memory/injection-metrics-report.test.ts
- src/commands/metrics-report.test.ts
- package.json
- README.md

## Change Log

- 2026-03-22: Implemented Story 4.2 metrics report generation (JSON/Markdown), phase targets, CLI regeneration command, tests, and docs.
