/**
 * User Configuration Manager
 * 
 * Loads and manages user configuration from config.json with env var override.
 * 
 * Priority (highest to lowest):
 * 1. Environment variables (TRUE_MEM_INJECTION_MODE, TRUE_MEM_SUBAGENT_MODE, TRUE_MEM_MAX_MEMORIES, TRUE_MEM_EMBEDDINGS)
 * 2. config.json file
 * 3. Default values
 * 
 * Config file: ~/.ai-vector-memories/config.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { log } from '../logger.js';
import type {
  TrueMemUserConfig,
  InjectionMode,
  SubAgentMode,
  CompressionConfig,
  AdaptiveQuotaConfig,
} from '../types/config.js';
import {
  DEFAULT_USER_CONFIG,
  DEFAULT_COMPRESSION_CONFIG,
  DEFAULT_ADAPTIVE_QUOTA_CONFIG,
} from '../types/config.js';
import { parseJsonc } from '../utils/jsonc.js';

const CONFIG_DIR = join(homedir(), '.ai-vector-memories');
const CONFIG_FILE = join(CONFIG_DIR, 'config.jsonc');

/**
 * Parse injection mode from env or return default
 */
function parseInjectionMode(envValue: string | undefined): InjectionMode {
  if (!envValue) return DEFAULT_USER_CONFIG.injectionMode;
  
  const parsed = parseInt(envValue, 10);
  
  if (![0, 1].includes(parsed)) {
    log(`Config: Invalid TRUE_MEM_INJECTION_MODE: ${envValue}, using default (${DEFAULT_USER_CONFIG.injectionMode})`);
    return DEFAULT_USER_CONFIG.injectionMode;
  }
  
  return parsed as InjectionMode;
}

/**
 * Parse sub-agent mode from env or return default
 */
function parseSubAgentMode(envValue: string | undefined): SubAgentMode {
  if (!envValue) return DEFAULT_USER_CONFIG.subagentMode;
  
  const parsed = parseInt(envValue, 10);
  
  if (![0, 1].includes(parsed)) {
    log(`Config: Invalid TRUE_MEM_SUBAGENT_MODE: ${envValue}, using default (${DEFAULT_USER_CONFIG.subagentMode})`);
    return DEFAULT_USER_CONFIG.subagentMode;
  }
  
  return parsed as SubAgentMode;
}

/**
 * Parse max memories from env or return default
 */
function parseMaxMemories(envValue: string | undefined): number {
  if (!envValue) return DEFAULT_USER_CONFIG.maxMemories;
  
  const parsed = parseInt(envValue, 10);
  
  if (isNaN(parsed) || parsed < 1) {
    log(`Config: Invalid TRUE_MEM_MAX_MEMORIES: ${envValue}, using default (${DEFAULT_USER_CONFIG.maxMemories})`);
    return DEFAULT_USER_CONFIG.maxMemories;
  }
  
  if (parsed < 10) {
    log(`Config: Warning TRUE_MEM_MAX_MEMORIES=${parsed} may reduce context quality`);
  }
  if (parsed > 50) {
    log(`Config: Warning TRUE_MEM_MAX_MEMORIES=${parsed} may cause token bloat`);
  }
  
  return parsed;
}

/**
 * Validate embeddings enabled from file config
 * Returns 0 or 1, or default if invalid
 */
function validateEmbeddingsEnabled(value: unknown): number {
  if (value === 0 || value === 1) return value;
  log(`Config: Invalid embeddingsEnabled in file: ${value}, using default`);
  return DEFAULT_USER_CONFIG.embeddingsEnabled;
}

/**
 * Parse compression config from env var (TRUE_MEM_COMPRESSION_ENABLED)
 */
function parseCompressionEnabled(envValue: string | undefined): boolean {
  if (!envValue) return DEFAULT_COMPRESSION_CONFIG.enabled;
  const parsed = envValue.trim().toLowerCase();
  if (parsed === '1' || parsed === 'true') return true;
  if (parsed === '0' || parsed === 'false') return false;
  log(`Config: Invalid TRUE_MEM_COMPRESSION_ENABLED: ${envValue}, using default`);
  return DEFAULT_COMPRESSION_CONFIG.enabled;
}

/**
 * Validate compression config from file config
 */
function validateCompressionConfig(value: unknown): CompressionConfig {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_COMPRESSION_CONFIG;
  }
  const cfg = value as Record<string, unknown>;
  const enabled = typeof cfg.enabled === 'boolean' ? cfg.enabled : DEFAULT_COMPRESSION_CONFIG.enabled;
  const maxRatioRaw = cfg.maxCompressionRatio;
  const maxRatio = (typeof maxRatioRaw === 'number' && isFinite(maxRatioRaw))
    ? Math.max(0, Math.min(1, maxRatioRaw))
    : DEFAULT_COMPRESSION_CONFIG.maxCompressionRatio;
  const minLen = typeof cfg.minSummaryLength === 'number'
    ? Math.max(0, cfg.minSummaryLength)
    : DEFAULT_COMPRESSION_CONFIG.minSummaryLength;
  const excludedTiers = Array.isArray(cfg.excludedTiers)
    ? cfg.excludedTiers.filter((t): t is number => typeof t === 'number')
    : DEFAULT_COMPRESSION_CONFIG.excludedTiers;
  return { enabled, maxCompressionRatio: maxRatio, minSummaryLength: minLen, excludedTiers };
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeRatios(globalMinRatio: number, projectMinRatio: number, flexibleRatio: number): {
  globalMinRatio: number;
  projectMinRatio: number;
  flexibleRatio: number;
} {
  const sum = globalMinRatio + projectMinRatio + flexibleRatio;
  if (sum <= 0) {
    return {
      globalMinRatio: DEFAULT_ADAPTIVE_QUOTA_CONFIG.globalMinRatio,
      projectMinRatio: DEFAULT_ADAPTIVE_QUOTA_CONFIG.projectMinRatio,
      flexibleRatio: DEFAULT_ADAPTIVE_QUOTA_CONFIG.flexibleRatio,
    };
  }
  return {
    globalMinRatio: globalMinRatio / sum,
    projectMinRatio: projectMinRatio / sum,
    flexibleRatio: flexibleRatio / sum,
  };
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const parsed = value.trim().toLowerCase();
  if (parsed === '1' || parsed === 'true') return true;
  if (parsed === '0' || parsed === 'false') return false;
  return fallback;
}

function parseNumberEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validateAdaptiveQuotaConfig(value: unknown): AdaptiveQuotaConfig {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_ADAPTIVE_QUOTA_CONFIG;
  }

  const cfg = value as Record<string, unknown>;
  const enabled = typeof cfg.enabled === 'boolean'
    ? cfg.enabled
    : DEFAULT_ADAPTIVE_QUOTA_CONFIG.enabled;

  const globalMinRatio = clampRatio(
    typeof cfg.globalMinRatio === 'number'
      ? cfg.globalMinRatio
      : DEFAULT_ADAPTIVE_QUOTA_CONFIG.globalMinRatio,
  );
  const projectMinRatio = clampRatio(
    typeof cfg.projectMinRatio === 'number'
      ? cfg.projectMinRatio
      : DEFAULT_ADAPTIVE_QUOTA_CONFIG.projectMinRatio,
  );
  const flexibleRatio = clampRatio(
    typeof cfg.flexibleRatio === 'number'
      ? cfg.flexibleRatio
      : DEFAULT_ADAPTIVE_QUOTA_CONFIG.flexibleRatio,
  );

  const normalized = normalizeRatios(globalMinRatio, projectMinRatio, flexibleRatio);

  const adjustmentStep = Math.max(
    0,
    Math.min(
      0.2,
      typeof cfg.adjustmentStep === 'number'
        ? cfg.adjustmentStep
        : DEFAULT_ADAPTIVE_QUOTA_CONFIG.adjustmentStep,
    ),
  );
  const minSamplesForAdjustment = Math.max(
    1,
    Math.floor(
      typeof cfg.minSamplesForAdjustment === 'number'
        ? cfg.minSamplesForAdjustment
        : DEFAULT_ADAPTIVE_QUOTA_CONFIG.minSamplesForAdjustment,
    ),
  );
  const targetProjectRatio = clampRatio(
    typeof cfg.targetProjectRatio === 'number'
      ? cfg.targetProjectRatio
      : DEFAULT_ADAPTIVE_QUOTA_CONFIG.targetProjectRatio,
  );
  const highTokenUsageThreshold = Math.max(
    0,
    Math.min(
      100,
      typeof cfg.highTokenUsageThreshold === 'number'
        ? cfg.highTokenUsageThreshold
        : DEFAULT_ADAPTIVE_QUOTA_CONFIG.highTokenUsageThreshold,
    ),
  );

  return {
    enabled,
    globalMinRatio: normalized.globalMinRatio,
    projectMinRatio: normalized.projectMinRatio,
    flexibleRatio: normalized.flexibleRatio,
    adjustmentStep,
    minSamplesForAdjustment,
    targetProjectRatio,
    highTokenUsageThreshold,
  };
}

function applyAdaptiveQuotaEnvOverrides(base: AdaptiveQuotaConfig): AdaptiveQuotaConfig {
  const envEnabled = parseBooleanEnv(process.env.TRUE_MEM_ADAPTIVE_QUOTA_ENABLED, base.enabled);

  const envGlobalMinRatio = clampRatio(
    parseNumberEnv(process.env.TRUE_MEM_QUOTA_GLOBAL_MIN_RATIO, base.globalMinRatio),
  );
  const envProjectMinRatio = clampRatio(
    parseNumberEnv(process.env.TRUE_MEM_QUOTA_PROJECT_MIN_RATIO, base.projectMinRatio),
  );
  const envFlexibleRatio = clampRatio(
    parseNumberEnv(process.env.TRUE_MEM_QUOTA_FLEXIBLE_RATIO, base.flexibleRatio),
  );
  const normalized = normalizeRatios(envGlobalMinRatio, envProjectMinRatio, envFlexibleRatio);

  return {
    enabled: envEnabled,
    globalMinRatio: normalized.globalMinRatio,
    projectMinRatio: normalized.projectMinRatio,
    flexibleRatio: normalized.flexibleRatio,
    adjustmentStep: Math.max(
      0,
      Math.min(0.2, parseNumberEnv(process.env.TRUE_MEM_QUOTA_ADJUSTMENT_STEP, base.adjustmentStep)),
    ),
    minSamplesForAdjustment: Math.max(
      1,
      Math.floor(parseNumberEnv(process.env.TRUE_MEM_QUOTA_MIN_SAMPLES, base.minSamplesForAdjustment)),
    ),
    targetProjectRatio: clampRatio(
      parseNumberEnv(process.env.TRUE_MEM_QUOTA_TARGET_PROJECT_RATIO, base.targetProjectRatio),
    ),
    highTokenUsageThreshold: Math.max(
      0,
      Math.min(100, parseNumberEnv(process.env.TRUE_MEM_QUOTA_HIGH_TOKEN_THRESHOLD, base.highTokenUsageThreshold)),
    ),
  };
}

/**
 * Parse embeddings enabled from env or return default
 * Returns 0 or 1 (number for JSONC config compatibility)
 */
function parseEmbeddingsEnabled(envValue: string | undefined): number {
  if (!envValue) return DEFAULT_USER_CONFIG.embeddingsEnabled;
  
  // Validate input is '0' or '1'
  if (envValue !== '0' && envValue !== '1') {
    log(`Config: Invalid TRUE_MEM_EMBEDDINGS: ${envValue}, using default (${DEFAULT_USER_CONFIG.embeddingsEnabled})`);
    return DEFAULT_USER_CONFIG.embeddingsEnabled;
  }
  
  return parseInt(envValue, 10);
}

/**
 * Load user configuration
 * 
 * Flow:
 * 1. Start with defaults
 * 2. Override with config.json if exists
 * 3. Override with environment variables (highest priority)
 * 
 * @returns User configuration object
 */
export function loadConfig(): TrueMemUserConfig {
  let fileConfig: Partial<TrueMemUserConfig> = {};
  
  // Step 2: Load from config.json if exists
  if (existsSync(CONFIG_FILE)) {
    try {
      const configJson = readFileSync(CONFIG_FILE, 'utf-8');
      fileConfig = parseJsonc<Partial<TrueMemUserConfig>>(configJson);
      log(`Config: Loaded from ${CONFIG_FILE}`);
    } catch (err) {
      log(`Config: Error reading config.jsonc, using defaults: ${err}`);
    }
  }
  
  // Step 3: Override with environment variables (highest priority)
  // Track if env var was explicitly set to apply correct priority: ENV > FILE > DEFAULTS
  const envInjectionMode = process.env.TRUE_MEM_INJECTION_MODE;
  const envSubagentMode = process.env.TRUE_MEM_SUBAGENT_MODE;
  const envMaxMemories = process.env.TRUE_MEM_MAX_MEMORIES;
  const envEmbeddingsEnabled = process.env.TRUE_MEM_EMBEDDINGS;
  const envCompressionEnabled = process.env.TRUE_MEM_COMPRESSION_ENABLED;

  const fileCompression = fileConfig.compression ? validateCompressionConfig(fileConfig.compression) : DEFAULT_COMPRESSION_CONFIG;
  const compressionEnabledFromEnv = parseCompressionEnabled(envCompressionEnabled);
  const compression: CompressionConfig = compressionEnabledFromEnv !== DEFAULT_COMPRESSION_CONFIG.enabled
    ? { ...fileCompression, enabled: compressionEnabledFromEnv }
    : fileCompression;
  const fileAdaptiveQuota = fileConfig.adaptiveQuota
    ? validateAdaptiveQuotaConfig(fileConfig.adaptiveQuota)
    : DEFAULT_ADAPTIVE_QUOTA_CONFIG;
  const adaptiveQuota = applyAdaptiveQuotaEnvOverrides(fileAdaptiveQuota);

  const config: TrueMemUserConfig = {
    injectionMode: envInjectionMode !== undefined
      ? parseInjectionMode(envInjectionMode)
      : (fileConfig.injectionMode ?? DEFAULT_USER_CONFIG.injectionMode),
    subagentMode: envSubagentMode !== undefined
      ? parseSubAgentMode(envSubagentMode)
      : (fileConfig.subagentMode ?? DEFAULT_USER_CONFIG.subagentMode),
    maxMemories: envMaxMemories !== undefined
      ? parseMaxMemories(envMaxMemories)
      : (fileConfig.maxMemories ?? DEFAULT_USER_CONFIG.maxMemories),
    embeddingsEnabled: envEmbeddingsEnabled !== undefined
      ? parseEmbeddingsEnabled(envEmbeddingsEnabled)
      : validateEmbeddingsEnabled(fileConfig.embeddingsEnabled),
    compression,
    adaptiveQuota,
  };
  
  // Log the final config
  log(`Config: injectionMode=${config.injectionMode}, subagentMode=${config.subagentMode}, maxMemories=${config.maxMemories}, embeddingsEnabled=${config.embeddingsEnabled}, compression.enabled=${config.compression.enabled}, adaptiveQuota.enabled=${config.adaptiveQuota.enabled}`);
  
  return config;
}

/**
 * Generate config JSON with comments preserved
 */
export function generateConfigWithComments(config: TrueMemUserConfig): string {
  return `{
  // Injection mode: 0 = session start only (recommended), 1 = every prompt
  "injectionMode": ${config.injectionMode},

  // Sub-agent mode: 0 = disabled, 1 = enabled (default)
  "subagentMode": ${config.subagentMode},

  // Embeddings: 0 = Jaccard similarity only, 1 = hybrid (Jaccard + embeddings)
  "embeddingsEnabled": ${config.embeddingsEnabled},

  // Maximum memories to inject per prompt (10-50 recommended)
  "maxMemories": ${config.maxMemories},

  // Compression settings for low-priority memory summaries
  "compression": {
    // Enable compression: true = enabled, false = disabled (default)
    "enabled": ${config.compression.enabled},

    // Max compression ratio: 0.0-1.0 (e.g. 0.5 = keep 50% of summary)
    "maxCompressionRatio": ${config.compression.maxCompressionRatio},

    // Minimum characters to preserve after compression
    "minSummaryLength": ${config.compression.minSummaryLength},

    // Tiers excluded from compression (Tier 0=constraint, Tier 1=preference/decision)
    "excludedTiers": [${config.compression.excludedTiers.join(', ')}]
  },

  // Adaptive quota settings for global/project/flexible scope allocation
  "adaptiveQuota": {
    // Enable adaptive quotas: true = enabled, false = disabled (default)
    "enabled": ${config.adaptiveQuota.enabled},

    // Base minimum share for global scope (0.0-1.0)
    "globalMinRatio": ${config.adaptiveQuota.globalMinRatio},

    // Base minimum share for project scope (0.0-1.0)
    "projectMinRatio": ${config.adaptiveQuota.projectMinRatio},

    // Flexible share assignable to either scope (0.0-1.0)
    "flexibleRatio": ${config.adaptiveQuota.flexibleRatio},

    // Maximum ratio delta applied by adaptive adjustments per window
    "adjustmentStep": ${config.adaptiveQuota.adjustmentStep},

    // Minimum metric samples required before applying adaptive adjustments
    "minSamplesForAdjustment": ${config.adaptiveQuota.minSamplesForAdjustment},

    // Desired fraction of selected memories from project scope (0.0-1.0)
    "targetProjectRatio": ${config.adaptiveQuota.targetProjectRatio},

    // High token pressure threshold in percent (0-100)
    "highTokenUsageThreshold": ${config.adaptiveQuota.highTokenUsageThreshold}
  }
}`;
}

/**
 * Save user configuration to disk
 */
export function saveConfig(config: Partial<TrueMemUserConfig>): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    const currentConfig = loadConfig();
    const newConfig: TrueMemUserConfig = { ...currentConfig, ...config };
    writeFileSync(CONFIG_FILE, generateConfigWithComments(newConfig));
    log(`Config: Saved to ${CONFIG_FILE}`);
  } catch (err) {
    log(`Config: Error saving: ${err}`);
  }
}

/**
 * Get injection mode (convenience function)
 */
export function getInjectionMode(): InjectionMode {
  return loadConfig().injectionMode;
}

/**
 * Get sub-agent mode (convenience function)
 */
export function getSubAgentMode(): SubAgentMode {
  return loadConfig().subagentMode;
}

/**
 * Get max memories (convenience function)
 */
export function getMaxMemories(): number {
  return loadConfig().maxMemories;
}

/**
 * Get embeddings enabled from config (convenience function)
 * Returns 0 or 1 (number for JSONC config compatibility)
 */
export function getEmbeddingsEnabledFromConfig(): number {
  return loadConfig().embeddingsEnabled;
}

/**
 * Get compression config (convenience function)
 */
export function getCompressionConfig(): CompressionConfig {
  return loadConfig().compression;
}

/**
 * Get adaptive quota config (convenience function)
 */
export function getAdaptiveQuotaConfig(): AdaptiveQuotaConfig {
  return loadConfig().adaptiveQuota;
}
