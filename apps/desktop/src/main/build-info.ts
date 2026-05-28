/**
 * PR-BUILD-HYGIENE-0: surface a build-info stamp (mode + short commit
 * sha) so dev builds can clearly distinguish themselves from a
 * packaged release in the About page and in bug reports.
 *
 * Detection rules:
 *   - `mode`:
 *       'packaged' if Electron reports `app.isPackaged`,
 *       otherwise 'dev'.
 *   - `commit`: resolve `.git/HEAD` synchronously at startup. If HEAD
 *     points to a ref, dereference once. Returns null on any failure
 *     (no `.git`, detached state in a packaged tarball, permission
 *     error). We never spawn `git` to avoid coupling the desktop main
 *     process to a shell tool.
 *
 * One-shot — captured at module load and cached.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

export interface BuildInfo {
  readonly mode: 'dev' | 'packaged';
  /** Short commit sha (7 hex chars) or `null` if unresolvable. */
  readonly commit: string | null;
}

function findRepoRoot(start: string): string | null {
  let cur = start;
  // Walk up at most 10 levels — repo is at the workspace root, not
  // deeper than that. Bound the loop so we don't traverse to '/'.
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(cur, '.git'))) return cur;
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
  return null;
}

function resolveCommit(repoRoot: string): string | null {
  try {
    const headPath = join(repoRoot, '.git', 'HEAD');
    if (!existsSync(headPath)) return null;
    const head = readFileSync(headPath, 'utf8').trim();
    if (head.startsWith('ref: ')) {
      const refPath = join(repoRoot, '.git', head.slice(5).trim());
      if (!existsSync(refPath)) {
        // Packed refs path — read packed-refs and match the ref name.
        const packed = join(repoRoot, '.git', 'packed-refs');
        if (!existsSync(packed)) return null;
        const target = head.slice(5).trim();
        const lines = readFileSync(packed, 'utf8').split('\n');
        for (const line of lines) {
          if (line.startsWith('#') || line.startsWith('^')) continue;
          const [sha, ref] = line.split(' ');
          if (ref?.trim() === target && sha) return sha.slice(0, 7);
        }
        return null;
      }
      const sha = readFileSync(refPath, 'utf8').trim();
      return sha.length >= 7 ? sha.slice(0, 7) : null;
    }
    // Detached HEAD — already a sha.
    return head.length >= 7 ? head.slice(0, 7) : null;
  } catch {
    return null;
  }
}

export function resolveBuildInfo(isPackaged: boolean, startDir: string): BuildInfo {
  if (isPackaged) {
    return { mode: 'packaged', commit: null };
  }
  const repoRoot = findRepoRoot(resolve(startDir));
  const commit = repoRoot ? resolveCommit(repoRoot) : null;
  return { mode: 'dev', commit };
}
