import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDER_TYPE_LABEL,
  providerTypeLabel,
  type ProviderType,
} from '../index.js';

const ALL_PROVIDER_TYPES: ProviderType[] = [
  'anthropic',
  'kimi-coding-plan',
  'openai',
  'google',
  'deepseek',
  'moonshot',
  'zai-coding-plan',
  'ollama',
  'openai-compatible',
  'claude-subscription',
  'codex-subscription',
  'gemini-cli',
];

test('every provider type has a non-empty label', () => {
  for (const type of ALL_PROVIDER_TYPES) {
    const label = providerTypeLabel(type);
    assert.equal(label, PROVIDER_TYPE_LABEL[type]);
    assert.ok(label.length > 0, `missing label for ${type}`);
  }
});

test('labels never contain an account email separator', () => {
  // The whole point of keying by ProviderType is to avoid leaking the
  // per-connection name, which for OAuth connections embeds the account
  // email (e.g. "Codex OAuth · user@example.com").
  for (const label of Object.values(PROVIDER_TYPE_LABEL)) {
    assert.ok(!label.includes('@'), `label "${label}" looks like it leaks an email`);
  }
});

test('subscription/CLI providers read as their brand, not the raw slug', () => {
  assert.equal(providerTypeLabel('codex-subscription'), 'Codex 订阅');
  assert.equal(providerTypeLabel('claude-subscription'), 'Claude 订阅');
  assert.equal(providerTypeLabel('openai'), 'OpenAI');
});
