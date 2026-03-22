import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import types directly from the files where they're defined
import type { PsychMemConfig } from '../types.js';
import type { MemoryDatabase } from '../storage/database.js';
import { createMemoryDatabase } from '../storage/database.js';
import { getAtomicMemories, type InjectionState, selectMemoriesForInjection } from '../adapters/opencode/injection.js';
import { DEFAULT_CONFIG } from '../config.js';

// Mock the logger to avoid output during tests
vi.mock('../../../logger.js', () => ({
  log: vi.fn(),
}));

describe('Integration Tests: Retrieval and Injection Flow', () => {
  let db: MemoryDatabase;
  let config: PsychMemConfig;
  let injectionState: InjectionState;
  const testWorktree = '/tmp/test-project';

  beforeEach(async () => {
    // Create a fresh database for each test
    config = { ...DEFAULT_CONFIG, dbPath: './test-db.sqlite' };
    db = await createMemoryDatabase(config);
    
    // Setup injection state
    injectionState = {
      db,
      worktree: testWorktree
    };
    
    // Clear any existing data
    try {
      const fs = await import('fs');
      if (fs.existsSync('./test-db.sqlite')) {
        fs.unlinkSync('./test-db.sqlite');
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    
    // Re-initialize database after cleanup
    db = await createMemoryDatabase(config);
    injectionState.db = db;
  });

  afterEach(async () => {
    await db.close();
    // Clean up test database file
    try {
      const fs = await import('fs');
      if (fs.existsSync('./test-db.sqlite')) {
        fs.unlinkSync('./test-db.sqlite');
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('Semantic Retrieval with Embeddings Active/Inactive', () => {
    it('should retrieve memories using Jaccard similarity when embeddings are disabled', async () => {
      // Store test memories
      await db.createMemory('stm', 'learning', 'JavaScript array map function', [], {
        sessionId: 'test-session-1',
        projectScope: testWorktree,
        importance: 0.8
      });
      
      await db.createMemory('stm', 'learning', 'Python list comprehension syntax', [], {
        sessionId: 'test-session-2',
        projectScope: testWorktree,
        importance: 0.7
      });

      // Test retrieval with query (should use Jaccard similarity)
      const memories = await getAtomicMemories(injectionState, 'JavaScript map function', 5, 2000);
      
      expect(memories.length).toBeGreaterThan(0);
      // The first result should be the JavaScript memory due to higher similarity
      expect(memories[0]?.summary).toContain('JavaScript array map function');
    });

    it('should fall back to scope-based retrieval when query is empty', async () => {
      // Store test memories
      await db.createMemory('stm', 'learning', 'JavaScript closure scope', [], {
        sessionId: 'test-session-1',
        projectScope: testWorktree,
        importance: 0.9
      });
      
      await db.createMemory('stm', 'learning', 'Global CSS reset rules', [], {
        sessionId: 'test-session-2',
        projectScope: null, // Global scope
        importance: 0.8
      });

      // Test retrieval with empty query (should fall back to scope-based)
      const memories = await getAtomicMemories(injectionState, '', 5, 2000);
      
      expect(memories.length).toBeGreaterThan(0);
      // Should return memories sorted by strength (importance affects strength)
      // The JavaScript memory should rank higher due to higher importance
    });
  });

  describe('Token Budget and Priority Ordering', () => {
    it('should respect token budget when selecting memories', async () => {
      // Store many memories that would exceed token budget
      for (let i = 0; i < 20; i++) {
        await db.createMemory('stm', 'learning', 
          `This is test memory number ${i} with substantial content to consume tokens quickly`, 
          [], {
            sessionId: `test-session-${i}`,
            projectScope: testWorktree,
            importance: 0.5
          });
      }

      // Select memories with tight token constraint
      const memories = await selectMemoriesForInjection(
        db,
        testWorktree,
        'test query',
        false, // embeddingsDisabled
        5,     // maxMemories
        100    // maxTokens - very low to test budgeting
      );

      // Verify we respect both constraints
      expect(memories.length).toBeLessThanOrEqual(5);
      
      // Calculate estimated tokens (rough check)
      const estimateTokens = (text: string) => Math.ceil(text.length / 4);
      const totalTokens = memories.reduce((sum: number, mem: any) => {
        const storeLabel = mem.store === 'ltm' ? 'LTM' : 'STM';
        const xmlEnvelope = `<memory classification="${mem.classification}" store="${storeLabel}" strength="${mem.strength.toFixed(2)}"></memory>`;
        return sum + estimateTokens(mem.summary) + estimateTokens(xmlEnvelope) + 8;
      }, 0);
      
      expect(totalTokens).toBeLessThanOrEqual(100);
    });

    it('should prioritize memories by classification tier', async () => {
      // Store memories of different classifications
      await db.createMemory('stm', 'constraint', 'Never use eval in production', [], {
        sessionId: 'constraint-session',
        projectScope: testWorktree,
        importance: 0.9
      });
      
      await db.createMemory('stm', 'learning', 'How to use promises effectively', [], {
        sessionId: 'learning-session',
        projectScope: testWorktree,
        importance: 0.8
      });
      
      await db.createMemory('stm', 'episodic', 'Fixed the login bug yesterday', [], {
        sessionId: 'episodic-session',
        projectScope: testWorktree,
        importance: 0.7
      });

      // Select memories - constraints should come first despite equal importance
      const memories = await selectMemoriesForInjection(
        db,
        testWorktree,
        'test query',
        false, // embeddingsDisabled
        10,    // maxMemories
        2000   // maxTokens
      );

      // Verify prioritization: constraint (tier 0) should be first
      expect(memories.length).toBeGreaterThan(0);
      if (memories.length > 0) {
        expect(memories[0]?.classification).toBe('constraint');
      }
      
      // Learning (tier 2) should come before episodic (tier 3)
      const learningIndex = memories.findIndex((m: any) => m.classification === 'learning');
      const episodicIndex = memories.findIndex((m: any) => m.classification === 'episodic');
      expect(learningIndex).toBeGreaterThanOrEqual(0);
      expect(episodicIndex).toBeGreaterThanOrEqual(0);
      expect(learningIndex).toBeLessThan(episodicIndex);
    });
  });

  describe('Project Scope Isolation', () => {
    it('should isolate memories by project scope', async () => {
      const projectA = '/projects/project-a';
      const projectB = '/projects/project-b';
      
      // Store memories in project A
      await db.createMemory('stm', 'learning', 'Project A specific utility function', [], {
        sessionId: 'proj-a-session',
        projectScope: projectA,
        importance: 0.9
      });
      
      // Store memories in project B
      await db.createMemory('stm', 'learning', 'Project B specific utility function', [], {
        sessionId: 'proj-b-session',
        projectScope: projectB,
        importance: 0.9
      });
      
      // Store global memories
      await db.createMemory('stm', 'learning', 'Global programming best practice', [], {
        sessionId: 'global-session',
        projectScope: null,
        importance: 0.8
      });

      // Test retrieval for project A - should get project A memories + global
      const projectAMemories = await getAtomicMemories(
        { db, worktree: projectA },
        'utility function',
        10,
        2000
      );
      
      const projectAAIds = projectAMemories.map((m: any) => m.projectScope);
      expect(projectAAIds).toContain(projectA); // Has project A memories
      expect(projectAAIds).toContain(undefined); // Has global memories
      expect(projectAAIds).not.toContain(projectB); // Should NOT have project B memories

      // Test retrieval for project B - should get project B memories + global
      const projectBMemories = await getAtomicMemories(
        { db, worktree: projectB },
        'utility function',
        10,
        2000
      );
      
      const projectBIds = projectBMemories.map((m: any) => m.projectScope);
      expect(projectBIds).toContain(projectB); // Has project B memories
      expect(projectBIds).toContain(undefined); // Has global memories
      expect(projectBIds).not.toContain(projectA); // Should NOT have project A memories
    });

    it('should return only global memories when project scope is invalid', async () => {
      // Store global memory
      await db.createMemory('stm', 'learning', 'Global memory accessible everywhere', [], {
        sessionId: 'global-session',
        projectScope: null,
        importance: 0.8
      });
      
      // Store project memory
      await db.createMemory('stm', 'learning', 'Project specific memory', [], {
        sessionId: 'project-session',
        projectScope: testWorktree,
        importance: 0.9
      });

      // Test with invalid project scope (root path)
      const memories = await getAtomicMemories(
        { db, worktree: '/' }, // Invalid scope per getMemoriesByScope logic
        'memory',
        10,
        2000
      );
      
      // Should only return global memories
      expect(memories.every((m: any) => m.projectScope === undefined)).toBe(true);
      expect(memories.length).toBeGreaterThan(0);
    });
  });

  describe('Fallback Mechanisms', () => {
    it('should fallback to Jaccard similarity when embedding service fails', async () => {
      // Store test memory
      await db.createMemory('stm', 'learning', 'React useEffect hook usage', [], {
        sessionId: 'test-session',
        projectScope: testWorktree,
        importance: 0.8
      });

      // Mock embedding service failure
      vi.mock('../../../memory/embeddings-nlp.js', () => ({
        EmbeddingService: {
          getInstance: vi.fn(() => ({
            isEnabled: vi.fn(() => true),
            getEmbeddings: vi.fn().mockRejectedValue(new Error('Embedding service unavailable'))
          }))
        }
      }));
      
      // Test retrieval - should still work via Jaccard fallback
      const memories = await db.vectorSearch('React hook useEffect', testWorktree, 5);
      
      // Restore mock
      vi.restoreAllMocks();
      
      expect(memories.length).toBeGreaterThan(0);
      expect(memories[0]?.summary).toContain('React useEffect hook usage');
    });

    it('should return strength-sorted memories when query is empty and RuVector unavailable', async () => {
      // Store memories with different strengths
      await db.createMemory('stm', 'learning', 'Weak memory content', [], {
        sessionId: 'weak-session',
        projectScope: testWorktree,
        importance: 0.3
      });
      
      await db.createMemory('stm', 'learning', 'Strong memory content with important concepts', [], {
        sessionId: 'strong-session',
        projectScope: testWorktree,
        importance: 0.9
      });

      // Test with empty query
      const memories = await db.vectorSearch('', testWorktree, 10);
      
      // Should return memories sorted by strength (descending)
      expect(memories.length).toBeGreaterThan(0);
      if (memories.length >= 2) {
        const firstStrength = memories[0]?.strength ?? 0;
        const secondStrength = memories[1]?.strength ?? 0;
        expect(firstStrength).toBeGreaterThanOrEqual(secondStrength);
      }
      
      // Stronger memory should come first
      const strongMemoryIndex = memories.findIndex((m: any) => m.summary.includes('Strong memory'));
      const weakMemoryIndex = memories.findIndex((m: any) => m.summary.includes('Weak memory'));
      expect(strongMemoryIndex).toBeLessThan(weakMemoryIndex);
    });
  });

  describe('Performance Requirements', () => {
    it('should complete memory selection within acceptable latency', async () => {
      // Store several memories
      for (let i = 0; i < 15; i++) {
        await db.createMemory('stm', 'learning', 
          `Memory content ${i} with various technical details about programming concepts`, 
          [], {
            sessionId: `session-${i}`,
            projectScope: testWorktree,
            importance: 0.5 + (Math.random() * 0.4)
          });
      }

      // Time the selection operation
      const startTime = Date.now();
      const memories = await selectMemoriesForInjection(
        db,
        testWorktree,
        'programming concepts technical details',
        false, // embeddingsDisabled
        10,    // maxMemories
        2000   // maxTokens
      );
      const endTime = Date.now();
      
      const latencyMs = endTime - startTime;
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(latencyMs).toBeLessThan(500); // 500ms threshold
      expect(memories.length).toBeGreaterThan(0);
    });
  });
});
