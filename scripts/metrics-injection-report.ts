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
