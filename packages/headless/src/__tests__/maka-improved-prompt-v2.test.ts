import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';

describe('maka improved prompt v2', () => {
  test('treats prior validation as enough to stop when final checks fail', async () => {
    const prompt = await readFile(new URL('../../harbor/maka-improved-prompt-v2.txt', import.meta.url), 'utf8');

    assert.match(prompt, /existing successful validation signal/i);
    assert.match(prompt, /do not run extra checks/i);
    assert.match(prompt, /final read or check fails/i);
    assert.match(prompt, /stop/i);
    assert.match(prompt, /relative paths only/i);
    assert.match(prompt, /out\.html/);
  });
});
