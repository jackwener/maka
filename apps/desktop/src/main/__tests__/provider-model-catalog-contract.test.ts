import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { join } from 'node:path';

const repoRoot = process.cwd().endsWith('apps/desktop')
  ? join(process.cwd(), '..', '..')
  : process.cwd();

async function readRepo(path: string): Promise<string> {
  return readFile(join(repoRoot, path), 'utf8');
}

describe('provider settings model catalog contract', () => {
  it('seeds new provider defaults from the catalog recommendation helper', async () => {
    const source = await readRepo('apps/desktop/src/renderer/settings/ProvidersPanel.tsx');

    assert.match(
      source,
      /import \{[\s\S]*buildCatalogModelChoices[\s\S]*buildCatalogRecommendedDefaultModel[\s\S]*\} from '..\/model-catalog-choices';/,
      'ProvidersPanel must import the catalog recommendation helper with the catalog choices helper',
    );
    assert.match(
      source,
      /const recommendedDefaultModel = buildCatalogRecommendedDefaultModel\(props\.providerType\);/,
      'new provider form must derive the suggested default from the catalog selector layer',
    );
    assert.match(
      source,
      /useState\(recommendedDefaultModel\)/,
      'new provider form must seed defaultModel from the catalog recommendation',
    );
    assert.doesNotMatch(
      source,
      /fallbackModels\[0\]/,
      'ProvidersPanel must not seed or describe model choices from raw provider fallbackModels[0]',
    );
  });

  it('describes static model table counts from catalog choices', async () => {
    const source = await readRepo('apps/desktop/src/renderer/settings/ProvidersPanel.tsx');

    assert.match(
      source,
      /const catalogFallbackCount = modelChoices\.filter\(\(choice\) => choice\.source === 'static_catalog'\)\.length;/,
      'fallback count must be derived from catalog entries, including catalog-added providers',
    );
    assert.match(
      source,
      /fallbackCount=\{catalogFallbackCount\}/,
      'ModelTable must receive the catalog-derived fallback count',
    );
  });
});
