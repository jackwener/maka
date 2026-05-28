import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';
import { createDefaultSettings, type AppSettings } from '@maka/core';
import { LocalMemoryService } from '../local-memory-service.js';

function makeService(now = 1_700_000_000_000) {
  return async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'maka-memory-'));
    let settings = createDefaultSettings();
    const service = new LocalMemoryService({
      workspaceRoot,
      now: () => now,
      getSettings: async () => settings,
      updateSettings: async (patch: { localMemory: Partial<AppSettings['localMemory']> }) => {
        settings = {
          ...settings,
          localMemory: { ...settings.localMemory, ...patch.localMemory },
        };
        return settings;
      },
      getPrivacyContext: async () => ({ incognitoActive: false }),
    });
    return { service, workspaceRoot };
  };
}

describe('LocalMemoryService', () => {
  it('creates MEMORY.md with 0700 directory and 0600 file', async () => {
    const { service } = await makeService()();
    const state = await service.getState();
    assert.equal(state.status, 'ok');
    const dirStat = await stat(service.dir);
    const fileStat = await stat(service.file);
    assert.equal(dirStat.mode & 0o777, 0o700);
    assert.equal(fileStat.mode & 0o777, 0o600);
  });

  it('saves content and keeps a backup', async () => {
    const { service } = await makeService()();
    await service.getState();
    const next = [
      '# Maka Memory',
      '',
      '## 偏好',
      '<!-- maka-memory: id=pref-1 origin=manual createdAt=1700000000000 -->',
      '喜欢短回答。',
      '',
    ].join('\n');
    const state = await service.save(next);
    assert.equal(state.entryCount, 1);
    assert.match(await readFile(service.file, 'utf8'), /喜欢短回答/);
    assert.match(await readFile(`${service.file}.bak`, 'utf8'), /示例/);
  });

  it('does not write oversized content', async () => {
    const { service } = await makeService()();
    await service.getState();
    const state = await service.save('x'.repeat(200_000));
    assert.equal(state.status, 'safe_mode');
    assert.doesNotMatch(await readFile(service.file, 'utf8'), /^x+$/);
  });

  it('returns incognito_blocked without creating the file', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'maka-memory-incognito-'));
    const service = new LocalMemoryService({
      workspaceRoot,
      getSettings: async () => createDefaultSettings(),
      updateSettings: async () => createDefaultSettings(),
      getPrivacyContext: async () => ({ incognitoActive: true }),
    });
    const state = await service.getState();
    assert.equal(state.status, 'incognito_blocked');
  });
});
