import type { ProviderType } from './llm-connections.js';

export interface ModelMetadata {
  displayName?: string;
}

export function lookupModelMetadata(providerType: ProviderType, modelId: string): ModelMetadata {
  return MODELS_DEV_METADATA[providerType]?.[modelId.trim()] ?? {};
}

const ANTHROPIC_MODELS_DEV_METADATA: Record<string, ModelMetadata> = {
  'claude-sonnet-4-5-20250929': { displayName: 'Claude Sonnet 4.5' },
  'claude-opus-4-1-20250805': { displayName: 'Claude Opus 4.1' },
  'claude-haiku-4-5-20251001': { displayName: 'Claude Haiku 4.5' },
  'claude-3-5-sonnet-20241022': { displayName: 'Claude Sonnet 3.5 v2' },
};

const GOOGLE_MODELS_DEV_METADATA: Record<string, ModelMetadata> = {
  'gemini-2.5-pro': { displayName: 'Gemini 2.5 Pro' },
  'gemini-2.5-flash': { displayName: 'Gemini 2.5 Flash' },
  'gemini-2.0-flash': { displayName: 'Gemini 2.0 Flash' },
};

// Curated from https://models.dev/api.json. Keep this small: the model catalog
// consumes only stable display names here, while request routing keeps raw ids.
const MODELS_DEV_METADATA: Partial<Record<ProviderType, Record<string, ModelMetadata>>> = {
  anthropic: ANTHROPIC_MODELS_DEV_METADATA,
  'claude-subscription': ANTHROPIC_MODELS_DEV_METADATA,
  openai: {
    'gpt-4o-mini': { displayName: 'GPT-4o mini' },
    'gpt-4o': { displayName: 'GPT-4o' },
    'gpt-4-turbo': { displayName: 'GPT-4 Turbo' },
    'gpt-5': { displayName: 'GPT-5' },
  },
  google: GOOGLE_MODELS_DEV_METADATA,
  'gemini-cli': GOOGLE_MODELS_DEV_METADATA,
  'codex-subscription': {
    'gpt-5.5': { displayName: 'GPT 5.5' },
    'gpt-5.4': { displayName: 'GPT 5.4' },
    'gpt-5.4-mini': { displayName: 'GPT 5.4 mini' },
    'gpt-5.3-codex-spark': { displayName: 'GPT 5.3 Codex Spark' },
  },
  deepseek: {
    'deepseek-v4-flash': { displayName: 'DeepSeek V4 Flash' },
    'deepseek-v4-pro': { displayName: 'DeepSeek V4 Pro' },
    'deepseek-reasoner': { displayName: 'DeepSeek Reasoner' },
    'deepseek-chat': { displayName: 'DeepSeek Chat' },
  },
  'zai-coding-plan': {
    'glm-4.7': { displayName: 'GLM-4.7' },
    'glm-4.5-air': { displayName: 'GLM-4.5-Air' },
  },
};
