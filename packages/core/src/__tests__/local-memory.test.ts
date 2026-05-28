import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  LOCAL_MEMORY_MAX_BYTES,
  defaultLocalMemoryMarkdown,
  defaultLocalMemorySettings,
  normalizeLocalMemorySettings,
  parseLocalMemoryMarkdown,
} from '../local-memory.js';

describe('local MEMORY.md contract', () => {
  it('defaults file enabled but agent read disabled', () => {
    const settings = defaultLocalMemorySettings();
    assert.equal(settings.enabled, true);
    assert.equal(settings.agentReadEnabled, false);
  });

  it('normalizes malformed settings fail-closed for agent reads', () => {
    assert.deepEqual(normalizeLocalMemorySettings(null), {
      enabled: true,
      agentReadEnabled: false,
    });
    assert.deepEqual(normalizeLocalMemorySettings({ enabled: false, agentReadEnabled: 'yes' }), {
      enabled: false,
      agentReadEnabled: false,
    });
  });

  it('parses heading entries and best-effort metadata comments', () => {
    const parsed = parseLocalMemoryMarkdown([
      '# Maka Memory',
      '',
      '## 偏好',
      '<!-- maka-memory: id=pref-1 origin=manual createdAt=1700000000000 -->',
      '喜欢简洁回答。',
      '',
      '## 手写条目',
      '没有 metadata 也要显示。',
    ].join('\n'));
    assert.equal(parsed.safeMode, false);
    assert.equal(parsed.entries.length, 2);
    assert.equal(parsed.entries[0]?.id, 'pref-1');
    assert.equal(parsed.entries[0]?.origin, 'manual');
    assert.equal(parsed.entries[0]?.createdAt, 1700000000000);
    assert.equal(parsed.entries[1]?.origin, 'unknown');
    assert.match(parsed.entries[1]?.content ?? '', /metadata/);
  });

  it('returns safe mode instead of parsing oversized content', () => {
    const parsed = parseLocalMemoryMarkdown('x'.repeat(LOCAL_MEMORY_MAX_BYTES + 1));
    assert.equal(parsed.safeMode, true);
    assert.equal(parsed.reason, 'oversize');
    assert.equal(parsed.entries.length, 0);
  });

  it('default template is parseable and manual', () => {
    const parsed = parseLocalMemoryMarkdown(defaultLocalMemoryMarkdown(1700000000000));
    assert.equal(parsed.safeMode, false);
    assert.equal(parsed.entries.length, 1);
    assert.equal(parsed.entries[0]?.origin, 'manual');
  });
});
