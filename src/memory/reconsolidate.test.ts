import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  handleReconsolidation,
  isRelevant,
  getSimilarityThresholds,
  type ReconsolidationAction
} from './reconsolidate.js';
import type { MemoryUnit, MemoryClassification, MemoryStore } from '../types.js';

// Mock the database
const createMockDb = () => ({
  incrementFrequency: vi.fn(),
  getMemory: vi.fn(),
});

// Mock memory data
const createMockMemory = (overrides: Partial<MemoryUnit> = {}): MemoryUnit => ({
  id: 'existing-memory-id',
  sessionId: 'session-123',
  store: 'ltm' as MemoryStore,
  classification: 'decision' as MemoryClassification,
  summary: 'Existing memory summary',
  sourceEventIds: ['event-1', 'event-2'],
  projectScope: 'test-project',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  lastAccessedAt: new Date('2026-01-01'),
  recency: 0.8,
  frequency: 5,
  importance: 0.7,
  utility: 0.6,
  novelty: 0.4,
  confidence: 0.9,
  interference: 0.2,
  strength: 0.75,
  decayRate: 0.1,
  tags: ['test', 'memory'],
  associations: ['associated-memory'],
  status: 'active',
  version: 1,
  evidence: [],
  ...overrides,
});

const createMockNewMemoryData = (overrides: Partial<MemoryUnit> = {}) => ({
  summary: 'New memory summary',
  classification: 'decision' as MemoryClassification,
  sourceEventIds: ['event-3'],
  store: 'ltm' as MemoryStore,
  ...overrides,
});

describe('Reconsolidation Module', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    vi.resetAllMocks();
  });

  describe('handleReconsolidation function', () => {
    it('should classify high scores as duplicate when classifications match', async () => {
      const existingMemory = createMockMemory();
      const newMemoryData = createMockNewMemoryData({ summary: 'Existing memory summary' }); // Same summary
      const similarity = 0.9; // Above DUPLICATE threshold (0.85)

      const result = await handleReconsolidation(
        mockDb as any,
        newMemoryData,
        existingMemory,
        similarity
      );

      expect(result.type).toBe('duplicate');
      expect(mockDb.incrementFrequency).toHaveBeenCalledWith(existingMemory.id);
    });

    it('should classify medium-high scores as conflict when classifications match', async () => {
      const existingMemory = createMockMemory();
      const newMemoryData = createMockNewMemoryData({ summary: 'Different memory summary' });
      const similarity = 0.75; // Between CONFLICT (0.7) and DUPLICATE (0.85)

      const result = await handleReconsolidation(
        mockDb as any,
        newMemoryData,
        existingMemory,
        similarity
      );

      expect(result.type).toBe('conflict');
      // Since we can't directly access the replacementMemory property due to type narrowing,
      // we'll verify it's a conflict and check what we can
      const conflictResult = result as { type: 'conflict'; replacementMemory: MemoryUnit; existingMemoryId: string };
      expect(conflictResult.replacementMemory.summary).toBe('Different memory summary');
      expect(conflictResult.existingMemoryId).toBe(existingMemory.id);
    });

    it('should classify medium scores as complement when classifications match', async () => {
      const existingMemory = createMockMemory();
      const newMemoryData = createMockNewMemoryData({ summary: 'Somewhat different summary' });
      const similarity = 0.6; // Below CONFLICT threshold (0.7)

      const result = await handleReconsolidation(
        mockDb as any,
        newMemoryData,
        existingMemory,
        similarity
      );

      expect(result.type).toBe('complement');
      // Access newMemory property through type assertion
      const complementResult = result as { type: 'complement'; newMemory: MemoryUnit };
      expect(complementResult.newMemory.summary).toBe('Somewhat different summary');
    });

    it('should treat different classifications as complement regardless of similarity', async () => {
      const existingMemory = createMockMemory({ classification: 'decision' });
      const newMemoryData = createMockNewMemoryData({ 
        classification: 'learning', // Different classification
        summary: 'Any summary' 
      });
      const similarity = 0.9; // High similarity but different classification

      const result = await handleReconsolidation(
        mockDb as any,
        newMemoryData,
        existingMemory,
        similarity
      );

      expect(result.type).toBe('complement');
      const complementResult = result as { type: 'complement'; newMemory: MemoryUnit };
      expect(complementResult.newMemory.classification).toBe('learning');
    });

    it('should handle duplicate with different classifications as complement', async () => {
      const existingMemory = createMockMemory({ classification: 'decision' });
      const newMemoryData = createMockNewMemoryData({ 
        classification: 'preference', // Different classification
        summary: 'Existing memory summary' // Same summary
      });
      const similarity = 0.9; // Would be duplicate if same classification

      const result = await handleReconsolidation(
        mockDb as any,
        newMemoryData,
        existingMemory,
        similarity
      );

      expect(result.type).toBe('complement');
      const complementResult = result as { type: 'complement'; newMemory: MemoryUnit };
      expect(complementResult.newMemory.classification).toBe('preference');
    });
  });

  describe('isRelevant function', () => {
    it('should return true for similarity >= 0.5', () => {
      expect(isRelevant(0.5)).toBe(true);
      expect(isRelevant(0.7)).toBe(true);
      expect(isRelevant(1.0)).toBe(true);
    });

    it('should return false for similarity < 0.5', () => {
      expect(isRelevant(0.4)).toBe(false);
      expect(isRelevant(0.0)).toBe(false);
    });
  });

  describe('getSimilarityThresholds function', () => {
    it('should return the correct thresholds', () => {
      const thresholds = getSimilarityThresholds();
      expect(thresholds.DUPLICATE).toBe(0.85);
      expect(thresholds.CONFLICT).toBe(0.7);
      expect(thresholds.MIN_RELEVANT).toBe(0.5);
    });
  });
});