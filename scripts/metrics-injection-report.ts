import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

interface MetricsSnapshot {
  samples: number;
  avgSelectionLatencyMs: number;
  p95SelectionLatencyMs: number;
  avgSelectedMemories: number;
  avgTokensUsed: number;
  avgTokenUsagePercent: number;
  avgScopeGlobalSelected?: number;
  avgScopeProjectSelected?: number;
  avgProjectSelectionRatio?: number;
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
  quotaImpact?: {
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
  } | null;
}

const LOG_FILE = join(homedir(), ".ai-vector-memories", "plugin-debug.log");
const SUMMARY_PREFIX = "Injection metrics summary: ";

function readLatestSummaryFromLog(): SummaryPayload | null {
  if (!existsSync(LOG_FILE)) {
    return null;
  }

  const content = readFileSync(LOG_FILE, "utf-8");
  const lines = content.split("\n");

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? "";
    const idx = line.indexOf(SUMMARY_PREFIX);

    if (idx === -1) {
      continue;
    }

    const jsonText = line.slice(idx + SUMMARY_PREFIX.length).trim();
    if (!jsonText) {
      continue;
    }

    try {
      return JSON.parse(jsonText) as SummaryPayload;
    } catch {
      continue;
    }
  }

  return null;
}

function fmtBool(value: boolean | null): string {
  if (value === null) return "n/a";
  return value ? "yes" : "no";
}

function printSnapshot(title: string, snapshot: MetricsSnapshot | null): void {
  if (!snapshot) {
    console.log(`${title}: n/a`);
    return;
  }

  console.log(`${title}:`);
  console.log(`  samples: ${snapshot.samples}`);
  console.log(`  avgSelectionLatencyMs: ${snapshot.avgSelectionLatencyMs}`);
  console.log(`  p95SelectionLatencyMs: ${snapshot.p95SelectionLatencyMs}`);
  console.log(`  avgSelectedMemories: ${snapshot.avgSelectedMemories}`);
  console.log(`  avgTokensUsed: ${snapshot.avgTokensUsed}`);
  console.log(`  avgTokenUsagePercent: ${snapshot.avgTokenUsagePercent}`);
  if (snapshot.avgScopeGlobalSelected !== undefined) {
    console.log(`  avgScopeGlobalSelected: ${snapshot.avgScopeGlobalSelected}`);
  }
  if (snapshot.avgScopeProjectSelected !== undefined) {
    console.log(`  avgScopeProjectSelected: ${snapshot.avgScopeProjectSelected}`);
  }
  if (snapshot.avgProjectSelectionRatio !== undefined) {
    console.log(`  avgProjectSelectionRatio: ${snapshot.avgProjectSelectionRatio}`);
  }
}

function printReport(summary: SummaryPayload): void {
  console.log("Injection Metrics Report");
  console.log("========================");
  printSnapshot("baseline", summary.baseline);
  printSnapshot("current", summary.current);
  console.log("targets:");
  console.log(
    `  tokenReductionVsBaselinePercent: ${summary.targets.tokenReductionVsBaselinePercent ?? "n/a"}`,
  );
  console.log(
    `  meetsTokenReductionTarget: ${fmtBool(summary.targets.meetsTokenReductionTarget)}`,
  );
  console.log(
    `  meetsP95NoEmbeddingsTarget: ${fmtBool(summary.targets.meetsP95NoEmbeddingsTarget)}`,
  );
  console.log(
    `  meetsP95EmbeddingsTarget: ${fmtBool(summary.targets.meetsP95EmbeddingsTarget)}`,
  );
  if (summary.quotaImpact) {
    console.log('quotaImpact:');
    console.log(`  samples: ${summary.quotaImpact.samples}`);
    console.log(`  avgSelectedBefore: ${summary.quotaImpact.avgSelectedBefore}`);
    console.log(`  avgSelectedAfter: ${summary.quotaImpact.avgSelectedAfter}`);
    console.log(`  avgTokensBefore: ${summary.quotaImpact.avgTokensBefore}`);
    console.log(`  avgTokensAfter: ${summary.quotaImpact.avgTokensAfter}`);
    console.log(`  avgTokenDelta: ${summary.quotaImpact.avgTokenDelta}`);
    console.log(`  avgGlobalBefore: ${summary.quotaImpact.avgGlobalBefore}`);
    console.log(`  avgGlobalAfter: ${summary.quotaImpact.avgGlobalAfter}`);
    console.log(`  avgProjectBefore: ${summary.quotaImpact.avgProjectBefore}`);
    console.log(`  avgProjectAfter: ${summary.quotaImpact.avgProjectAfter}`);
  }
}

const summary = readLatestSummaryFromLog();

if (!summary) {
  console.log("No injection metrics summary found yet.");
  console.log(
    'Run OpenCode with the plugin until the log emits "Injection metrics summary".',
  );
  process.exit(0);
}

printReport(summary);
