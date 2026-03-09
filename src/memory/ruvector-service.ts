/**
 * Integration Service for RuVector
 * Acts as a semantic search engine O(log N) using HNSW,
 * complementing the relational storage of SQLite.
 */

import { VectorDB } from 'ruvector';
import { homedir } from 'os';
import { join } from 'path';
import { log } from '../logger.js';
import { EmbeddingService } from './embeddings-nlp.js';

const VECTOR_DB_PATH = join(homedir(), '.ai-vector-memories', 'ruvector.db');

export class RuVectorService {
  private static instance: RuVectorService;
  private db: any = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): RuVectorService {
    if (!RuVectorService.instance) {
      RuVectorService.instance = new RuVectorService();
    }
    return RuVectorService.instance;
  }

  /**
   * Init the RuVector database. Should be called once at startup.
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;
    try {
      // Dimensions 384 to match the all-MiniLM-L6-v2 model used in AI Memory's embedding service
      this.db = new VectorDB({
        dimensions: 384,
        storagePath: VECTOR_DB_PATH,
        distanceMetric: 'Cosine'
      });
      this.initialized = true;
      log(`[RuVector] Vector database initialized at ${VECTOR_DB_PATH}`);
      return true;
    } catch (error) {
      log(`[RuVector] Error initializing: ${String(error)}`);
      return false;
    }
  }

  /**
   * Generates the embedding and inserts it into RuVector with the necessary metadata.
   */
  async insertMemory(memoryId: string, text: string, projectScope?: string | null): Promise<void> {
    if (!this.initialized || !this.db) return;
    
    try {
      const embeddingService = EmbeddingService.getInstance();
      if (!embeddingService.isEnabled()) return;
      
      const embeddings = await embeddingService.getEmbeddings([text]);
      if (!embeddings || !embeddings[0]) return;

      // Insert the vector paired with the SQLite ID and its scope (project or global)
      await this.db.insert({
        vector: new Float32Array(embeddings[0]),
        metadata: { 
          memoryId, 
          projectScope: projectScope || 'global' 
        }
      });
      log(`[RuVector] Memory ${memoryId.slice(0,8)}... vectorized and saved.`);
    } catch (error) {
      log(`[RuVector] Error inserting memory: ${String(error)}`);
    }
  }

  /**
   * Searches for the most relevant memories using HNSW.
   * Returns an array of SQLite IDs.
   */
  async searchMemories(queryText: string, projectScope?: string | null, limit: number = 10): Promise<string[]> {
    if (!this.initialized || !this.db) return [];
    
    try {
      const embeddingService = EmbeddingService.getInstance();
      if (!embeddingService.isEnabled()) return [];

      const queryEmbeddings = await embeddingService.getEmbeddings([queryText]);
      if (!queryEmbeddings || !queryEmbeddings[0]) return [];

      // Filter by project using RuVector metadata if projectScope is provided
      const filter = projectScope ? { projectScope } : undefined;

      const results = await this.db.search({
        vector: new Float32Array(queryEmbeddings[0]),
        k: limit,
        filter
      });

      // results is an array of objects with metadata
      return results.map((r: any) => r.metadata.memoryId);
    } catch (error) {
      log(`[RuVector] Error in semantic search: ${String(error)}`);
      return [];
    }
  }
}