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

export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  enabled: false,
  maxCompressionRatio: 0.5,
  minSummaryLength: 50,
  excludedTiers: [0, 1],
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
};

/**
 * Default runtime state
 */
export const DEFAULT_STATE: TrueMemState = {
  embeddingsEnabled: false,
  lastEnvCheck: null,
  nodePath: null,
};
