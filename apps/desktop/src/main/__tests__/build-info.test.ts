/**
 * PR-BUILD-HYGIENE-0: cover the dev/packaged + commit-resolution
 * branches of `resolveBuildInfo()` so the About-page badge cannot
 * silently regress.
 */

import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { resolveBuildInfo } from '../build-info.js';

function makeTempRepo(setup: (gitDir: string) => void): string {
  const root = mkdtempSync(join(tmpdir(), 'maka-build-info-'));
  const gitDir = join(root, '.git');
  mkdirSync(gitDir, { recursive: true });
  setup(gitDir);
  return root;
}

describe('resolveBuildInfo', () => {
  it('returns mode=packaged with no commit when app is packaged', () => {
    const info = resolveBuildInfo(true, '/anywhere');
    assert.equal(info.mode, 'packaged');
    assert.equal(info.commit, null);
  });

  it('returns mode=dev with null commit when no .git is found', () => {
    const root = mkdtempSync(join(tmpdir(), 'maka-build-info-nogit-'));
    try {
      const info = resolveBuildInfo(false, root);
      assert.equal(info.mode, 'dev');
      assert.equal(info.commit, null);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads loose ref when HEAD points to a branch with a loose ref file', () => {
    const fullSha = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';
    const root = makeTempRepo((gitDir) => {
      writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
      mkdirSync(join(gitDir, 'refs', 'heads'), { recursive: true });
      writeFileSync(join(gitDir, 'refs', 'heads', 'main'), `${fullSha}\n`);
    });
    try {
      const info = resolveBuildInfo(false, root);
      assert.equal(info.mode, 'dev');
      assert.equal(info.commit, fullSha.slice(0, 7));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('falls back to packed-refs when the loose ref file is missing', () => {
    const fullSha = 'feedfacedeadbeef0011223344556677889900aa';
    const root = makeTempRepo((gitDir) => {
      writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
      writeFileSync(
        join(gitDir, 'packed-refs'),
        `# pack-refs with: peeled fully-peeled sorted\n${fullSha} refs/heads/main\n`,
      );
    });
    try {
      const info = resolveBuildInfo(false, root);
      assert.equal(info.commit, fullSha.slice(0, 7));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('handles detached HEAD (HEAD contains a sha directly)', () => {
    const fullSha = '0123456789abcdef0123456789abcdef01234567';
    const root = makeTempRepo((gitDir) => {
      writeFileSync(join(gitDir, 'HEAD'), `${fullSha}\n`);
    });
    try {
      const info = resolveBuildInfo(false, root);
      assert.equal(info.commit, fullSha.slice(0, 7));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
