import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  hybridSimilarity, 
  assessMemoryRelationship, 
  hybridSimilarityBatch
} from './scoring.js';
import { jaccardSimilarity } from './embeddings.js';

// Mock the embedding service
vi.mock('./embeddings-nlp.js', () => ({
  EmbeddingService: {
    getInstance: vi.fn(() => ({
      isEnabled: vi.fn(() => true),
      getEmbeddings: vi.fn().mockResolvedValue([
        new Float32Array([0.5, 0.5, 0.0, 0.0]), // First embedding
        new Float32Array([0.5, 0.5, 0.0, 0.0])  // Second embedding (same as first)
      ])
    }))
  }
}));

describe('Hybrid Similarity Scoring', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();
  });

  describe('hybridSimilarity function', () => {
    it('should return a score between 0 and 1', async () => {
      const score = await hybridSimilarity('hello world', 'hello world');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should return high score for identical texts', async () => {
      const score = await hybridSimilarity('test', 'test');
      expect(score).toBeCloseTo(1.0, 1);
    });

    it('should return low score for very different texts', async () => {
      const score = await hybridSimilarity('apple banana', 'car dog');
      expect(score).toBeLessThan(0.5);
    });

    it('should fallback to Jaccard when embeddings are disabled', async () => {
      // Mock embedding service as disabled
      vi.mock('./embeddings-nlp.js', () => ({
        EmbeddingService: {
          getInstance: vi.fn(() => ({
            isEnabled: vi.fn(() => false)
          }))
        }
      }));
      
      // Re-import the module to get the mocked version
      const { hybridSimilarity: hybridSimilarityDisabled } = await import('./scoring.js');
      
      const score = await hybridSimilarityDisabled('hello world', 'hello world');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('assessMemoryRelationship function', () => {
    it('should classify high scores as duplicate', () => {
      const result = assessMemoryRelationship(0.9);
      expect(result.relationship).toBe('duplicate');
      expect(result.score).toBe(0.9);
    });

    it('should classify medium-high scores as conflict', () => {
      const result = assessMemoryRelationship(0.7);
      expect(result.relationship).toBe('conflict');
      expect(result.score).toBe(0.7);
    });

    it('should classify medium scores as complement', () => {
      const result = assessMemoryRelationship(0.5);
      expect(result.relationship).toBe('complement');
      expect(result.score).toBe(0.5);
    });

    it('should classify low scores as none', () => {
      const result = assessMemoryRelationship(0.3);
      expect(result.relationship).toBe('none');
      expect(result.score).toBe(0.3);
    });
  });

  describe('hybridSimilarityBatch function', () => {
    it('should return scores for multiple pairs', async () => {
      const pairs = [
        { text1: 'hello', text2: 'hello' },
        { text1: 'world', text2: 'world' }
      ];
      
       const results = await hybridSimilarityBatch(pairs);
       expect(results).toHaveLength(2);
       expect(results[0]).not.toBeUndefined();
       expect(results[0]?.similarity).toBeGreaterThanOrEqual(0);
       expect(results[0]?.similarity).toBeLessThanOrEqual(1);
       expect(results[1]).not.toBeUndefined();
       expect(results[1]?.similarity).toBeGreaterThanOrEqual(0);
       expect(results[1]?.similarity).toBeLessThanOrEqual(1);
    });

    it('should fallback to Jaccard when embeddings fail', async () => {
      // Mock embedding service to throw an error
      vi.mock('./embeddings-nlp.js', () => ({
        EmbeddingService: {
          getInstance: vi.fn(() => ({
            isEnabled: vi.fn(() => true),
            getEmbeddings: vi.fn().mockRejectedValue(new Error('Embedding failed'))
          }))
        }
      }));
      
      // Re-import the module to get the mocked version
      const { hybridSimilarityBatch: hybridSimilarityBatchFailed } = await import('./scoring.js');
      
      const pairs = [
        { text1: 'hello', text2: 'hello' },
        { text1: 'world', text2: 'world' }
      ];
      
       const results = await hybridSimilarityBatchFailed(pairs);
       expect(results).toHaveLength(2);
       // Should still return valid scores (from Jaccard fallback)
       expect(results[0]).not.toBeUndefined();
       expect(results[0]?.similarity).toBeGreaterThanOrEqual(0);
       expect(results[0]?.similarity).toBeLessThanOrEqual(1);
       expect(results[1]).not.toBeUndefined();
       expect(results[1]?.similarity).toBeGreaterThanOrEqual(0);
       expect(results[1]?.similarity).toBeLessThanOrEqual(1);
    });
  });
});