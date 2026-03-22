/**
 * Memory Compression Module
 *
 * Provides proportional summary truncation for low-priority memory tiers
 * when token budget is exceeded. Tier 0 and Tier 1 are never compressed.
 *
 * Strategy:
 * 1. Compress Tier 3 (semantic, episodic) first
 * 2. Then compress Tier 2 (learning, procedural) if needed
 * 3. Tier 0 (constraint) and Tier 1 (preference, decision) are NEVER compressed
 */

import type { MemoryUnit } from '../types.js';
import type { CompressionConfig } from '../types/config.js';
import { log } from '../logger.js';

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

function isExcludedTier(tier: number, config: CompressionConfig): boolean {
  return config.excludedTiers.includes(tier);
}

/**
 * Truncate text at word boundary with ellipsis.
 * Ensures minimum length is preserved.
 */
export function compressMemorySummary(
  memory: MemoryUnit,
  maxChars: number,
  minLength: number,
): MemoryUnit {
  const original = memory.summary;
  if (original.length <= maxChars) {
    return memory;
  }

  const effectiveMax = Math.min(maxChars, original.length);
  let truncated = original.substring(0, effectiveMax);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > minLength) {
    truncated = truncated.substring(0, lastSpace);
  }

  const safe = Math.max(minLength, truncated.trim().length);
  if (safe < original.length) {
    return {
      ...memory,
      summary: truncated.trim() + '…',
    };
  }

  return memory;
}

/**
 * Estimate tokens for a memory using the same heuristic as injection.ts
 */
function estimateMemoryTokens(memory: MemoryUnit): number {
  const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
  const storeLabel = memory.store === 'ltm' ? 'LTM' : 'STM';
  const xmlEnvelope = `<memory classification="${memory.classification}" store="${storeLabel}" strength="${memory.strength.toFixed(2)}"></memory>`;
  return estimateTokens(memory.summary) + estimateTokens(xmlEnvelope) + 8;
}

/**
 * Get tiers eligible for compression (excluding configured tiers).
 */
export function getCompressibleTiers(config: CompressionConfig): number[] {
  return [2, 3].filter((tier) => !isExcludedTier(tier, config));
}

/**
 * Apply compression to memories that exceed token budget.
 * Compresses Tier 3 first, then Tier 2, until budget is satisfied.
 * Tier 0 and Tier 1 are never compressed.
 */
export function applyCompression(
  memories: MemoryUnit[],
  currentTokens: number,
  maxTokens: number,
  config: CompressionConfig,
): { memories: MemoryUnit[]; tokensSaved: number } {
  if (!config.enabled || currentTokens <= maxTokens) {
    return { memories, tokensSaved: 0 };
  }

  const result = [...memories];
  const compressibleTiers = getCompressibleTiers(config);

  for (const tier of compressibleTiers) {
    if (currentTokens <= maxTokens) break;

    const tierMemories = result.filter(
      (m) => getClassificationTier(m.classification) === tier,
    );

    for (const memory of tierMemories) {
      if (currentTokens <= maxTokens) break;

      const ratio = config.maxCompressionRatio;
      const targetChars = Math.max(
        config.minSummaryLength,
        Math.floor(memory.summary.length * ratio),
      );

      const compressed = compressMemorySummary(memory, targetChars, config.minSummaryLength);
      const originalTokens = estimateMemoryTokens(memory);
      const newTokens = estimateMemoryTokens(compressed);

      if (newTokens < originalTokens) {
        const idx = result.findIndex((m) => m.id === memory.id);
        if (idx !== -1) {
          result[idx] = compressed;
          currentTokens -= originalTokens - newTokens;
          log(
            `Compression: ${memory.id} (Tier ${tier}) ${memory.summary.length}→${compressed.summary.length} chars, saved ${originalTokens - newTokens} tokens`,
          );
        }
      }
    }
  }

  const tokensSaved = Math.max(0, currentTokens < 0 ? 0 : (memories.reduce((sum, m) => sum + estimateMemoryTokens(m), 0) - result.reduce((sum, m) => sum + estimateMemoryTokens(m), 0)));

  return { memories: result, tokensSaved };
}
