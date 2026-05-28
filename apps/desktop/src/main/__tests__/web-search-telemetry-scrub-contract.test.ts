/**
 * PR-AGENT-WEB-SEARCH-TOOL-0 — static-analysis gate that the
 * recordToolInvocation wrapper in main.ts scrubs `argsSummary` for
 * the `WebSearch` tool. The query string is user-derived; persisting
 * it to telemetry would leak the user's search content into the
 * usage log.
 */

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd(), '..', '..');

describe('WebSearch telemetry scrub contract', () => {
  it('main.ts recordToolInvocation drops argsSummary for WebSearch', async () => {
    const src = await readFile(
      join(REPO_ROOT, 'apps', 'desktop', 'src', 'main', 'main.ts'),
      'utf8',
    );
    // Cheap grep: the wrapper that branches on toolName === WEB_SEARCH_TOOL_NAME
    // must spread the event and explicitly drop argsSummary.
    assert.match(
      src,
      /toolName\s*===\s*WEB_SEARCH_TOOL_NAME[\s\S]*argsSummary:\s*undefined/,
      'main.ts recordToolInvocation must scrub argsSummary for WebSearch',
    );
  });
});
