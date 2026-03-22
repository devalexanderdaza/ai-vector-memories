/**
 * Aggregated metrics collector for memory injection.
 *
 * Keeps a rolling window of records and establishes a baseline snapshot
 * to compare progress over time.
 */

import { log } from "../logger.js";

export interface InjectionMetricsRecord {
  selectionLatencyMs: number;
  selectedMemories: number;
  tokensUsed: number;
  tokenUsagePercent: number;
  embeddingsEnabled: boolean;
}

interface MetricsSnapshot {
  samples: number;
  avgSelectionLatencyMs: number;
  p95SelectionLatencyMs: number;
  avgSelectedMemories: number;
  avgTokensUsed: number;
  avgTokenUsagePercent: number;
}

interface TargetEvaluation {
  tokenReductionVsBaselinePercent: number | null;
  meetsTokenReductionTarget: boolean | null;
  meetsP95NoEmbeddingsTarget: boolean;
  meetsP95EmbeddingsTarget: boolean;
}

interface SummaryPayload {
  baseline: MetricsSnapshot | null;
  current: MetricsSnapshot;
  targets: TargetEvaluation;
}

const MAX_WINDOW_SIZE = 300;
const SUMMARY_EVERY = 20;
const BASELINE_SAMPLE_SIZE = 50;
const TARGET_TOKEN_REDUCTION_PERCENT = 25;
const TARGET_P95_NO_EMBEDDINGS_MS = 120;
const TARGET_P95_WITH_EMBEDDINGS_MS = 250;

function average(values: number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function percentile(values: number[], percentileRank: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileRank / 100) * sorted.length) - 1;
  const safeIndex = Math.max(0, Math.min(index, sorted.length - 1));
  return sorted[safeIndex] ?? 0;
}

function snapshotFrom(records: InjectionMetricsRecord[]): MetricsSnapshot {
  const latencies = records.map((record) => record.selectionLatencyMs);
  const selected = records.map((record) => record.selectedMemories);
  const tokens = records.map((record) => record.tokensUsed);
  const tokenPercents = records.map((record) => record.tokenUsagePercent);

  return {
    samples: records.length,
    avgSelectionLatencyMs: Number(average(latencies).toFixed(2)),
    p95SelectionLatencyMs: Number(percentile(latencies, 95).toFixed(2)),
    avgSelectedMemories: Number(average(selected).toFixed(2)),
    avgTokensUsed: Number(average(tokens).toFixed(2)),
    avgTokenUsagePercent: Number(average(tokenPercents).toFixed(2)),
  };
}

function evaluateTargets(
  current: MetricsSnapshot,
  baseline: MetricsSnapshot | null,
): TargetEvaluation {
  let tokenReductionVsBaselinePercent: number | null = null;
  let meetsTokenReductionTarget: boolean | null = null;

  if (baseline && baseline.avgTokensUsed > 0) {
    tokenReductionVsBaselinePercent = Number(
      (
        ((baseline.avgTokensUsed - current.avgTokensUsed) /
          baseline.avgTokensUsed) *
        100
      ).toFixed(2),
    );
    meetsTokenReductionTarget =
      tokenReductionVsBaselinePercent >= TARGET_TOKEN_REDUCTION_PERCENT;
  }

  return {
    tokenReductionVsBaselinePercent,
    meetsTokenReductionTarget,
    meetsP95NoEmbeddingsTarget:
      current.p95SelectionLatencyMs <= TARGET_P95_NO_EMBEDDINGS_MS,
    meetsP95EmbeddingsTarget:
      current.p95SelectionLatencyMs <= TARGET_P95_WITH_EMBEDDINGS_MS,
  };
}

export class InjectionMetricsCollector {
  private static instance: InjectionMetricsCollector;

  private records: InjectionMetricsRecord[] = [];
  private baseline: MetricsSnapshot | null = null;
  private totalInjections = 0;

  private constructor() {}

  static getInstance(): InjectionMetricsCollector {
    if (!InjectionMetricsCollector.instance) {
      InjectionMetricsCollector.instance = new InjectionMetricsCollector();
    }
    return InjectionMetricsCollector.instance;
  }

  record(record: InjectionMetricsRecord): void {
    this.totalInjections++;
    this.records.push(record);

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
  }

  getSummary(): SummaryPayload {
    const current = snapshotFrom(this.records);
    const targets = evaluateTargets(current, this.baseline);

    return {
      baseline: this.baseline,
      current,
      targets,
    };
  }
}
