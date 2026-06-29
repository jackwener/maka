import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { promisify } from 'node:util';
import { ensurePromptOptimizationPromptRepo } from '../prompt-optimization-bootstrap.js';

const execFileAsync = promisify(execFile);

describe('ensurePromptOptimizationPromptRepo', () => {
  test('initializes the seed prompt repo once and reuses it on resume', async () => {
    await withDir(async (dir) => {
      const promptRepoDir = join(dir, 'prompt-repo');
      const input = {
        promptRepoDir,
        program: 'program v1\n',
        systemPrompt: 'prompt v1\n',
      };

      const first = await ensurePromptOptimizationPromptRepo(input);
      const firstHead = await gitOutput(promptRepoDir, 'rev-parse', 'HEAD');
      const firstCommitCount = await gitOutput(promptRepoDir, 'rev-list', '--count', 'HEAD');

      const second = await ensurePromptOptimizationPromptRepo(input);
      const secondHead = await gitOutput(promptRepoDir, 'rev-parse', 'HEAD');
      const secondCommitCount = await gitOutput(promptRepoDir, 'rev-list', '--count', 'HEAD');

      assert.deepEqual(second, first);
      assert.equal(secondHead, firstHead);
      assert.equal(secondCommitCount, firstCommitCount);
      assert.equal(secondCommitCount, '1');
      assert.equal(await readFile(join(promptRepoDir, 'program.md'), 'utf8'), 'program v1\n');
      assert.equal(await readFile(join(promptRepoDir, 'system_prompt.md'), 'utf8'), 'prompt v1\n');
    });
  });

  test('rejects an existing seed repo with different seed files instead of rewriting it', async () => {
    await withDir(async (dir) => {
      const promptRepoDir = join(dir, 'prompt-repo');
      await ensurePromptOptimizationPromptRepo({
        promptRepoDir,
        program: 'program v1\n',
        systemPrompt: 'prompt v1\n',
      });

      await assert.rejects(
        ensurePromptOptimizationPromptRepo({
          promptRepoDir,
          program: 'program v2\n',
          systemPrompt: 'prompt v1\n',
        }),
        /existing prompt repo seed files do not match this run/,
      );

      assert.equal(await readFile(join(promptRepoDir, 'program.md'), 'utf8'), 'program v1\n');
    });
  });
});

async function gitOutput(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return stdout.trim();
}

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'maka-prompt-opt-bootstrap-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
