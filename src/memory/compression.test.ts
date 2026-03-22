import { describe, expect, it } from 'vitest';
import { compressMemorySummary, applyCompression, getCompressibleTiers } from './compression.js';
import type { MemoryUnit, MemoryClassification, MemoryStore, MemoryStatus } from '../types.js';
import type { CompressionConfig } from '../types/config.js';

function makeMemory(
  id: string,
  classification: MemoryClassification,
  summary: string,
  store: MemoryStore = 'ltm',
): MemoryUnit {
  return {
    id,
    sessionId: undefined,
    store,
    classification,
    summary,
    sourceEventIds: [],
    projectScope: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastAccessedAt: new Date(),
    recency: 0.5,
    frequency: 1,
    importance: 0.5,
    utility: 0.5,
    novelty: 0.5,
    confidence: 0.5,
    interference: 0,
    strength: 0.8,
    decayRate: 0.05,
    tags: [],
    associations: [],
    status: 'active' as MemoryStatus,
    version: 1,
    evidence: [],
    embedding: undefined,
  };
}

function makeConfig(overrides: Partial<CompressionConfig> = {}): CompressionConfig {
  return {
    enabled: true,
    maxCompressionRatio: 0.5,
    minSummaryLength: 50,
    excludedTiers: [0, 1],
    ...overrides,
  };
}

describe('compressMemorySummary', () => {
  it('returns unchanged memory when summary is shorter than maxChars', () => {
    const mem = makeMemory('1', 'semantic', 'short text');
    const result = compressMemorySummary(mem, 100, 10);
    expect(result.summary).toBe('short text');
  });

  it('truncates at word boundary with ellipsis', () => {
    const longText = 'this is a very long summary that should be truncated at word boundary properly';
    const mem = makeMemory('1', 'semantic', longText);
    const result = compressMemorySummary(mem, 30, 10);
    expect(result.summary.length).toBeLessThan(longText.length);
    expect(result.summary.endsWith('…')).toBe(true);
  });

  it('preserves minLength even if last space is before it', () => {
    const mem = makeMemory('1', 'semantic', 'ab cd ef gh ij kl mn op');
    const result = compressMemorySummary(mem, 5, 5);
    expect(result.summary.length).toBeGreaterThanOrEqual(5);
  });

  it('does not add ellipsis if no truncation needed', () => {
    const mem = makeMemory('1', 'semantic', 'tiny');
    const result = compressMemorySummary(mem, 10, 5);
    expect(result.summary).toBe('tiny');
    expect(result.summary).not.toContain('…');
  });
});

describe('getCompressibleTiers', () => {
  it('returns [2, 3] by default', () => {
    const config = makeConfig();
    expect(getCompressibleTiers(config)).toEqual([2, 3]);
  });

  it('excludes configured tiers', () => {
    const config = makeConfig({ excludedTiers: [3] });
    expect(getCompressibleTiers(config)).toEqual([2]);
  });

  it('returns empty array if all tiers excluded', () => {
    const config = makeConfig({ excludedTiers: [0, 1, 2, 3] });
    expect(getCompressibleTiers(config)).toEqual([]);
  });
});

describe('applyCompression', () => {
  it('returns original when disabled', () => {
    const mem = makeMemory('1', 'semantic', 'a'.repeat(200));
    const mems = [mem];
    const config = makeConfig({ enabled: false });
    const result = applyCompression(mems, 1000, 100, config);
    expect(result.memories.length).toBe(1);
    expect(result.memories.some((m) => m.summary === mem.summary)).toBe(true);
    expect(result.tokensSaved).toBe(0);
  });

  it('returns original when under budget', () => {
    const mem = makeMemory('1', 'semantic', 'short');
    const mems = [mem];
    const config = makeConfig({ enabled: true });
    const result = applyCompression(mems, 10, 100, config);
    expect(result.memories.length).toBe(1);
    expect(result.memories.some((m) => m.summary === mem.summary)).toBe(true);
  });

  it('never compresses Tier 0 (constraint)', () => {
    const mems = [
      makeMemory('1', 'constraint', 'a'.repeat(200)),
      makeMemory('2', 'semantic', 'b'.repeat(200)),
    ];
    const config = makeConfig();
    const result = applyCompression(mems, 1000, 100, config);
    const constraint = result.memories.find((m) => m.id === '1');
    expect(constraint?.summary ?? '').toBe('a'.repeat(200));
  });

  it('never compresses Tier 1 (preference, decision)', () => {
    const mems = [
      makeMemory('1', 'preference', 'a'.repeat(200)),
      makeMemory('2', 'decision', 'b'.repeat(200)),
      makeMemory('3', 'semantic', 'c'.repeat(200)),
    ];
    const config = makeConfig();
    const result = applyCompression(mems, 1000, 100, config);
    const pref = result.memories.find((m) => m.id === '1');
    const dec = result.memories.find((m) => m.id === '2');
    expect(pref?.summary ?? '').toBe('a'.repeat(200));
    expect(dec?.summary ?? '').toBe('b'.repeat(200));
    const semantic = result.memories.find((m) => m.id === '3');
    expect(semantic?.summary.length ?? 0).toBeLessThan(200);
  });

  it('compresses Tier 2 (learning, procedural)', () => {
    const mems = [
      makeMemory('1', 'semantic', 'a'.repeat(200)),
      makeMemory('2', 'learning', 'b'.repeat(200)),
      makeMemory('3', 'procedural', 'c'.repeat(200)),
    ];
    const config = makeConfig();
    const result = applyCompression(mems, 1000, 100, config);
    const learning = result.memories.find((m) => m.id === '2');
    const procedural = result.memories.find((m) => m.id === '3');
    expect(learning?.summary.length ?? 0).toBeLessThan(200);
    expect(procedural?.summary.length ?? 0).toBeLessThan(200);
    expect(result.tokensSaved).toBeGreaterThan(0);
  });

  it('saves tokens when compression applied', () => {
    const mems = [
      makeMemory('1', 'semantic', 'a'.repeat(500)),
      makeMemory('2', 'semantic', 'b'.repeat(500)),
    ];
    const config = makeConfig({ maxCompressionRatio: 0.5, minSummaryLength: 10 });
    const result = applyCompression(mems, 2000, 100, config);
    expect(result.tokensSaved).toBeGreaterThan(0);
    for (const m of result.memories) {
      expect(m.summary.length).toBeLessThan(500);
    }
  });

  it('returns unchanged when maxTokens equals currentTokens', () => {
    const mem = makeMemory('1', 'semantic', 'a'.repeat(500));
    const mems = [mem];
    const config = makeConfig({ enabled: true });
    const result = applyCompression(mems, 100, 100, config);
    expect(result.memories.some((m) => m.summary === mem.summary)).toBe(true);
    expect(result.tokensSaved).toBe(0);
  });

  it('handles empty memories array', () => {
    const config = makeConfig();
    const result = applyCompression([], 1000, 100, config);
    expect(result.memories.length).toBe(0);
    expect(result.tokensSaved).toBe(0);
  });

  it('maxCompressionRatio = 0 produces minLength summaries', () => {
    const mems = [makeMemory('1', 'semantic', 'a'.repeat(500))];
    const config = makeConfig({ maxCompressionRatio: 0, minSummaryLength: 20 });
    const result = applyCompression(mems, 1000, 100, config);
    const first = result.memories.at(0);
    expect(first?.summary.length ?? 0).toBeGreaterThanOrEqual(20);
    expect(result.tokensSaved).toBeGreaterThan(0);
  });

  it('single-word string truncated at maxChars boundary', () => {
    const mem = makeMemory('1', 'semantic', 'aaaaaaaaaa');
    const result = compressMemorySummary(mem, 5, 3);
    expect(result.summary.length).toBeLessThan(10);
  });
});
