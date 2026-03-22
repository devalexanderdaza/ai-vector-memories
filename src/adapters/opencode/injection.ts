/**
 * AI Vector Memories Atomic Injection
 * XML-based memory injection with persona boundary support
 */

import type { MemoryUnit } from "../../types.js";
import type { MemoryDatabase } from "../../storage/database.js";
import { jaccardSimilarity } from "../../memory/embeddings.js";
import { USER_LEVEL_CLASSIFICATIONS } from "../../types.js";
import { log } from "../../logger.js";
import { applyCompression } from "../../memory/compression.js";
import { getCompressionConfig, getAdaptiveQuotaConfig } from "../../config/config.js";
import { InjectionMetricsCollector } from "../../memory/injection-metrics.js";
import type { AdaptiveQuotaConfig } from "../../types/config.js";
import { DEFAULT_ADAPTIVE_QUOTA_CONFIG } from "../../types/config.js";

/**
 * Adapter state interface for injection operations
 */
export interface InjectionState {
  db: {
    vectorSearch: (
      queryText: string,
      currentProject?: string,
      limit?: number,
    ) => Promise<MemoryUnit[]>;
    getMemoriesByScope: (
      currentProject?: string,
      limit?: number,
    ) => MemoryUnit[];
  };
  worktree: string;
}

/**
 * Injection type determines the XML structure
 */
export type InjectionType = "user" | "project" | "global";

type SelectionMode = "dynamic" | "fallback" | "none";

const CLASSIFICATION_TIERS: Record<string, number> = {
  constraint: 0,
  preference: 1,
  decision: 1,
  learning: 2,
  procedural: 2,
  semantic: 3,
  episodic: 3,
};

function getClassificationTier(classification: string): number {
  return CLASSIFICATION_TIERS[classification] ?? 3;
}

function estimateMemoryTokens(memory: MemoryUnit): number {
  const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
  const storeLabel = memory.store === "ltm" ? "LTM" : "STM";
  const xmlEnvelope = `<memory classification="${memory.classification}" store="${storeLabel}" strength="${memory.strength.toFixed(2)}"></memory>`;
  return estimateTokens(memory.summary) + estimateTokens(xmlEnvelope) + 8;
}

function prioritizeByTier(memories: MemoryUnit[]): MemoryUnit[] {
  return [...memories].sort((a, b) => {
    const tierDiff =
      getClassificationTier(a.classification) -
      getClassificationTier(b.classification);
    if (tierDiff !== 0) {
      return tierDiff;
    }
    return b.strength - a.strength;
  });
}

function applyTokenBudget(
  memories: MemoryUnit[],
  maxTokens: number,
  maxMemories: number,
): MemoryUnit[] {
  const selected: MemoryUnit[] = [];
  let totalTokens = 0;

  for (const memory of memories) {
    if (selected.length >= maxMemories) {
      break;
    }

    const tokens = estimateMemoryTokens(memory);
    if (totalTokens + tokens > maxTokens) {
      continue;
    }

    selected.push(memory);
    totalTokens += tokens;
  }

  return selected;
}

interface SelectionTelemetry {
  worktree: string;
  selected: number;
  pool: number;
  embeddingsEnabled: boolean;
  queryContextLength: number;
  mode: SelectionMode;
  limits: {
    maxMemories: number;
    maxTokens: number;
  };
  tokens: {
    used: number;
    percent: number;
  };
  scope: {
    global: number;
    project: number;
  };
  classifications: Record<string, number>;
  // Latency of memory selection in milliseconds
  latencyMs: number;
}

interface QuotaAllocation {
  minGlobal: number;
  minProject: number;
  maxFlexible: number;
}

function normalizeQuotaRatios(config: AdaptiveQuotaConfig): {
  globalMinRatio: number;
  projectMinRatio: number;
  flexibleRatio: number;
} {
  const globalMinRatio = Math.max(0, Math.min(1, config.globalMinRatio));
  const projectMinRatio = Math.max(0, Math.min(1, config.projectMinRatio));
  const flexibleRatio = Math.max(0, Math.min(1, config.flexibleRatio));
  const sum = globalMinRatio + projectMinRatio + flexibleRatio;

  if (sum <= 0 || Number.isNaN(sum)) {
    return {
      globalMinRatio: DEFAULT_ADAPTIVE_QUOTA_CONFIG.globalMinRatio,
      projectMinRatio: DEFAULT_ADAPTIVE_QUOTA_CONFIG.projectMinRatio,
      flexibleRatio: DEFAULT_ADAPTIVE_QUOTA_CONFIG.flexibleRatio,
    };
  }

  return {
    globalMinRatio: globalMinRatio / sum,
    projectMinRatio: projectMinRatio / sum,
    flexibleRatio: flexibleRatio / sum,
  };
}

export function computeQuotaSlots(maxMemories: number, adaptiveQuotaConfig: AdaptiveQuotaConfig): QuotaAllocation {
  const normalized = normalizeQuotaRatios(adaptiveQuotaConfig);
  const minGlobal = Math.floor(maxMemories * normalized.globalMinRatio);
  const minProject = Math.floor(maxMemories * normalized.projectMinRatio);
  const maxFlexible = Math.max(0, maxMemories - minGlobal - minProject);

  return {
    minGlobal,
    minProject,
    maxFlexible,
  };
}

function adjustQuotaSlotsWithMetrics(
  base: QuotaAllocation,
  adaptiveQuotaConfig: AdaptiveQuotaConfig,
): QuotaAllocation {
  try {
    const collector = InjectionMetricsCollector.getInstance();
    const summary = collector.getSummary();
    const samples = summary.current.samples;

    if (samples < adaptiveQuotaConfig.minSamplesForAdjustment) {
      return base;
    }

    const adjustmentStep = Math.max(0, Math.min(0.2, adaptiveQuotaConfig.adjustmentStep));
    if (adjustmentStep === 0) {
      return base;
    }

    const projectRatioObserved = summary.current.avgProjectSelectionRatio;
    const tokenPressureHigh = summary.current.avgTokenUsagePercent >= adaptiveQuotaConfig.highTokenUsageThreshold;
    const slotsTotal = base.minGlobal + base.minProject + base.maxFlexible;

    if (slotsTotal <= 0) {
      return base;
    }

    let ratioDelta = 0;
    if (projectRatioObserved < adaptiveQuotaConfig.targetProjectRatio) {
      ratioDelta = adjustmentStep;
    } else if (projectRatioObserved > adaptiveQuotaConfig.targetProjectRatio) {
      ratioDelta = -adjustmentStep;
    }

    const tokenPenalty = tokenPressureHigh ? Math.min(adjustmentStep / 2, 0.05) : 0;

    const adjustedGlobalRatio = Math.max(0, (base.minGlobal / slotsTotal) - ratioDelta / 2 + tokenPenalty / 2);
    const adjustedProjectRatio = Math.max(0, (base.minProject / slotsTotal) + ratioDelta - tokenPenalty);
    const adjustedFlexibleRatio = Math.max(0, (base.maxFlexible / slotsTotal) - ratioDelta / 2 + tokenPenalty / 2);

    const normalized = normalizeQuotaRatios({
      ...adaptiveQuotaConfig,
      globalMinRatio: adjustedGlobalRatio,
      projectMinRatio: adjustedProjectRatio,
      flexibleRatio: adjustedFlexibleRatio,
    });

    return computeQuotaSlots(slotsTotal, {
      ...adaptiveQuotaConfig,
      globalMinRatio: normalized.globalMinRatio,
      projectMinRatio: normalized.projectMinRatio,
      flexibleRatio: normalized.flexibleRatio,
    });
  } catch (error) {
    log(`Adaptive quota metrics adjustment failed, using base quotas: ${error instanceof Error ? error.message : String(error)}`);
    return base;
  }
}

function buildSelectionTelemetry(params: {
    worktree: string;
    selectedMemories: MemoryUnit[];
    allMemories: MemoryUnit[];
    embeddingsEnabled: boolean;
    queryContext: string;
    mode: SelectionMode;
    totalTokens: number;
    maxTokens: number;
    maxMemories: number;
    latencyMs: number;
  }): SelectionTelemetry {
    const classificationCounts: Record<string, number> = {};
    let globalCount = 0;
    let projectCount = 0;

    for (const memory of params.selectedMemories) {
      classificationCounts[memory.classification] =
        (classificationCounts[memory.classification] ?? 0) + 1;

      if (memory.projectScope == null) {
        globalCount++;
      } else {
        projectCount++;
      }
    }

    const tokenPercent =
      params.maxTokens > 0
        ? Math.min(100, Math.round((params.totalTokens / params.maxTokens) * 100))
        : 0;

    // Safely get queryContext length, defaulting to 0 if null/undefined
    const queryContextLength = params.queryContext ? params.queryContext.length : 0;

    return {
      worktree: params.worktree,
      selected: params.selectedMemories.length,
      pool: params.allMemories.length,
      embeddingsEnabled: params.embeddingsEnabled,
      queryContextLength,
      mode: params.mode,
      limits: {
        maxMemories: params.maxMemories,
        maxTokens: params.maxTokens,
      },
      tokens: {
        used: params.totalTokens,
        percent: tokenPercent,
      },
      scope: {
        global: globalCount,
        project: projectCount,
      },
      classifications: classificationCounts,
      latencyMs: params.latencyMs,
    };
  }

/**
 * Wrap memories in XML format with persona boundary
 *
 * @param memories - Array of memory units to inject
 * @param worktree - Current project worktree path
 * @param type - Injection type (user, project, or global)
 * @returns XML-formatted string with memories
 */
export function wrapMemories(
  memories: MemoryUnit[],
  worktree: string,
  type: InjectionType = "global",
): string {
  const lines: string[] = [
    `<true_memory_context type="${type}" worktree="${worktree}">`,
  ];

  // Add persona boundary to enforce user preferences
  const userMemories = memories.filter((m) =>
    USER_LEVEL_CLASSIFICATIONS.includes(m.classification),
  );
  if (userMemories.length > 0) {
    lines.push("  <persona_boundary>");
    for (const mem of userMemories) {
      const storeLabel = mem.store === "ltm" ? "LTM" : "STM";
      lines.push(
        `    <memory classification="${mem.classification}" store="${storeLabel}" strength="${mem.strength.toFixed(2)}">`,
      );
      lines.push(`      ${escapeXml(mem.summary)}`);
      lines.push("    </memory>");
    }
    lines.push("  </persona_boundary>");
    lines.push("");
  }

  // Add project-level memories
  const projectMemories = memories.filter(
    (m) => !USER_LEVEL_CLASSIFICATIONS.includes(m.classification),
  );
  if (projectMemories.length > 0) {
    lines.push("  <memories>");
    for (const mem of projectMemories) {
      const storeLabel = mem.store === "ltm" ? "LTM" : "STM";
      lines.push(
        `    <memory classification="${mem.classification}" store="${storeLabel}" strength="${mem.strength.toFixed(2)}">`,
      );
      lines.push(`      ${escapeXml(mem.summary)}`);
      lines.push("    </memory>");
    }
    lines.push("  </memories>");
  }

  lines.push("</true_memory_context>");

  return lines.join("\n");
}

/**
 * Retrieve relevant memories with optional query-based Jaccard similarity search
 *
 * @param state - Adapter state containing database connection
 * @param query - Optional query string for Jaccard similarity search
 * @param limit - Maximum number of memories to retrieve (default: 8)
 * @returns Array of relevant memory units
 */
export async function getAtomicMemories(
  state: InjectionState,
  query?: string,
  limit: number = 8,
  maxTokens: number = 4000,
): Promise<MemoryUnit[]> {
  const candidateLimit = Math.max(limit * 4, limit);

  let candidates: MemoryUnit[];
  if (query && query.trim().length > 0) {
    // Use Jaccard similarity search (text-based, no embeddings)
    candidates = await state.db.vectorSearch(query, state.worktree, candidateLimit);
  } else {
    // Fall back to scope-based retrieval
    candidates = state.db.getMemoriesByScope(state.worktree, candidateLimit);
  }

  const prioritized = prioritizeByTier(candidates);
  return applyTokenBudget(prioritized, maxTokens, limit);
}

/**
 * Escape XML special characters to prevent injection attacks
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Extract user preferences from memories for persona boundary
 *
 * @param memories - Array of memory units
 * @returns Array of preference and constraint memories
 */
export function extractUserPreferences(memories: MemoryUnit[]): MemoryUnit[] {
  return memories.filter((m) =>
    USER_LEVEL_CLASSIFICATIONS.includes(m.classification),
  );
}

/**
 * Extract project context from memories
 *
 * @param memories - Array of memory units
 * @returns Array of project-level memories
 */
export function extractProjectContext(memories: MemoryUnit[]): MemoryUnit[] {
  return memories.filter(
    (m) => !USER_LEVEL_CLASSIFICATIONS.includes(m.classification),
  );
}

/**
 * Select memories for injection using dynamic allocation with scope quotas
 *
 * Strategy (values scale proportionally to maxMemories):
 * - Min 30% GLOBAL (preferences, constraints, learning, procedural)
 * - Min 30% PROJECT (decisions, semantic, episodic)
 * - Max 40% flexible (context-relevant from either scope)
 *
 * Classification Priority:
 * Tier 0: constraint (capped at 10, critical rules)
 * Tier 1: preference, decision (high priority, by strength)
 * Tier 2: learning, procedural (medium priority, by strength)
 * Tier 3: semantic, episodic (low priority, by query relevance)
 */
export async function selectMemoriesForInjection(
   db: MemoryDatabase,
   worktree: string,
   queryContext: string,
   embeddingsEnabled: boolean,
   maxMemories: number = 20,
   maxTokens: number = 4000,
   onCompression?: (tokensSaved: number) => void,
 ): Promise<MemoryUnit[]> {
   const startTime = Date.now();
   const memories: MemoryUnit[] = [];
   const selectedIds = new Set<string>();
   let totalTokens = 0;
   let selectionMode: SelectionMode = "none";

   const adaptiveQuotaConfig = getAdaptiveQuotaConfig();
   const baseQuota = computeQuotaSlots(maxMemories, adaptiveQuotaConfig);
   const staticQuota = computeQuotaSlots(maxMemories, DEFAULT_ADAPTIVE_QUOTA_CONFIG);
   const effectiveQuota = adaptiveQuotaConfig.enabled
     ? adjustQuotaSlotsWithMetrics(baseQuota, adaptiveQuotaConfig)
     : baseQuota;

   const MIN_GLOBAL = effectiveQuota.minGlobal;
   const MIN_PROJECT = effectiveQuota.minProject;
   const MAX_FLEXIBLE = effectiveQuota.maxFlexible;
   const MAX_CONSTRAINTS = 10;

  // Validate worktree parameter
  if (!worktree || worktree.trim() === '') {
    throw new Error('Invalid worktree parameter');
  }

  // Step 1: Get all memories
  const allMemories = db.getMemoriesByScope(worktree, 100);
  const scopedMemories = allMemories.filter(
    (memory) => memory.projectScope == null || memory.projectScope === worktree,
  );

  const globalMemories = scopedMemories.filter((m) => m.projectScope == null);
  const projectMemories = scopedMemories.filter((m) => m.projectScope === worktree);

  // Helper: Add memory if within slots and token budget
  const addMemory = (memory: MemoryUnit): boolean => {
    if (selectedIds.has(memory.id)) {
      return false;
    }

    if (memories.length >= maxMemories) {
      return false;
    }

    const tokens = estimateMemoryTokens(memory);
    if (totalTokens + tokens > maxTokens) {
      log(`Token budget exceeded, skipping memory ${memory.id}`);
      return false;
    }

    memories.push(memory);
    selectedIds.add(memory.id);
    totalTokens += tokens;
    return true;
  };

  const baselineScopeGlobal = Math.min(globalMemories.length, staticQuota.minGlobal);
  const baselineScopeProject = Math.min(projectMemories.length, staticQuota.minProject);

  // Step 2: Tier 0 - Constraints (capped)
  const constraints = scopedMemories
    .filter((m) => m.classification === "constraint")
    .sort((a, b) => b.strength - a.strength)
    .slice(0, MAX_CONSTRAINTS);

  for (const constraint of constraints) {
    if (memories.length >= maxMemories) break;
    if (!addMemory(constraint)) break;
  }

  // Step 3: Scope quotas
  const globalHigh = globalMemories
    .filter((m) => !selectedIds.has(m.id))
    .sort((a, b) => {
      const tierDiff =
        getClassificationTier(a.classification) -
        getClassificationTier(b.classification);
      if (tierDiff !== 0) {
        return tierDiff;
      }
      return b.strength - a.strength;
    })
    .slice(0, MIN_GLOBAL);

  for (const memory of globalHigh) {
    if (memories.length >= maxMemories) break;
    addMemory(memory);
  }

  const projectHigh = projectMemories
    .filter((m) => !selectedIds.has(m.id))
    .sort((a, b) => {
      const tierDiff =
        getClassificationTier(a.classification) -
        getClassificationTier(b.classification);
      if (tierDiff !== 0) {
        return tierDiff;
      }
      return b.strength - a.strength;
    })
    .slice(0, MIN_PROJECT);

  for (const memory of projectHigh) {
    if (memories.length >= maxMemories) break;
    addMemory(memory);
  }

  // Step 4: Flexible slots
  const remainingSlots = maxMemories - memories.length;

  if (
    remainingSlots > 0 &&
    embeddingsEnabled &&
    queryContext.trim().length > 0
  ) {
    selectionMode = "dynamic";
    const relevant = await db.vectorSearch(queryContext, worktree, Math.max(MAX_FLEXIBLE, remainingSlots) * 2);
    const newMemories = prioritizeByTier(
      relevant.filter((m) => !selectedIds.has(m.id) && (m.projectScope == null || m.projectScope === worktree)),
    );

    for (const memory of newMemories.slice(0, remainingSlots)) {
      if (memories.length >= maxMemories) {
        break;
      }
      addMemory(memory);
    }

    log(
      `Dynamic selection: ${memories.length} memories [max=${maxMemories}, tokens=${totalTokens}]`,
    );
  } else if (remainingSlots > 0) {
    selectionMode = "fallback";
    const remaining = scopedMemories
      .filter((m) => !selectedIds.has(m.id))
      .sort((a, b) => {
        const tierDiff =
          getClassificationTier(a.classification) -
          getClassificationTier(b.classification);
        if (tierDiff !== 0) {
          return tierDiff;
        }
        return b.strength - a.strength;
      })
      .slice(0, remainingSlots);

    for (const memory of remaining) {
      if (memories.length >= maxMemories) {
        break;
      }
      addMemory(memory);
    }

    log(
      `Fallback selection: ${memories.length} memories [max=${maxMemories}, tokens=${totalTokens}]`,
    );
  }

  const compressionConfig = getCompressionConfig();
  if (compressionConfig.enabled) {
    try {
      const { memories: compressedMemories, tokensSaved } = applyCompression(
        memories,
        totalTokens,
        maxTokens,
        compressionConfig,
      );
      if (tokensSaved > 0) {
        totalTokens = compressedMemories.reduce((sum, m) => sum + estimateMemoryTokens(m), 0);
        memories.length = 0;
        memories.push(...compressedMemories);
        log(`Compression applied: saved ${tokensSaved} tokens, final ${memories.length} memories`);
        if (onCompression) {
          onCompression(tokensSaved);
        }
      }
    } catch (err) {
      log(`Compression failed, using original selection: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const selectedScopeGlobal = memories.filter((memory) => memory.projectScope == null).length;
  const selectedScopeProject = memories.filter((memory) => memory.projectScope === worktree).length;
  const estimatedAvgTokensPerMemory = memories.length > 0 ? Math.round(totalTokens / memories.length) : 0;
  
  // Baseline considers what WOULD be selected without adaptive ratios, capped by available memories
  const baselineMaxFlexible = Math.min(scopedMemories.length - baselineScopeGlobal - baselineScopeProject, staticQuota.maxFlexible);
  const baselineSelectedCount = Math.min(maxMemories, baselineScopeGlobal + baselineScopeProject + Math.max(0, baselineMaxFlexible));
  const estimatedBaselineTokens = baselineSelectedCount * estimatedAvgTokensPerMemory;

  try {
    InjectionMetricsCollector.getInstance().recordQuotaImpact({
      baseline: {
        selectedCount: baselineSelectedCount,
        tokensUsed: estimatedBaselineTokens,
        scopeGlobalSelected: baselineScopeGlobal,
        scopeProjectSelected: baselineScopeProject,
      },
      adjusted: {
        selectedCount: memories.length,
        tokensUsed: totalTokens,
        scopeGlobalSelected: selectedScopeGlobal,
        scopeProjectSelected: selectedScopeProject,
      },
    });
  } catch (error) {
    log(`Adaptive quota impact metrics failed: ${error instanceof Error ? error.message : String(error)}`);
  }

let telemetry;
      const latencyMs = Date.now() - startTime;
      try {
        telemetry = buildSelectionTelemetry({
          worktree,
          selectedMemories: memories,
          allMemories,
          embeddingsEnabled,
          queryContext,
          mode: selectionMode,
          totalTokens,
          maxTokens,
          maxMemories,
          latencyMs,
        });
      } catch (error) {
        // Provide minimal telemetry to maintain fail-open behavior
        telemetry = {
          worktree,
          selected: memories.length,
          allMemories: allMemories ? allMemories.length : 0,
          embeddingsEnabled,
          queryContextLength: queryContext ? queryContext.length : 0,
          mode: selectionMode,
          totalTokens,
          maxTokens,
          maxMemories,
          latencyMs,
        };
        // Try to log the error, but don't let logging errors affect the telemetry
        try {
          log(`Error building selection telemetry: ${error instanceof Error ? error.message : String(error)}`);
        } catch (loggingError) {
          // If logging fails, we ignore it to maintain fail-open
        }
      }
      // Log the telemetry, but don't let logging errors affect the return value
      try {
        log(`Selection telemetry: ${JSON.stringify(telemetry)}`);
      } catch (loggingError) {
        // If logging fails, we ignore it to maintain fail-open
      }

  if (adaptiveQuotaConfig.enabled) {
    try {
      const adaptiveSummary = {
        enabled: adaptiveQuotaConfig.enabled,
        base: {
          minGlobal: baseQuota.minGlobal,
          minProject: baseQuota.minProject,
          maxFlexible: baseQuota.maxFlexible,
        },
        effective: {
          minGlobal: MIN_GLOBAL,
          minProject: MIN_PROJECT,
          maxFlexible: MAX_FLEXIBLE,
        },
        selected: {
          global: selectedScopeGlobal,
          project: selectedScopeProject,
          total: memories.length,
        },
      };
      log(`Adaptive quota report: ${JSON.stringify(adaptiveSummary)}`);
    } catch (error) {
      log(`Adaptive quota report logging failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return memories;
}
