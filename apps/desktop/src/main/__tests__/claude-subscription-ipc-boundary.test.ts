/**
 * Static-analysis gate: token boundary (xuan `2c5aa125` G-X3 + kenji
 * `cf41871b` hard gate).
 *
 * Renderer-visible code MUST NOT declare any token-shaped field.
 * We scan preload.ts, the renderer tree, and the @maka/ui package
 * for the forbidden identifiers used as object-literal keys.
 *
 * Comments and prose mentions are allowed (this test scans for
 * `<needle>:` patterns to match field declarations specifically).
 */

import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd(), '..', '..');

const SCAN_ROOTS = [
  join(REPO_ROOT, 'apps', 'desktop', 'src', 'preload'),
  join(REPO_ROOT, 'apps', 'desktop', 'src', 'renderer'),
  join(REPO_ROOT, 'packages', 'ui', 'src'),
];

const FORBIDDEN_TOKEN_KEYS = [
  'access_token',
  'refresh_token',
  'id_token',
  'accessToken',
  'refreshToken',
  'idToken',
];

async function collectSourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'dist') continue;
      out.push(...(await collectSourceFiles(full)));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('renderer-visible code has NO token-shaped field declarations (xuan G-X3)', () => {
  for (const needle of FORBIDDEN_TOKEN_KEYS) {
    it(`forbids "${needle}:" as a field in preload / renderer / @maka/ui`, async () => {
      const fieldPattern = new RegExp(`\\b${needle}\\s*:`);
      const offenders: Array<{ file: string; line: number; text: string }> = [];
      for (const root of SCAN_ROOTS) {
        const files = await collectSourceFiles(root);
        for (const file of files) {
          const src = await readFile(file, 'utf8');
          const lines = src.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]!;
            // Skip pure-comment lines.
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
            if (fieldPattern.test(line)) {
              offenders.push({ file, line: i + 1, text: line.trim() });
            }
          }
        }
      }
      assert.equal(
        offenders.length,
        0,
        `Forbidden token field "${needle}:" found in renderer-visible code:\n${offenders
          .map((o) => `  ${o.file}:${o.line}\n    ${o.text}`)
          .join('\n')}\n\nReason: tokens MUST stay in the main process. Renderer consumes SubscriptionAccountState / QuotaSnapshot only.`,
      );
    });
  }
});
