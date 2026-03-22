/**
 * AI Vector Memories Atomic Injection
 * XML-based memory injection with persona boundary support
 */

import type { MemoryUnit } from "../../types.js";
import type { MemoryDatabase } from "../../storage/database.js";
import { jaccardSimilarity } from "../../memory/embeddings.js";
import { USER_LEVEL_CLASSIFICATIONS } from "../../types.js";
import { log } from "../../logger.js";

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

      if (memory.projectScope === null) {
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
 ): Promise<MemoryUnit[]> {
   const startTime = Date.now();
   const memories: MemoryUnit[] = [];
   const selectedIds = new Set<string>();
   let totalTokens = 0;
   let selectionMode: SelectionMode = "none";

  // Scale quotas proportionally
  const MIN_GLOBAL = Math.floor(maxMemories * 0.3);
  const MIN_PROJECT = Math.floor(maxMemories * 0.3);
  const MAX_FLEXIBLE = maxMemories - MIN_GLOBAL - MIN_PROJECT;
  const MAX_CONSTRAINTS = 10;

  // Validate worktree parameter
  if (!worktree || worktree.trim() === '') {
    throw new Error('Invalid worktree parameter');
  }

  // Step 1: Get all memories
  const allMemories = db.getMemoriesByScope(worktree, 100);

  const globalMemories = allMemories.filter((m) => m.projectScope === null);
  const projectMemories = allMemories.filter((m) => m.projectScope !== null);

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

  // Step 2: Tier 0 - Constraints (capped)
  const constraints = allMemories
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
    const relevant = await db.vectorSearch(
      queryContext,
      worktree,
      MAX_FLEXIBLE,
    );
    const newMemories = prioritizeByTier(
      relevant.filter((m) => !selectedIds.has(m.id)),
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
    const remaining = allMemories
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

  return memories;
}
