/**
 * Aggregated metrics collector for memory injection.
 *
 * Keeps a rolling window of records and establishes a baseline snapshot
 * to compare progress over time.
 */

import { join } from 'path';
import { homedir } from 'os';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { log } from "../logger.js";

const STATE_FILE = join(homedir(), '.ai-vector-memories', 'metrics-state.json');

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
  const compressionEvents = records.map((record) => record.compressionEvents);
  const tokensSaved = records.map((record) => record.tokensSavedByCompression);
  const scopeGlobalSelected = records.map((record) => record.scopeGlobalSelected ?? 0);
  const scopeProjectSelected = records.map((record) => record.scopeProjectSelected ?? 0);
  const projectRatios = records.map((record) => {
    const global = record.scopeGlobalSelected ?? 0;
    const project = record.scopeProjectSelected ?? 0;
    const total = global + project;
    if (total <= 0) return 0;
    return project / total;
  });

  return {
    samples: records.length,
    avgSelectionLatencyMs: Number(average(latencies).toFixed(2)),
    p95SelectionLatencyMs: Number(percentile(latencies, 95).toFixed(2)),
    avgSelectedMemories: Number(average(selected).toFixed(2)),
    avgTokensUsed: Number(average(tokens).toFixed(2)),
    avgTokenUsagePercent: Number(average(tokenPercents).toFixed(2)),
    totalCompressionEvents: compressionEvents.reduce((sum, v) => sum + v, 0),
    totalTokensSavedByCompression: tokensSaved.reduce((sum, v) => sum + v, 0),
    avgTokensSavedByCompression: Number(average(tokensSaved).toFixed(2)),
    avgScopeGlobalSelected: Number(average(scopeGlobalSelected).toFixed(2)),
    avgScopeProjectSelected: Number(average(scopeProjectSelected).toFixed(2)),
    avgProjectSelectionRatio: Number(average(projectRatios).toFixed(4)),
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
        const state = JSON.parse(data);
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
    const safeRecord: InjectionMetricsRecord = {
      ...record,
      compressionEvents: Number.isFinite(record.compressionEvents)
        ? record.compressionEvents
        : 0,
      tokensSavedByCompression: Number.isFinite(record.tokensSavedByCompression)
        ? record.tokensSavedByCompression
        : 0,
      scopeGlobalSelected: Number.isFinite(record.scopeGlobalSelected)
        ? record.scopeGlobalSelected
        : 0,
      scopeProjectSelected: Number.isFinite(record.scopeProjectSelected)
        ? record.scopeProjectSelected
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

    const selectedBefore = this.quotaImpactRecords.map((r) => r.baseline.selectedCount);
    const selectedAfter = this.quotaImpactRecords.map((r) => r.adjusted.selectedCount);
    const tokensBefore = this.quotaImpactRecords.map((r) => r.baseline.tokensUsed);
    const tokensAfter = this.quotaImpactRecords.map((r) => r.adjusted.tokensUsed);
    const globalBefore = this.quotaImpactRecords.map((r) => r.baseline.scopeGlobalSelected);
    const globalAfter = this.quotaImpactRecords.map((r) => r.adjusted.scopeGlobalSelected);
    const projectBefore = this.quotaImpactRecords.map((r) => r.baseline.scopeProjectSelected);
    const projectAfter = this.quotaImpactRecords.map((r) => r.adjusted.scopeProjectSelected);
    const tokenDelta = this.quotaImpactRecords.map((r) => r.adjusted.tokensUsed - r.baseline.tokensUsed);

    return {
      samples: this.quotaImpactRecords.length,
      avgSelectedBefore: Number(average(selectedBefore).toFixed(2)),
      avgSelectedAfter: Number(average(selectedAfter).toFixed(2)),
      avgTokensBefore: Number(average(tokensBefore).toFixed(2)),
      avgTokensAfter: Number(average(tokensAfter).toFixed(2)),
      avgTokenDelta: Number(average(tokenDelta).toFixed(2)),
      avgGlobalBefore: Number(average(globalBefore).toFixed(2)),
      avgGlobalAfter: Number(average(globalAfter).toFixed(2)),
      avgProjectBefore: Number(average(projectBefore).toFixed(2)),
      avgProjectAfter: Number(average(projectAfter).toFixed(2)),
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
}
