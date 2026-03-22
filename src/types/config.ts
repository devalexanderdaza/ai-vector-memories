/**
 * AI Vector Memories Configuration Types
 * 
 * Separates user configuration (config.json) from runtime state (state.json)
 */

/**
 * Injection mode types
 */
export type InjectionMode = 0 | 1;

/**
 * Sub-agent mode types
 */
export type SubAgentMode = 0 | 1;

/**
 * Compression configuration for low-priority memory summaries.
 * Opt-in feature that truncates Tier 2-3 summaries when token budget is tight.
 */
export interface CompressionConfig {
  enabled: boolean;
  maxCompressionRatio: number;
  minSummaryLength: number;
  excludedTiers: number[];
}

/**
 * Adaptive quota configuration for memory injection scope allocation.
 * Opt-in feature that adjusts global/project/flexible slots based on recent metrics.
 */
export interface AdaptiveQuotaConfig {
  enabled: boolean;
  globalMinRatio: number;
  projectMinRatio: number;
  flexibleRatio: number;
  adjustmentStep: number;
  minSamplesForAdjustment: number;
  targetProjectRatio: number;
  highTokenUsageThreshold: number;
}

export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  enabled: false,
  maxCompressionRatio: 0.5,
  minSummaryLength: 50,
  excludedTiers: [0, 1],
};

export const DEFAULT_ADAPTIVE_QUOTA_CONFIG: AdaptiveQuotaConfig = {
  enabled: false,
  globalMinRatio: 0.3,
  projectMinRatio: 0.3,
  flexibleRatio: 0.4,
  adjustmentStep: 0.05,
  minSamplesForAdjustment: 20,
  targetProjectRatio: 0.5,
  highTokenUsageThreshold: 85,
};

/**
 * User configuration - persistent settings that users can customize
 * Stored in: ~/.ai-vector-memories/config.json
 */
export interface TrueMemUserConfig {
  injectionMode: InjectionMode;
  subagentMode: SubAgentMode;
  maxMemories: number;
  embeddingsEnabled: number;
  compression: CompressionConfig;
  adaptiveQuota: AdaptiveQuotaConfig;
}

/**
 * Runtime state - internal plugin state (not user-facing)
 * Stored in: ~/.ai-vector-memories/state.json
 */
export interface TrueMemState {
  embeddingsEnabled: boolean;
  lastEnvCheck: string | null;
  nodePath: string | null;
}

/**
 * Default user configuration
 */
export const DEFAULT_USER_CONFIG: TrueMemUserConfig = {
  injectionMode: 1,      // ALWAYS - real-time memory updates
  subagentMode: 1,       // ENABLED
  maxMemories: 20,
  embeddingsEnabled: 0,
  compression: DEFAULT_COMPRESSION_CONFIG,
  adaptiveQuota: DEFAULT_ADAPTIVE_QUOTA_CONFIG,
};

/**
 * Default runtime state
 */
export const DEFAULT_STATE: TrueMemState = {
  embeddingsEnabled: false,
  lastEnvCheck: null,
  nodePath: null,
};
