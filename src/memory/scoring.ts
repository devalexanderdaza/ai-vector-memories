/**
 * Hybrid Memory Scoring System
 * Combines Jaccard similarity (lexical) and cosine similarity (semantic) with configurable weights
 */

import { log } from '../logger.js';
import { jaccardSimilarity } from './embeddings.js';
import type { TrueMemUserConfig } from '../types/config.js';
import { loadConfig } from '../config/config.js';

/**
 * Configuration interface for hybrid scoring
 */
export interface HybridScoreConfig {
  /** Weight for Jaccard similarity (0-1) */
  jaccardWeight: number;
  /** Weight for semantic similarity (0-1) */
  semanticWeight: number;
  /** Threshold for considering memories as duplicates */
  duplicateThreshold: number;
  /** Threshold for considering memories as conflicting */
  conflictThreshold: number;
  /** Threshold for considering memories as complementary */
  complementThreshold: number;
}

/**
 * Default hybrid score configuration
 */
const DEFAULT_HYBRID_SCORE_CONFIG: HybridScoreConfig = {
  jaccardWeight: 0.3,
  semanticWeight: 0.7,
  duplicateThreshold: 0.85,
  conflictThreshold: 0.65,
  complementThreshold: 0.4,
};

/**
 * Load hybrid score configuration from user config
 */
function loadHybridScoreConfig(): HybridScoreConfig {
  const userConfig = loadConfig();
  
  // For now, use fixed weights and thresholds
  // In the future, these could be made configurable via user config
  return {
    ...DEFAULT_HYBRID_SCORE_CONFIG,
    // Override weights based on embeddings setting
    jaccardWeight: userConfig.embeddingsEnabled ? 0.3 : 1.0,
    semanticWeight: userConfig.embeddingsEnabled ? 0.7 : 0.0,
  };
}

/**
 * Calculate semantic similarity using cosine similarity of embeddings
 * This is a simplified version - in practice, this would use the embedding service
 */
export async function semanticSimilarity(text1: string, text2: string): Promise<number> {
  try {
    // Import the embedding service dynamically to avoid circular dependencies
    const { EmbeddingService } = await import('./embeddings-nlp.js');
    const embeddingService = EmbeddingService.getInstance();
    
    if (!embeddingService.isEnabled()) {
      // If embeddings are disabled, return 0 (will be handled in hybrid score)
      return 0;
    }
    
    const embeddings = await embeddingService.getEmbeddings([text1, text2]);
    
    if (embeddings && embeddings.length === 2 && embeddings[0] && embeddings[1]) {
      // Calculate cosine similarity
      return cosineSimilarityArrays(embeddings[0], embeddings[1]);
    }
    
    return 0;
  } catch (error) {
    log('Error calculating semantic similarity, falling back to 0', { error });
    return 0;
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarityArrays(vec1: number[], vec2: number[]): number {
  if (!vec1 || !vec2 || vec1.length === 0 || vec2.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    const v1 = vec1[i] ?? 0;
    const v2 = vec2[i] ?? 0;
    dotProduct += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (denominator === 0) return 0;
  
  return dotProduct / denominator;
}

/**
 * Calculate hybrid similarity score combining Jaccard and semantic similarities
 * @param text1 - First text
 * @param text2 - Second text
 * @returns Promise<number> - Hybrid similarity score (0-1)
 */
export async function hybridSimilarity(text1: string, text2: string): Promise<number> {
  try {
    // Calculate Jaccard similarity (always available)
    const jaccardScore = jaccardSimilarity(text1, text2);
    
    // Load configuration to get weights
    const config = loadHybridScoreConfig();
    
    // If embeddings are disabled or not available, return Jaccard only
    if (config.semanticWeight === 0) {
      return jaccardScore;
    }
    
    // Calculate semantic similarity
    const semanticScore = await semanticSimilarity(text1, text2);
    
    // Combine scores with weights
    const hybridScore = (jaccardScore * config.jaccardWeight) + (semanticScore * config.semanticWeight);
    
    // Ensure score is within bounds
    return Math.max(0, Math.min(1, hybridScore));
  } catch (error) {
    log('Error in hybrid similarity calculation, falling back to Jaccard only', { error });
    // Fallback to Jaccard only on error
    return jaccardSimilarity(text1, text2);
  }
}

/**
 * Determine memory relationship based on hybrid score and thresholds
 * @param score - Hybrid similarity score (0-1)
 * @returns {relationship: 'duplicate' | 'conflict' | 'complement' | 'none', score: number}
 */
export function assessMemoryRelationship(score: number): { 
  relationship: 'duplicate' | 'conflict' | 'complement' | 'none'; 
  score: number 
} {
  const config = loadHybridScoreConfig();
  
  if (score >= config.duplicateThreshold) {
    return { relationship: 'duplicate', score };
  } else if (score >= config.conflictThreshold) {
    return { relationship: 'conflict', score };
  } else if (score >= config.complementThreshold) {
    return { relationship: 'complement', score };
  } else {
    return { relationship: 'none', score };
  }
}

/**
 * Batch calculate hybrid similarities for multiple text pairs
 * @param pairs - Array of {text1, text2} pairs
 * @returns Promise<Array<{similarity: number, relationship: string, score: number}>>
 */
export async function hybridSimilarityBatch(
  pairs: { text1: string; text2: string }[]
): Promise<Array<{ 
  similarity: number; 
  relationship: 'duplicate' | 'conflict' | 'complement' | 'none'; 
  score: number 
}>> {
  try {
    if (pairs.length === 0) return [];
    
    // Load configuration
    const config = loadHybridScoreConfig();
    
    // If embeddings are disabled, calculate Jaccard only for all pairs
    if (config.semanticWeight === 0) {
      const jaccardScores = pairs.map(({ text1, text2 }) => jaccardSimilarity(text1, text2));
      return jaccardScores.map(score => ({
        similarity: score,
        ...assessMemoryRelationship(score)
      }));
    }
    
    // Import embedding service
    const { EmbeddingService } = await import('./embeddings-nlp.js');
    const embeddingService = EmbeddingService.getInstance();
    
    if (!embeddingService.isEnabled()) {
      // Fallback to Jaccard only
      const jaccardScores = pairs.map(({ text1, text2 }) => jaccardSimilarity(text1, text2));
      return jaccardScores.map(score => ({
        similarity: score,
        ...assessMemoryRelationship(score)
      }));
    }
    
    // Extract all unique texts for batch embedding
    const allTexts: string[] = [];
    const textPairs: { text1: string; text2: string }[] = [];
    
    for (const pair of pairs) {
      allTexts.push(pair.text1);
      allTexts.push(pair.text2);
      textPairs.push({ text1: pair.text1, text2: pair.text2 });
    }
    
    // Get embeddings for all texts
    const embeddings = await embeddingService.getEmbeddings(allTexts);
    
    if (!embeddings) {
      // Fallback to Jaccard only
      const jaccardScores = pairs.map(pair => jaccardSimilarity(pair.text1, pair.text2));
      return jaccardScores.map(score => ({
        similarity: score,
        ...assessMemoryRelationship(score)
      }));
    }
    
    // Calculate hybrid scores for each pair
    const results: Array<{ 
      similarity: number; 
      relationship: 'duplicate' | 'conflict' | 'complement' | 'none'; 
      score: number 
    }> = [];
    
    for (let i = 0; i < textPairs.length; i++) {
      const pair = textPairs[i];
      if (!pair) continue;
      
      // Calculate Jaccard similarity
      const jaccardScore = jaccardSimilarity(pair.text1, pair.text2);
      
      // Get embeddings for this pair (with bounds checking)
      const embeddingIndex = i * 2;
      const embedding1 = embeddings[embeddingIndex];
      const embedding2 = embeddings[embeddingIndex + 1];
      
      // Calculate semantic similarity if embeddings available
      let semanticScore = 0;
      if (embedding1 && embedding2) {
        semanticScore = cosineSimilarityArrays(embedding1, embedding2);
      }
      
      // Combine scores with weights
      const hybridScore = (jaccardScore * config.jaccardWeight) + (semanticScore * config.semanticWeight);
      const boundedScore = Math.max(0, Math.min(1, hybridScore));
      
      // Assess relationship
      const { relationship } = assessMemoryRelationship(boundedScore);
      
      results.push({
        similarity: boundedScore,
        relationship,
        score: boundedScore
      });
    }
    
    return results;
  } catch (error) {
    log('Error in batch hybrid similarity calculation, falling back to Jaccard only', { error });
    // Fallback to Jaccard only
    const jaccardScores = pairs.map(({ text1, text2 }) => jaccardSimilarity(text1, text2));
    return jaccardScores.map(score => ({
      similarity: score,
      ...assessMemoryRelationship(score)
    }));
  }
}