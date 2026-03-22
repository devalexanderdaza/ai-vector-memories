import { describe, expect, it } from 'vitest';

import {
  buildMetricsReportPayload,
  renderMetricsReportMarkdown,
  type SummaryPayload,
} from './injection-metrics.js';

function buildSummary(overrides?: Partial<SummaryPayload>): SummaryPayload {
  return {
    baseline: {
      samples: 50,
      avgSelectionLatencyMs: 80,
      p95SelectionLatencyMs: 140,
      p95SelectionLatencyNoEmbeddingsMs: 120,
      p95SelectionLatencyEmbeddingsMs: null,
      avgSelectedMemories: 12,
      avgTokensUsed: 1000,
      avgTokenUsagePercent: 65,
      totalCompressionEvents: 0,
      totalTokensSavedByCompression: 0,
      avgTokensSavedByCompression: 0,
      avgScopeGlobalSelected: 6,
      avgScopeProjectSelected: 6,
      avgProjectSelectionRatio: 0.5,
      avgPoolAvailable: 30,
      avgRecallProxy: 0.4,
      avgPrecisionTop5Proxy: 0.5,
    },
    current: {
      samples: 120,
      avgSelectionLatencyMs: 60,
      p95SelectionLatencyMs: 110,
      p95SelectionLatencyNoEmbeddingsMs: 105,
      p95SelectionLatencyEmbeddingsMs: 180,
      avgSelectedMemories: 10,
      avgTokensUsed: 720,
      avgTokenUsagePercent: 54,
      totalCompressionEvents: 120,
      totalTokensSavedByCompression: 5000,
      avgTokensSavedByCompression: 41.67,
      avgScopeGlobalSelected: 4,
      avgScopeProjectSelected: 6,
      avgProjectSelectionRatio: 0.6,
      avgPoolAvailable: 15,
      avgRecallProxy: 0.72,
      avgPrecisionTop5Proxy: 0.8,
    },
    targets: {
      tokenReductionVsBaselinePercent: 28,
      meetsTokenReductionTarget: true,
      meetsP95NoEmbeddingsTarget: true,
      meetsP95EmbeddingsTarget: true,
    },
    quotaImpact: {
      samples: 30,
      avgSelectedBefore: 10,
      avgSelectedAfter: 9,
      avgTokensBefore: 860,
      avgTokensAfter: 740,
      avgTokenDelta: -120,
      avgGlobalBefore: 4,
      avgGlobalAfter: 3,
      avgProjectBefore: 6,
      avgProjectAfter: 6,
    },
    ...overrides,
  };
}

describe('injection metrics report payload', () => {
  it('builds a stable JSON payload shape', () => {
    const payload = buildMetricsReportPayload(buildSummary(), '2026-03-22T12:00:00.000Z');

    expect(payload.generatedAt).toBe('2026-03-22T12:00:00.000Z');
    expect(payload.sampleCount).toBe(120);
    expect(payload.baselineSampleCount).toBe(50);
    expect(payload.baselineVsCurrent.length).toBeGreaterThanOrEqual(6);
    expect(payload.proxyMetrics.length).toBe(2);
    expect(payload.phaseTargets.length).toBe(3);
    expect(payload.phaseTargets[0]?.phase).toBe('MVP');
    expect(payload.phaseTargets[1]?.phase).toBe('Beta');
    expect(payload.phaseTargets[2]?.phase).toBe('GA');
  });

  it('renders markdown with expected sections', () => {
    const payload = buildMetricsReportPayload(buildSummary(), '2026-03-22T12:00:00.000Z');
    const markdown = renderMetricsReportMarkdown(payload);

    expect(markdown).toContain('# Memory System Metrics Report');
    expect(markdown).toContain('## Baseline vs Current');
    expect(markdown).toContain('## Proxy Metrics');
    expect(markdown).toContain('## Phase Target Evaluation');
    expect(markdown).toContain('| Metric | Baseline | Current | Target | Status |');
    expect(markdown).toContain('| Recall Proxy |');
    expect(markdown).toContain('| Precision Top-5 Proxy |');
  });

  it('marks phase status as IN PROGRESS without baseline reduction', () => {
    const summary = buildSummary({
      baseline: null,
      targets: {
        tokenReductionVsBaselinePercent: null,
        meetsTokenReductionTarget: null,
        meetsP95NoEmbeddingsTarget: true,
        meetsP95EmbeddingsTarget: true,
      },
    });

    const payload = buildMetricsReportPayload(summary, '2026-03-22T12:00:00.000Z');
    const mvp = payload.phaseTargets.find((phase) => phase.phase === 'MVP');
    const beta = payload.phaseTargets.find((phase) => phase.phase === 'Beta');
    const ga = payload.phaseTargets.find((phase) => phase.phase === 'GA');

    expect(mvp?.status).toBe('IN PROGRESS');
    expect(beta?.status).toBe('IN PROGRESS');
    expect(ga?.status).toBe('IN PROGRESS');
  });
});
