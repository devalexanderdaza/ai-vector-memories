/**
 * Aggregated metrics collector for memory injection.
 *
 * Keeps a rolling window of records and establishes a baseline snapshot
 * to compare progress over time.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import { log } from '../logger.js';

const STATE_FILE = join(homedir(), '.ai-vector-memories', 'metrics-state.json');

const MAX_WINDOW_SIZE = 300;
const SUMMARY_EVERY = 20;
const BASELINE_SAMPLE_SIZE = 50;
const TARGET_TOKEN_REDUCTION_PERCENT = 25;
const TARGET_P95_NO_EMBEDDINGS_MS = 120;
const TARGET_P95_WITH_EMBEDDINGS_MS = 250;
const TARGET_RECALL_PROXY_GA = 0.7;
const TARGET_PRECISION_TOP5_PROXY = 0.75;

export const PHASE_TARGETS = {
  mvp: {
    p95NoEmbeddingsMs: 120,
    minTokenReductionPercent: 0,
  },
  beta: {
    p95WithEmbeddingsMs: 250,
    minTokenReductionPercent: 15,
  },
  ga: {
    minTokenReductionPercent: 25,
    minRecallProxy: 0.7,
  },
} as const;

type PhaseStatus = 'PASS' | 'FAIL' | 'IN PROGRESS';
type CheckStatus = 'pass' | 'fail' | 'in-progress';

export type ReportFormat = 'json' | 'markdown';

export interface InjectionMetricsRecord {
  selectionLatencyMs: number;
  selectedMemories: number;
  tokensUsed: number;
  tokenUsagePercent: number;
  embeddingsEnabled: boolean;
  compressionEvents: number;
  tokensSavedByCompression: number;
  scopeGlobalSelected: number;
  scopeProjectSelected: number;
  poolAvailable?: number;
  top5Selected?: number;
  top5HighTierSelected?: number;
}

interface MetricsSnapshot {
  samples: number;
  avgSelectionLatencyMs: number;
  p95SelectionLatencyMs: number;
  avgSelectedMemories: number;
  avgTokensUsed: number;
  avgTokenUsagePercent: number;
  totalCompressionEvents: number;
  totalTokensSavedByCompression: number;
  avgTokensSavedByCompression: number;
  avgScopeGlobalSelected: number;
  avgScopeProjectSelected: number;
  avgProjectSelectionRatio: number;
  avgPoolAvailable: number;
  avgRecallProxy: number;
  avgPrecisionTop5Proxy: number;
}

interface TargetEvaluation {
  tokenReductionVsBaselinePercent: number | null;
  meetsTokenReductionTarget: boolean | null;
  meetsP95NoEmbeddingsTarget: boolean;
  meetsP95EmbeddingsTarget: boolean;
}

export interface SummaryPayload {
  baseline: MetricsSnapshot | null;
  current: MetricsSnapshot;
  targets: TargetEvaluation;
  quotaImpact: QuotaImpactSummary | null;
}

export interface QuotaImpactRecord {
  baseline: {
    selectedCount: number;
    tokensUsed: number;
    scopeGlobalSelected: number;
    scopeProjectSelected: number;
  };
  adjusted: {
    selectedCount: number;
    tokensUsed: number;
    scopeGlobalSelected: number;
    scopeProjectSelected: number;
  };
}

interface QuotaImpactSummary {
  samples: number;
  avgSelectedBefore: number;
  avgSelectedAfter: number;
  avgTokensBefore: number;
  avgTokensAfter: number;
  avgTokenDelta: number;
  avgGlobalBefore: number;
  avgGlobalAfter: number;
  avgProjectBefore: number;
  avgProjectAfter: number;
}

interface MetricComparison {
  metric: string;
  baseline: number | null;
  current: number;
  deltaPercent: number | null;
}

interface ProxyMetricReport {
  name: string;
  value: number;
  target: number;
  status: PhaseStatus;
}

interface PhaseCheck {
  label: string;
  status: CheckStatus;
  value: number | null;
  target: number;
}

interface PhaseEvaluation {
  phase: 'MVP' | 'Beta' | 'GA';
  criteria: string;
  status: PhaseStatus;
  checks: PhaseCheck[];
}

export interface MetricsReportPayload {
  generatedAt: string;
  sampleCount: number;
  baselineSampleCount: number;
  baselineVsCurrent: MetricComparison[];
  proxyMetrics: ProxyMetricReport[];
  phaseTargets: PhaseEvaluation[];
  targets: TargetEvaluation;
  quotaImpact: QuotaImpactSummary | null;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function percentile(values: number[], percentileRank: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileRank / 100) * sorted.length) - 1;
  const safeIndex = Math.max(0, Math.min(index, sorted.length - 1));
  return sorted[safeIndex] ?? 0;
}

function toFixed(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function calculateDeltaPercent(baseline: number | null, current: number): number | null {
  if (baseline === null || baseline === 0) {
    return null;
  }
  return toFixed(((current - baseline) / baseline) * 100, 2);
}

function checkThreshold(
  value: number | null,
  target: number,
  comparator: 'lte' | 'gte',
): CheckStatus {
  if (value === null) {
    return 'in-progress';
  }
  if (comparator === 'lte') {
    return value <= target ? 'pass' : 'fail';
  }
  return value >= target ? 'pass' : 'fail';
}

function normalizePhaseStatus(checks: PhaseCheck[]): PhaseStatus {
  if (checks.some((check) => check.status === 'fail')) {
    return 'FAIL';
  }
  if (checks.some((check) => check.status === 'in-progress')) {
    return 'IN PROGRESS';
  }
  return 'PASS';
}

function proxyStatus(value: number, target: number): PhaseStatus {
  return value >= target ? 'PASS' : 'FAIL';
}

function snapshotFrom(records: InjectionMetricsRecord[]): MetricsSnapshot {
  const latencies = records.map((record) => record.selectionLatencyMs);
  const selected = records.map((record) => record.selectedMemories);
  const tokens = records.map((record) => record.tokensUsed);
  const tokenPercents = records.map((record) => record.tokenUsagePercent);
  const compressionEvents = records.map((record) => record.compressionEvents);
  const tokensSaved = records.map((record) => record.tokensSavedByCompression);
  const scopeGlobalSelected = records.map((record) => record.scopeGlobalSelected ?? 0);
  const scopeProjectSelected = records.map((record) => record.scopeProjectSelected ?? 0);
  const pools = records.map((record) => record.poolAvailable ?? 0);
  const recallProxy = records.map((record) => {
    const pool = record.poolAvailable ?? 0;
    if (pool <= 0) {
      return 0;
    }
    return Math.min(1, record.selectedMemories / pool);
  });
  const precisionTop5Proxy = records.map((record) => {
    const top5Selected = record.top5Selected ?? Math.min(5, record.selectedMemories);
    if (top5Selected <= 0) {
      return 0;
    }
    const top5HighTier = record.top5HighTierSelected ?? 0;
    return Math.min(1, top5HighTier / top5Selected);
  });
  const projectRatios = records.map((record) => {
    const global = record.scopeGlobalSelected ?? 0;
    const project = record.scopeProjectSelected ?? 0;
    const total = global + project;
    if (total <= 0) {
      return 0;
    }
    return project / total;
  });

  return {
    samples: records.length,
    avgSelectionLatencyMs: toFixed(average(latencies)),
    p95SelectionLatencyMs: toFixed(percentile(latencies, 95)),
    avgSelectedMemories: toFixed(average(selected)),
    avgTokensUsed: toFixed(average(tokens)),
    avgTokenUsagePercent: toFixed(average(tokenPercents)),
    totalCompressionEvents: compressionEvents.reduce((sum, value) => sum + value, 0),
    totalTokensSavedByCompression: tokensSaved.reduce((sum, value) => sum + value, 0),
    avgTokensSavedByCompression: toFixed(average(tokensSaved)),
    avgScopeGlobalSelected: toFixed(average(scopeGlobalSelected)),
    avgScopeProjectSelected: toFixed(average(scopeProjectSelected)),
    avgProjectSelectionRatio: toFixed(average(projectRatios), 4),
    avgPoolAvailable: toFixed(average(pools)),
    avgRecallProxy: toFixed(average(recallProxy), 4),
    avgPrecisionTop5Proxy: toFixed(average(precisionTop5Proxy), 4),
  };
}

function evaluateTargets(
  current: MetricsSnapshot,
  baseline: MetricsSnapshot | null,
): TargetEvaluation {
  let tokenReductionVsBaselinePercent: number | null = null;
  let meetsTokenReductionTarget: boolean | null = null;

  if (baseline && baseline.avgTokensUsed > 0) {
    tokenReductionVsBaselinePercent = toFixed(
      ((baseline.avgTokensUsed - current.avgTokensUsed) / baseline.avgTokensUsed) * 100,
      2,
    );
    meetsTokenReductionTarget = tokenReductionVsBaselinePercent >= TARGET_TOKEN_REDUCTION_PERCENT;
  }

  return {
    tokenReductionVsBaselinePercent,
    meetsTokenReductionTarget,
    meetsP95NoEmbeddingsTarget: current.p95SelectionLatencyMs <= TARGET_P95_NO_EMBEDDINGS_MS,
    meetsP95EmbeddingsTarget: current.p95SelectionLatencyMs <= TARGET_P95_WITH_EMBEDDINGS_MS,
  };
}

function buildPhaseEvaluations(summary: SummaryPayload): PhaseEvaluation[] {
  const tokenReduction = summary.targets.tokenReductionVsBaselinePercent;
  const currentP95 = summary.current.p95SelectionLatencyMs;
  const recallProxy = summary.current.avgRecallProxy;

  const mvpChecks: PhaseCheck[] = [
    {
      label: 'p95 < 120ms (no embeddings)',
      status: checkThreshold(currentP95, PHASE_TARGETS.mvp.p95NoEmbeddingsMs, 'lte'),
      value: currentP95,
      target: PHASE_TARGETS.mvp.p95NoEmbeddingsMs,
    },
    {
      label: 'token reduction >= 0%',
      status: checkThreshold(tokenReduction, PHASE_TARGETS.mvp.minTokenReductionPercent, 'gte'),
      value: tokenReduction,
      target: PHASE_TARGETS.mvp.minTokenReductionPercent,
    },
  ];

  const betaChecks: PhaseCheck[] = [
    {
      label: 'p95 < 250ms (with embeddings)',
      status: checkThreshold(currentP95, PHASE_TARGETS.beta.p95WithEmbeddingsMs, 'lte'),
      value: currentP95,
      target: PHASE_TARGETS.beta.p95WithEmbeddingsMs,
    },
    {
      label: 'token reduction >= 15%',
      status: checkThreshold(tokenReduction, PHASE_TARGETS.beta.minTokenReductionPercent, 'gte'),
      value: tokenReduction,
      target: PHASE_TARGETS.beta.minTokenReductionPercent,
    },
  ];

  const gaChecks: PhaseCheck[] = [
    {
      label: 'token reduction >= 25%',
      status: checkThreshold(tokenReduction, PHASE_TARGETS.ga.minTokenReductionPercent, 'gte'),
      value: tokenReduction,
      target: PHASE_TARGETS.ga.minTokenReductionPercent,
    },
    {
      label: 'recall proxy >= 0.70',
      status: checkThreshold(recallProxy, PHASE_TARGETS.ga.minRecallProxy, 'gte'),
      value: recallProxy,
      target: PHASE_TARGETS.ga.minRecallProxy,
    },
  ];

  return [
    {
      phase: 'MVP',
      criteria: 'p95 < 120ms (no embeddings), token reduction >= 0%',
      status: normalizePhaseStatus(mvpChecks),
      checks: mvpChecks,
    },
    {
      phase: 'Beta',
      criteria: 'p95 < 250ms (with embeddings), token reduction >= 15%',
      status: normalizePhaseStatus(betaChecks),
      checks: betaChecks,
    },
    {
      phase: 'GA',
      criteria: 'token reduction >= 25%, recall proxy >= 0.70',
      status: normalizePhaseStatus(gaChecks),
      checks: gaChecks,
    },
  ];
}

export function buildMetricsReportPayload(
  summary: SummaryPayload,
  generatedAt: string,
): MetricsReportPayload {
  const baselineVsCurrent: MetricComparison[] = [
    {
      metric: 'Avg Selection Latency (ms)',
      baseline: summary.baseline?.avgSelectionLatencyMs ?? null,
      current: summary.current.avgSelectionLatencyMs,
      deltaPercent: calculateDeltaPercent(
        summary.baseline?.avgSelectionLatencyMs ?? null,
        summary.current.avgSelectionLatencyMs,
      ),
    },
    {
      metric: 'p95 Selection Latency (ms)',
      baseline: summary.baseline?.p95SelectionLatencyMs ?? null,
      current: summary.current.p95SelectionLatencyMs,
      deltaPercent: calculateDeltaPercent(
        summary.baseline?.p95SelectionLatencyMs ?? null,
        summary.current.p95SelectionLatencyMs,
      ),
    },
    {
      metric: 'Avg Tokens Used',
      baseline: summary.baseline?.avgTokensUsed ?? null,
      current: summary.current.avgTokensUsed,
      deltaPercent: calculateDeltaPercent(
        summary.baseline?.avgTokensUsed ?? null,
        summary.current.avgTokensUsed,
      ),
    },
    {
      metric: 'Avg Token Usage %',
      baseline: summary.baseline?.avgTokenUsagePercent ?? null,
      current: summary.current.avgTokenUsagePercent,
      deltaPercent: calculateDeltaPercent(
        summary.baseline?.avgTokenUsagePercent ?? null,
        summary.current.avgTokenUsagePercent,
      ),
    },
    {
      metric: 'Compression Events',
      baseline: summary.baseline?.totalCompressionEvents ?? null,
      current: summary.current.totalCompressionEvents,
      deltaPercent: calculateDeltaPercent(
        summary.baseline?.totalCompressionEvents ?? null,
        summary.current.totalCompressionEvents,
      ),
    },
    {
      metric: 'Tokens Saved by Compression',
      baseline: summary.baseline?.totalTokensSavedByCompression ?? null,
      current: summary.current.totalTokensSavedByCompression,
      deltaPercent: calculateDeltaPercent(
        summary.baseline?.totalTokensSavedByCompression ?? null,
        summary.current.totalTokensSavedByCompression,
      ),
    },
  ];

  const proxyMetrics: ProxyMetricReport[] = [
    {
      name: 'Recall Proxy',
      value: summary.current.avgRecallProxy,
      target: TARGET_RECALL_PROXY_GA,
      status: proxyStatus(summary.current.avgRecallProxy, TARGET_RECALL_PROXY_GA),
    },
    {
      name: 'Precision Top-5 Proxy',
      value: summary.current.avgPrecisionTop5Proxy,
      target: TARGET_PRECISION_TOP5_PROXY,
      status: proxyStatus(summary.current.avgPrecisionTop5Proxy, TARGET_PRECISION_TOP5_PROXY),
    },
  ];

  return {
    generatedAt,
    sampleCount: summary.current.samples,
    baselineSampleCount: summary.baseline?.samples ?? 0,
    baselineVsCurrent,
    proxyMetrics,
    phaseTargets: buildPhaseEvaluations(summary),
    targets: summary.targets,
    quotaImpact: summary.quotaImpact,
  };
}

function formatNumber(value: number | null, decimals = 2): string {
  if (value === null) {
    return 'n/a';
  }
  return value.toFixed(decimals);
}

function formatDeltaPercent(value: number | null): string {
  if (value === null) {
    return 'n/a';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function renderMetricsReportMarkdown(report: MetricsReportPayload): string {
  const lines: string[] = [];

  lines.push('# Memory System Metrics Report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Samples (current window): ${report.sampleCount}`);
  lines.push(`Samples (baseline): ${report.baselineSampleCount}`);
  lines.push('');
  lines.push('## Baseline vs Current');
  lines.push('');
  lines.push('| Metric | Baseline | Current | Delta |');
  lines.push('|--------|----------|---------|-------|');
  for (const metric of report.baselineVsCurrent) {
    lines.push(
      `| ${metric.metric} | ${formatNumber(metric.baseline)} | ${formatNumber(metric.current)} | ${formatDeltaPercent(metric.deltaPercent)} |`,
    );
  }

  lines.push('');
  lines.push('## Proxy Metrics');
  lines.push('');
  lines.push('| Metric | Value | Target | Status |');
  lines.push('|--------|-------|--------|--------|');
  for (const metric of report.proxyMetrics) {
    lines.push(
      `| ${metric.name} | ${formatNumber(metric.value, 4)} | ${formatNumber(metric.target, 2)} | ${metric.status} |`,
    );
  }

  lines.push('');
  lines.push('## Phase Target Evaluation');
  lines.push('');
  lines.push('| Phase | Criteria | Status |');
  lines.push('|-------|----------|--------|');
  for (const phase of report.phaseTargets) {
    lines.push(`| ${phase.phase} | ${phase.criteria} | ${phase.status} |`);
  }

  return lines.join('\n');
}

export class InjectionMetricsCollector {
  private static instance: InjectionMetricsCollector;

  private records: InjectionMetricsRecord[] = [];
  private quotaImpactRecords: QuotaImpactRecord[] = [];
  private baseline: MetricsSnapshot | null = null;
  private totalInjections = 0;

  private constructor() {
    this.hydrate();
  }

  static getInstance(): InjectionMetricsCollector {
    if (!InjectionMetricsCollector.instance) {
      InjectionMetricsCollector.instance = new InjectionMetricsCollector();
    }
    return InjectionMetricsCollector.instance;
  }

  private hydrate(): void {
    try {
      if (existsSync(STATE_FILE)) {
        const data = readFileSync(STATE_FILE, 'utf-8');
        const state = JSON.parse(data) as {
          records?: InjectionMetricsRecord[];
          quotaImpactRecords?: QuotaImpactRecord[];
          baseline?: MetricsSnapshot;
          totalInjections?: number;
        };
        if (Array.isArray(state.records)) {
          this.records = state.records;
        }
        if (Array.isArray(state.quotaImpactRecords)) {
          this.quotaImpactRecords = state.quotaImpactRecords;
        }
        if (state.baseline) {
          this.baseline = state.baseline;
        }
        if (typeof state.totalInjections === 'number') {
          this.totalInjections = state.totalInjections;
        }
      }
    } catch (err) {
      log(`Failed to hydrate injection metrics state: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private persist(): void {
    try {
      const state = {
        records: this.records,
        quotaImpactRecords: this.quotaImpactRecords,
        baseline: this.baseline,
        totalInjections: this.totalInjections,
      };
      writeFileSync(STATE_FILE, JSON.stringify(state));
    } catch (err) {
      log(`Failed to persist injection metrics state: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  record(record: InjectionMetricsRecord): void {
    const top5Selected = Number.isFinite(record.top5Selected)
      ? Math.max(0, Math.min(5, record.top5Selected ?? 0))
      : Math.max(0, Math.min(5, record.selectedMemories));

    const safeRecord: InjectionMetricsRecord = {
      ...record,
      compressionEvents: Number.isFinite(record.compressionEvents) ? record.compressionEvents : 0,
      tokensSavedByCompression: Number.isFinite(record.tokensSavedByCompression)
        ? record.tokensSavedByCompression
        : 0,
      scopeGlobalSelected: Number.isFinite(record.scopeGlobalSelected) ? record.scopeGlobalSelected : 0,
      scopeProjectSelected: Number.isFinite(record.scopeProjectSelected) ? record.scopeProjectSelected : 0,
      poolAvailable: Number.isFinite(record.poolAvailable) ? record.poolAvailable : 0,
      top5Selected,
      top5HighTierSelected: Number.isFinite(record.top5HighTierSelected)
        ? Math.max(0, Math.min(top5Selected, record.top5HighTierSelected ?? 0))
        : 0,
    };

    this.totalInjections++;
    this.records.push(safeRecord);

    if (this.records.length > MAX_WINDOW_SIZE) {
      this.records.shift();
    }

    if (!this.baseline && this.records.length >= BASELINE_SAMPLE_SIZE) {
      this.baseline = snapshotFrom(this.records.slice(0, BASELINE_SAMPLE_SIZE));
      log(`Injection baseline established: ${JSON.stringify(this.baseline)}`);
    }

    if (this.totalInjections % SUMMARY_EVERY === 0) {
      const summary = this.getSummary();
      log(`Injection metrics summary: ${JSON.stringify(summary)}`);
    }

    this.persist();
  }

  recordQuotaImpact(record: QuotaImpactRecord): void {
    this.quotaImpactRecords.push(record);
    if (this.quotaImpactRecords.length > MAX_WINDOW_SIZE) {
      this.quotaImpactRecords.shift();
    }
    this.persist();
  }

  private buildQuotaImpactSummary(): QuotaImpactSummary | null {
    if (this.quotaImpactRecords.length === 0) {
      return null;
    }

    const selectedBefore = this.quotaImpactRecords.map((record) => record.baseline.selectedCount);
    const selectedAfter = this.quotaImpactRecords.map((record) => record.adjusted.selectedCount);
    const tokensBefore = this.quotaImpactRecords.map((record) => record.baseline.tokensUsed);
    const tokensAfter = this.quotaImpactRecords.map((record) => record.adjusted.tokensUsed);
    const globalBefore = this.quotaImpactRecords.map((record) => record.baseline.scopeGlobalSelected);
    const globalAfter = this.quotaImpactRecords.map((record) => record.adjusted.scopeGlobalSelected);
    const projectBefore = this.quotaImpactRecords.map((record) => record.baseline.scopeProjectSelected);
    const projectAfter = this.quotaImpactRecords.map((record) => record.adjusted.scopeProjectSelected);
    const tokenDelta = this.quotaImpactRecords.map(
      (record) => record.adjusted.tokensUsed - record.baseline.tokensUsed,
    );

    return {
      samples: this.quotaImpactRecords.length,
      avgSelectedBefore: toFixed(average(selectedBefore)),
      avgSelectedAfter: toFixed(average(selectedAfter)),
      avgTokensBefore: toFixed(average(tokensBefore)),
      avgTokensAfter: toFixed(average(tokensAfter)),
      avgTokenDelta: toFixed(average(tokenDelta)),
      avgGlobalBefore: toFixed(average(globalBefore)),
      avgGlobalAfter: toFixed(average(globalAfter)),
      avgProjectBefore: toFixed(average(projectBefore)),
      avgProjectAfter: toFixed(average(projectAfter)),
    };
  }

  getSummary(): SummaryPayload {
    const current = snapshotFrom(this.records);
    const targets = evaluateTargets(current, this.baseline);
    const quotaImpact = this.buildQuotaImpactSummary();

    return {
      baseline: this.baseline,
      current,
      targets,
      quotaImpact,
    };
  }

  generateReport(format: ReportFormat = 'markdown'): string {
    try {
      const summary = this.getSummary();
      const report = buildMetricsReportPayload(summary, new Date().toISOString());
      if (format === 'json') {
        return JSON.stringify(report, null, 2);
      }
      return renderMetricsReportMarkdown(report);
    } catch (error) {
      log(`Failed to generate metrics report: ${error instanceof Error ? error.message : String(error)}`);
      const generatedAt = new Date().toISOString();
      if (format === 'json') {
        return JSON.stringify(
          {
            generatedAt,
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        );
      }
      return [
        '# Memory System Metrics Report',
        '',
        `Generated: ${generatedAt}`,
        '',
        `Failed to generate full report: ${error instanceof Error ? error.message : String(error)}`,
      ].join('\n');
    }
  }
}
