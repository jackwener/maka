/**
 * PR-RADIUS-CONTRACT-CONVERGE-0 (kenji's category 3, 2026-06-24):
 * lock the Maka radius vocabulary so a single PR can't softly inflate
 * the chrome into "more rounded" territory and break sharp identity.
 *
 * Per docs/design-system.md §1.4 (post-PR):
 *   - chrome: 0 (page/layout) + 6 (button) + 8 (modal) + 10 (code block)
 *   - 大面板 (workspace plate, floating card): 12px ceiling — matches
 *     macOS window outer chrome so cards read as "inside the chrome"
 *   - pill/chip/round dot: 999px exception
 *
 * Anything `border-radius: > 12px` in renderer CSS is banned (except
 * the 999px pill). When a future surface NEEDS a bigger radius, the
 * design owner can update this contract AND the doc together — that
 * keeps the doc + code in sync instead of drifting.
 *
 * Tailwind utility classes (`rounded-xl` = 12px is fine; `rounded-2xl`
 * = 16px / `rounded-3xl` = 24px violate) are checked in renderer code
 * too, but UI primitives are NOT covered here — kenji's z-index lane
 * already touches Dialog/Sheet/Drawer/Command, and bumping those needs
 * a separate visual review on every modal surface.
 */

import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { REPO_ROOT, TOKENS_FILE, readAllRendererCss, readCssTree, stripCssComments } from './css-test-helpers.js';

const DOC_FILE = `${REPO_ROOT}/docs/design-system.md`;
const RENDERER_STYLES_DIR = resolve(REPO_ROOT, 'apps', 'desktop', 'src', 'renderer', 'styles');

/** Returns every `border-radius: <N>px` site whose N > 12 and N !== 999. */
function findOversizedRadii(css: string): string[] {
  const stripped = stripCssComments(css);
  const matches = [...stripped.matchAll(/border-radius:\s*([0-9]+)px/g)];
  return matches
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n > 12 && n !== 999)
    .map(String);
}

/**
 * #406 gap 4: every `border-radius:` value must be a token reference
 * (`var(--radius-*)`) or one of the non-sized literal values (0, 50%,
 * inherit, initial). Bare `Npx` literals are the governance target.
 * Multi-value shorthand (e.g. `0 var(--radius-surface) var(--radius-surface) 0`)
 * is allowed when every corner is a token or 0. `!important` suffix is allowed.
 */
const ALLOWED_RADIUS_TOKEN = /^(?:var\(--radius-[\w-]+\)|0+(?:px|%)?|50%|inherit|initial|calc\([^)]*var\(--radius-[\w-]+\)[^)]*\))$/;
const RADIUS_DECL_RE = /border-radius:\s*([^;}\n]+)\s*[;}]/g;

function isAllowedRadiusValue(raw: string): boolean {
  const cleaned = raw.replace(/!\s*important$/, '').trim();
  return cleaned.split(/\s+/).every((corner) => ALLOWED_RADIUS_TOKEN.test(corner));
}

function findHardcodedRadii(css: string, fileLabel: string): string[] {
  const stripped = stripCssComments(css);
  const offenders: string[] = [];
  for (const match of stripped.matchAll(RADIUS_DECL_RE)) {
    const raw = match[1].trim();
    if (isAllowedRadiusValue(raw)) continue;
    offenders.push(`${fileLabel}: border-radius: ${raw}`);
  }
  return offenders;
}

async function collectCssHardcodedRadii(): Promise<string[]> {
  const offenders: string[] = [];
  const rendererCss = await readAllRendererCss();
  offenders.push(...findHardcodedRadii(rendererCss, 'renderer CSS'));

  const tokens = await readFile(TOKENS_FILE, 'utf8');
  offenders.push(...findHardcodedRadii(tokens, 'maka-tokens.css'));

  const cssFiles = await readCssTree(RENDERER_STYLES_DIR);
  for (const file of cssFiles) {
    const src = await readFile(file, 'utf8');
    const label = file.replace(REPO_ROOT + '/', '');
    offenders.push(...findHardcodedRadii(src, label));
  }
  return offenders;
}

/**
 * Scans TSX/TS source for `rounded-[...]` arbitrary values that are not
 * token references. Allowed: `rounded-[var(--radius-*)]`, `rounded-[50%]`,
 * `rounded-[0]`. Bare `rounded-[Npx]` is the governance target.
 */
const ROUNDED_ARBITRARY_RE = /rounded-\[([^\]]+)\]/g;
const ALLOWED_ROUNDED_ARBITRARY = /^(?:var\(--radius-[\w-]+\)|calc\([^)]*var\(--radius-[\w-]+\)[^)]*\)|inherit|50%|0)$/;
// menu.tsx checkbox-thumb uses a dynamic thumb-size/ratio for its active-state
// morph animation — not a static radius tier, so it's exempt from token governance.
const ROUNDED_ARBITRARY_EXEMPT = /^(?:var\(--thumb-size\)\/calc\(var\(--thumb-size\)\*1\.10\))$/;

async function collectTsxHardcodedRadii(): Promise<string[]> {
  const offenders: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') continue;
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!/\.(tsx|ts)$/.test(entry.name)) continue;
      const src = await readFile(full, 'utf8');
      for (const match of src.matchAll(ROUNDED_ARBITRARY_RE)) {
        const val = match[1].trim();
        if (ALLOWED_ROUNDED_ARBITRARY.test(val)) continue;
        if (ROUNDED_ARBITRARY_EXEMPT.test(val)) continue;
        offenders.push(`${full.replace(REPO_ROOT + '/', '')}: rounded-[${val}]`);
      }
    }
  }
  await walk(resolve(REPO_ROOT, 'packages/ui/src'));
  await walk(resolve(REPO_ROOT, 'apps/desktop/src/renderer'));
  return offenders;
}

describe('PR-RADIUS-CONTRACT-CONVERGE-0 contract', () => {
  it('renderer CSS has no border-radius > 12px (except 999px pill)', async () => {
    const styles = await readAllRendererCss();
    const offenders = findOversizedRadii(styles);
    assert.deepEqual(
      offenders,
      [],
      `renderer CSS must keep radius ≤ 12px per docs/design-system.md §1.4. Found offending values: ${offenders.join(', ')}.`,
    );
  });

  it('maka-tokens.css has no border-radius > 12px (except 999px pill)', async () => {
    const tokens = await readFile(TOKENS_FILE, 'utf8');
    const offenders = findOversizedRadii(tokens);
    assert.deepEqual(
      offenders,
      [],
      `maka-tokens.css must keep radius ≤ 12px. Found offending values: ${offenders.join(', ')}.`,
    );
  });

  it('Tailwind `rounded-2xl` / `rounded-3xl` (≥16px) is banned in renderer + UI source', async () => {
    // Self-review: original test claimed Tailwind classes are checked
    // but no assertion enforced it. `rounded-xl` (12px) is allowed —
    // it's the documented ceiling. `rounded-2xl` (16px Tailwind) and
    // `rounded-3xl` (24px) break the cap.
    const { readdir } = await import('node:fs/promises');
    const offenders: string[] = [];
    async function walk(dir: string): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile() && /\.(tsx|ts)$/.test(entry.name)) {
          const src = await readFile(full, 'utf8');
          if (/\brounded-(2xl|3xl)\b/.test(src)) {
            offenders.push(full.replace(REPO_ROOT + '/', ''));
          }
        }
      }
    }
    await walk(resolve(REPO_ROOT, 'packages/ui/src'));
    await walk(resolve(REPO_ROOT, 'apps/desktop/src/renderer'));
    assert.deepEqual(
      offenders,
      [],
      `Tailwind \`rounded-2xl\` / \`rounded-3xl\` exceed the 12px cap. Use \`rounded-xl\` instead:\n  ${offenders.join('\n  ')}`,
    );
  });

  it('docs/design-system.md spells out the 12px ceiling', async () => {
    const doc = await readFile(DOC_FILE, 'utf8');
    assert.match(
      doc,
      /大面板上限 12px/,
      'docs/design-system.md §1.4 must explicitly state the 12px workspace-plate ceiling so future PRs see the rule.',
    );
    assert.match(
      doc,
      /14\/16\/18\/20px/,
      'docs/design-system.md §1.4 must explicitly list the banned values (14/16/18/20px) — otherwise it just says "no big radius" without telling reviewers what to flag.',
    );
  });
});

/**
 * #406 gap 4 — radius governance: migrate every hardcoded `border-radius`
 * literal (`Npx`, including non-asymmetric multi-value shorthand) to the
 * token system (`--radius-control` / `--radius-surface` / `--radius-modal`
 * / `--radius-pill`). TSX `rounded-[Npx]` arbitrary values must likewise
 * become `rounded-[var(--radius-*)]`. Allowed non-token values: 0, 50%,
 * inherit, initial.
 */
describe('#406 gap 4 — radius token governance', () => {
  it('renderer CSS + maka-tokens.css use no hardcoded border-radius literals', async () => {
    const offenders = await collectCssHardcodedRadii();
    assert.deepEqual(
      offenders,
      [],
      `border-radius must reference --radius-* tokens (or 0/50%/inherit/initial). Hardcoded literals found:\n  ${offenders.join('\n  ')}`,
    );
  });

  it('TSX/TS source uses no hardcoded rounded-[Npx] arbitrary values', async () => {
    const offenders = await collectTsxHardcodedRadii();
    assert.deepEqual(
      offenders,
      [],
      `Tailwind arbitrary radius must reference --radius-* tokens (or 0/50%). Hardcoded values found:\n  ${offenders.join('\n  ')}`,
    );
  });
});
