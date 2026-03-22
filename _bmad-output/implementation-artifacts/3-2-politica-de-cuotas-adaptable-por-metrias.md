# Story 3.2: Politica de cuotas adaptable por metrias

Status: review

## Story

As an injection system,
I want adaptive quotas by scope and classification driven by observed metrics,
so that I improve relevance while controlling token cost and preserving project isolation.

## Acceptance Criteria

1. Existe configuracion para cuotas global/project/flexible.
2. Hay reporte de impacto antes y despues del ajuste.
3. No se detecta fuga de memorias entre proyectos.

## Tasks / Subtasks

- [x] Add quota policy config model and defaults (AC: #1)
  - [x] Define an `AdaptiveQuotaConfig` section in `src/types/config.ts` with explicit fields for `globalMinRatio`, `projectMinRatio`, `flexibleRatio`, and adjustment controls.
  - [x] Add safe defaults that preserve current behavior when adaptive mode is disabled.
  - [x] Ensure ratios are validated and normalized to avoid invalid allocations.
- [x] Integrate quota config loading and env overrides (AC: #1)
  - [x] Extend `src/config/config.ts` parsing/validation for adaptive quota settings.
  - [x] Keep precedence `ENV > config.jsonc > defaults`.
  - [x] Update `generateConfigWithComments()` with clear guidance for each quota field.
- [x] Implement adaptive quota calculation in injection selection (AC: #1, #3)
  - [x] Add a deterministic allocator in `src/adapters/opencode/injection.ts` that computes per-scope slots for global/project/flexible.
  - [x] Keep fail-open behavior: if adaptive calculation fails, fall back to current static quota logic.
  - [x] Enforce project-scope isolation: no cross-project leakage in selected memories.
- [x] Add impact tracking and reporting for quota adjustments (AC: #2)
  - [x] Extend `src/memory/injection-metrics.ts` to persist before/after quota metrics (token usage, scope distribution, selected count).
  - [x] Add a report surface (log summary or command output) showing baseline vs adjusted behavior.
  - [x] Ensure reported metrics are comparable with the existing baseline framework.
- [x] Add tests for adaptive quota policy (AC: #1, #2, #3)
  - [x] Unit tests for ratio validation and slot allocation boundaries.
  - [x] Integration tests in selection flow validating no project leakage.
  - [x] Regression tests proving fallback to static behavior when adaptive mode is off or invalid.
- [x] Verify implementation quality gates
  - [x] `bun run typecheck`
  - [x] `bun run build`
  - [x] Run targeted Bun tests for quota selection and metrics reporting.

## Dev Notes

- **Fail-open runtime constraints:** This plugin runs in host hooks. Any new adaptive logic must catch errors and continue with existing static quota behavior.
- **No async work in critical selection path unless already present:** Selection logic is latency sensitive and should remain deterministic.
- **Config strategy:** Follow existing pattern used by embeddings/compression toggles and config comments.
- **Scope safety is non-negotiable:** Adaptive logic cannot weaken the project boundary guarantees.

### Relevant Code Areas

- `src/adapters/opencode/injection.ts` (current static quota allocation and selection telemetry)
- `src/config/config.ts` (user config parsing and precedence)
- `src/types/config.ts` (new policy config types/defaults)
- `src/memory/injection-metrics.ts` (baseline and target tracking)
- `src/adapters/opencode/index.ts` (metrics record call site)

### Implementation Guardrails

- Reuse current token estimator and tiering conventions; do not introduce incompatible heuristics in this story.
- Preserve Tier priority semantics (Tier 0/1 critical preference in selection).
- Keep imports ESM-style with `.js` extensions and maintain strict TypeScript typing.
- Prefer small pure helpers for allocation math to make edge-case testing easy.

### Suggested Technical Approach

1. Introduce a pure `computeQuotaSlots(maxMemories, config, recentMetrics)` helper returning deterministic slot counts.
2. Clamp and normalize ratios so computed slots always sum exactly to `maxMemories`.
3. Feed computed slots into existing global/project/flexible selection branches with minimal flow disruption.
4. Capture and report impact deltas per summary window (`before` vs `after`) using existing metrics snapshots.

### Testing Focus

- Boundary ratios: `0`, `1`, and invalid combinations.
- Small `maxMemories` values where rounding can break ratios.
- Cases with sparse project memories or sparse global memories.
- Explicit cross-project leakage checks when adaptive slots favor project scope.

### Previous Story Intelligence (3.1)

- Story 3.1 established config-first opt-in behavior and fail-open handling for compression.
- Compression integration was done as a second pass after base selection; adaptive quotas should preserve this sequencing and avoid breaking compression metrics.
- Metrics now include `compressionEvents` and `tokensSavedByCompression`; quota impact reporting should coexist cleanly with those fields.

### Git Intelligence Summary

- `7c770e1` introduced optional compression and additional metrics fields.
- `c6f3dbc` established structured selection telemetry patterns.
- `aaee7d5` established strict token budget and tier prioritization behavior that adaptive quotas must not regress.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#L73] Story definition and ACs for 3.2
- [Source: _bmad-output/implementation-artifacts/3-1-compresion-opcional-de-contexto-inyectado.md#L156] Fail-open and hook-performance constraints
- [Source: src/adapters/opencode/injection.ts:303] Existing scope quota strategy and tier priorities
- [Source: src/memory/injection-metrics.ts:45] Baseline/target metrics framework
- [Source: src/config/config.ts:164] Config precedence and validation pattern

## Dev Agent Record

### Agent Model Used

github-copilot/gpt-5.3-codex

### Debug Log References

- Logger file: `~/.ai-vector-memories/plugin-debug.log`

### Completion Notes List

- Created ready-for-dev story context for adaptive quota policy implementation.
- Captured AC-aligned tasks, guardrails, and test expectations.
- Incorporated prior-story intelligence from Story 3.1 and current codebase constraints.
- Implemented `AdaptiveQuotaConfig` + defaults and integrated config parsing with env precedence and ratio normalization.
- Implemented deterministic adaptive quota slot allocator with fail-open fallback to static quotas.
- Enforced project isolation during adaptive/flexible selection, including filtered dynamic retrieval results.
- Added quota impact tracking (`baseline` vs `adjusted`) in injection metrics and exposed quota impact output in `metrics:injection` report.
- Added/updated tests for adaptive quotas, compression suite compatibility (`vitest` import), and integration retrieval/injection paths.
- Validated with `bun run typecheck`, `bun run build`, and targeted tests (30 passing).

### File List

- _bmad-output/implementation-artifacts/3-2-politica-de-cuotas-adaptable-por-metrias.md (modified)
- src/types/config.ts (modified)
- src/config/config.ts (modified)
- src/adapters/opencode/injection.ts (modified)
- src/adapters/opencode/index.ts (modified)
- src/memory/injection-metrics.ts (modified)
- scripts/metrics-injection-report.ts (modified)
- src/memory/adaptive-quota.test.ts (new)
- src/memory/integration-retrieval-injection.test.ts (modified)
- src/memory/compression.test.ts (modified)

## Change Log

- 2026-03-22: Implemented Story 3.2 adaptive quota policy, metrics impact reporting, and AC coverage tests; status -> review.
