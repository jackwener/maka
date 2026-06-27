import type { ProviderType } from './llm-connections.js';

export interface ModelMetadata {
  displayName?: string;
}

export function lookupModelMetadata(providerType: ProviderType, modelId: string): ModelMetadata {
  return MODELS_DEV_METADATA[providerType]?.[modelId.trim()] ?? {};
}

// Curated from https://models.dev/api.json. Keep this small: the model catalog
// consumes only stable display names here, while request routing keeps raw ids.
const MODELS_DEV_METADATA: Partial<Record<ProviderType, Record<string, ModelMetadata>>> = {
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
};
