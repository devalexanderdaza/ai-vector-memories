import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MemoryDatabase } from '../storage/database.js';
import type { MemoryUnit } from '../types.js';
import { selectMemoriesForInjection, computeQuotaSlots } from '../adapters/opencode/injection.js';
import { getAdaptiveQuotaConfig } from '../config/config.js';
import { DEFAULT_ADAPTIVE_QUOTA_CONFIG } from '../types/config.js';

function makeMemory(
  id: string,
  classification: MemoryUnit['classification'],
  projectScope: string | null,
  strength: number,
): MemoryUnit {
  return {
    id,
    sessionId: undefined,
    store: 'ltm',
    classification,
    summary: `${id} summary content`,
    sourceEventIds: [],
    projectScope: projectScope ?? undefined,
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
    strength,
    decayRate: 0.05,
    tags: [],
    associations: [],
    status: 'active',
    version: 1,
    evidence: [],
    embedding: undefined,
  };
}

function createStubDb(memories: MemoryUnit[], vectorResults?: MemoryUnit[]): MemoryDatabase {
  return {
    getMemoriesByScope: () => memories,
    vectorSearch: async () => vectorResults ?? memories,
  } as unknown as MemoryDatabase;
}

const ENV_KEYS = [
  'TRUE_MEM_ADAPTIVE_QUOTA_ENABLED',
  'TRUE_MEM_QUOTA_GLOBAL_MIN_RATIO',
  'TRUE_MEM_QUOTA_PROJECT_MIN_RATIO',
  'TRUE_MEM_QUOTA_FLEXIBLE_RATIO',
  'TRUE_MEM_QUOTA_ADJUSTMENT_STEP',
  'TRUE_MEM_QUOTA_MIN_SAMPLES',
  'TRUE_MEM_QUOTA_TARGET_PROJECT_RATIO',
  'TRUE_MEM_QUOTA_HIGH_TOKEN_THRESHOLD',
] as const;

const previousEnv = new Map<string, string | undefined>();

describe('adaptive quota policy', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      previousEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = previousEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    previousEnv.clear();
  });

  it('normalizes invalid ratio values from env config', () => {
    process.env.TRUE_MEM_ADAPTIVE_QUOTA_ENABLED = '1';
    process.env.TRUE_MEM_QUOTA_GLOBAL_MIN_RATIO = '2';
    process.env.TRUE_MEM_QUOTA_PROJECT_MIN_RATIO = '-1';
    process.env.TRUE_MEM_QUOTA_FLEXIBLE_RATIO = '3';

    const adaptiveConfig = getAdaptiveQuotaConfig();
    const ratioSum =
      adaptiveConfig.globalMinRatio +
      adaptiveConfig.projectMinRatio +
      adaptiveConfig.flexibleRatio;

    expect(adaptiveConfig.enabled).toBe(true);
    expect(ratioSum).toBeCloseTo(1, 6);
    expect(adaptiveConfig.globalMinRatio).toBeGreaterThanOrEqual(0);
    expect(adaptiveConfig.projectMinRatio).toBeGreaterThanOrEqual(0);
    expect(adaptiveConfig.flexibleRatio).toBeGreaterThanOrEqual(0);
  });

  it('computes deterministic slot boundaries for small maxMemories', () => {
    const slots = computeQuotaSlots(3, {
      ...DEFAULT_ADAPTIVE_QUOTA_CONFIG,
      enabled: true,
      globalMinRatio: 0.34,
      projectMinRatio: 0.33,
      flexibleRatio: 0.33,
    });

    expect(slots.minGlobal).toBe(1);
    expect(slots.minProject).toBe(0);
    expect(slots.maxFlexible).toBe(2);
    expect(slots.minGlobal + slots.minProject + slots.maxFlexible).toBe(3);
  });

  it('prevents cross-project leakage when vector search returns foreign memories', async () => {
    process.env.TRUE_MEM_ADAPTIVE_QUOTA_ENABLED = '1';
    process.env.TRUE_MEM_QUOTA_GLOBAL_MIN_RATIO = '0.2';
    process.env.TRUE_MEM_QUOTA_PROJECT_MIN_RATIO = '0.6';
    process.env.TRUE_MEM_QUOTA_FLEXIBLE_RATIO = '0.2';
    process.env.TRUE_MEM_QUOTA_MIN_SAMPLES = '999';

    const worktree = '/project-a';
    const foreignWorktree = '/project-b';
    const allMemories = [
      makeMemory('g-1', 'learning', null, 0.9),
      makeMemory('p-1', 'decision', worktree, 0.8),
      makeMemory('p-2', 'semantic', worktree, 0.7),
      makeMemory('f-1', 'learning', foreignWorktree, 0.99),
    ];
    const vectorResults = [
      makeMemory('f-2', 'decision', foreignWorktree, 0.99),
      makeMemory('p-3', 'learning', worktree, 0.6),
      makeMemory('g-2', 'semantic', null, 0.5),
    ];

    const selected = await selectMemoriesForInjection(
      createStubDb(allMemories, vectorResults),
      worktree,
      'project specific context',
      true,
      6,
      4000,
    );

    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((memory) => memory.projectScope == null || memory.projectScope === worktree)).toBe(true);
  });

  it('falls back to static quota behavior when adaptive mode is disabled', async () => {
    process.env.TRUE_MEM_ADAPTIVE_QUOTA_ENABLED = '0';

    const worktree = '/project-static';
    const memories: MemoryUnit[] = [];

    for (let i = 0; i < 10; i++) {
      memories.push(makeMemory(`g-${i}`, 'learning', null, 0.9 - i * 0.01));
      memories.push(makeMemory(`p-${i}`, 'decision', worktree, 0.85 - i * 0.01));
    }

    const selected = await selectMemoriesForInjection(
      createStubDb(memories),
      worktree,
      '',
      false,
      10,
      4000,
    );

    const globalCount = selected.filter((memory) => memory.projectScope == null).length;
    const projectCount = selected.filter((memory) => memory.projectScope === worktree).length;

    expect(globalCount).toBeGreaterThanOrEqual(3);
    expect(projectCount).toBeGreaterThanOrEqual(3);
  });
});
