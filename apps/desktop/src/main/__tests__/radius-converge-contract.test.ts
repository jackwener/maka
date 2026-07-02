/**
 * PR-RADIUS-CONTRACT-CONVERGE-0 (kenji's category 3, 2026-06-24):
 * lock the Maka radius vocabulary so a single PR can't softly inflate
 * the chrome into "more rounded" territory and break sharp identity.
 *
 * Per docs/design-system.md §1.4 (post-#406-gap-4):
 *   - control  6px  — button / input / chip / kbd / inline code
 *   - surface  8px  — card / popover / code block / toast / notice / table
 *   - modal   12px  — Settings / Confirm / Permission modal / floating card
 *   - pill    999px — pill / badge / round dot
 *
 * Contract rules:
 *   1. `border-radius` (shorthand + longhand `border-{top,bottom}-{left,right}-radius`)
 *      must reference a whitelisted `--radius-*` token, or be 0 / 50% / inherit / initial.
 *   2. `rounded-[...]` and directional `rounded-{t|tr|tl|b|br|bl|l|r}-[...]` arbitrary
 *      values must likewise reference a whitelisted token.
 *   3. No radius value may exceed 12px (except the 999px pill).
 *   4. Tailwind `rounded-2xl` (16px) / `rounded-3xl` (24px) are banned.
 *
 * The whitelist prevents typos, private tokens, and value drift — only the
 * canonical tokens and their declared aliases pass. A separate assertion pins
 * each token's resolved pixel value so a silent edit of `--radius-modal` is
 * caught.
 */

import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { REPO_ROOT, TOKENS_FILE, STYLES_FILE, readAllRendererCss, stripCssComments } from './css-test-helpers.js';

const DOC_FILE = `${REPO_ROOT}/docs/design-system.md`;

// --- token whitelist --------------------------------------------------------

/** Canonical tokens + declared aliases. Anything else is a governance failure. */
const RADIUS_TOKEN_WHITELIST = new Set([
  '--radius-control',
  '--radius-surface',
  '--radius-modal',
  '--radius-pill',
  '--radius-button', // alias → control
  '--radius-sm', // tailwind alias → control
  '--radius-md', // tailwind alias → surface
  '--radius-lg', // tailwind alias → surface
  '--radius-xl', // tailwind alias → modal
]);

/** One corner of a border-radius shorthand value, after stripping !important. */
const TOKEN_REF_RE = /^var\((--radius-[\w-]+)\)$/;
const LITERAL_OK_RE = /^(?:0+(?:px|%)?|50%|inherit|initial)$/;
const CALC_TOKEN_RE = /^calc\([^)]*var\(--radius-[\w-]+\)[^)]*\)$/;

function isAllowedCorner(corner: string): boolean {
  if (LITERAL_OK_RE.test(corner)) return true;
  const tok = corner.match(TOKEN_REF_RE);
  if (tok) return RADIUS_TOKEN_WHITELIST.has(tok[1]);
  return CALC_TOKEN_RE.test(corner);
}

function isAllowedRadiusValue(raw: string): boolean {
  const cleaned = raw.replace(/!\s*important$/, '').trim();
  return cleaned.split(/\s+/).every(isAllowedCorner);
}

// --- CSS scanning (single entry: readAllRendererCss unfolds all imports) -----

const RADIUS_DECL_RE = /border-radius:\s*([^;}\n]+)\s*[;}]/g;
const RADIUS_LONGHAND_RE = /border-(?:top-left|top-right|bottom-left|bottom-right)-radius:\s*([^;}\n]+)\s*[;}]/g;

function findCssOffenders(css: string, label: string): string[] {
  const stripped = stripCssComments(css);
  const offenders: string[] = [];
  for (const re of [RADIUS_DECL_RE, RADIUS_LONGHAND_RE]) {
    for (const m of stripped.matchAll(re)) {
      const raw = m[1].trim();
      if (isAllowedRadiusValue(raw)) continue;
      offenders.push(`${label}: ${m[0].replace(/\s+/g, ' ').trim()}`);
    }
  }
  // oversized: bare Npx > 12 (not 999) — catches token edits that bypass governance
  for (const m of stripped.matchAll(/border(?:-radius|-(?:top-left|top-right|bottom-left|bottom-right)-radius):\s*([0-9]+)px/g)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 12 && n !== 999) {
      offenders.push(`${label}: oversized ${m[0].replace(/\s+/g, ' ').trim()}`);
    }
  }
  return offenders;
}

// --- TSX/TS scanning --------------------------------------------------------

const ROUNDED_ARBITRARY_RE = /rounded-(?:\[(?<arb>[^\]]+)\]|(?<tw>2xl|3xl)\b)/g;
const ROUNDED_DIRECTIONAL_RE = /rounded-(?:t|tr|tl|b|br|bl|l|r)-\[(?<arb>[^\]]+)\]/g;
const ALLOWED_ROUNDED_ARBITRARY = /^(?:var\(--radius-[\w-]+\)|calc\([^)]*var\(--radius-[\w-]+\)[^)]*\)|inherit|50%|0)$/;
// menu.tsx checkbox-thumb uses a dynamic thumb-size/ratio for its active-state
// morph animation — not a static radius tier, so it's exempt from token governance.
const ROUNDED_ARBITRARY_EXEMPT = /^(?:var\(--thumb-size\)\/calc\(var\(--thumb-size\)\*1\.10\))$/;

async function collectTsxOffenders(): Promise<string[]> {
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
      const label = full.replace(REPO_ROOT + '/', '');
      for (const re of [ROUNDED_ARBITRARY_RE, ROUNDED_DIRECTIONAL_RE]) {
        for (const m of src.matchAll(re)) {
          const tw = (m.groups as { tw?: string } | undefined)?.tw;
          if (tw) {
            offenders.push(`${label}: rounded-${tw} (≥16px, exceeds 12px cap)`);
            continue;
          }
          const val = ((m.groups as { arb?: string } | undefined)?.arb ?? '').trim();
          if (ALLOWED_ROUNDED_ARBITRARY.test(val)) continue;
          if (ROUNDED_ARBITRARY_EXEMPT.test(val)) continue;
          offenders.push(`${label}: rounded-[${val}]`);
        }
      }
    }
  }
  await walk(resolve(REPO_ROOT, 'packages/ui/src'));
  await walk(resolve(REPO_ROOT, 'apps/desktop/src/renderer'));
  return offenders;
}

// --- token value pinning ----------------------------------------------------

async function parseRadiusTokenValues(): Promise<Map<string, string>> {
  const src = await readFile(TOKENS_FILE, 'utf8');
  const map = new Map<string, string>();
  for (const m of src.matchAll(/^\s*(--radius-[\w-]+):\s*([^;]+);/gm)) {
    map.set(m[1], m[2].trim());
  }
  // tailwind aliases live in styles.css
  const styles = await readFile(STYLES_FILE, 'utf8');
  for (const m of styles.matchAll(/^\s*(--radius-[\w-]+):\s*([^;]+);/gm)) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

// === tests ==================================================================

describe('PR-RADIUS-CONTRACT-CONVERGE-0 contract', () => {
  it('renderer CSS has no border-radius > 12px (except 999px pill)', async () => {
    const styles = await readAllRendererCss();
    const stripped = stripCssComments(styles);
    const offenders = [...stripped.matchAll(/border(?:-radius|-(?:top-left|top-right|bottom-left|bottom-right)-radius):\s*([0-9]+)px/g)]
      .map((m) => Number(m[1]))
      .filter((n) => Number.isFinite(n) && n > 12 && n !== 999)
      .map(String);
    assert.deepEqual(offenders, [], `renderer CSS must keep radius ≤ 12px per docs/design-system.md §1.4. Found: ${offenders.join(', ')}.`);
  });

  it('Tailwind `rounded-2xl` / `rounded-3xl` (≥16px) is banned in renderer + UI source', async () => {
    const offenders = await collectTsxOffenders();
    const tw = offenders.filter((o) => o.includes('rounded-2xl') || o.includes('rounded-3xl'));
    assert.deepEqual(tw, [], `Tailwind \`rounded-2xl\` / \`rounded-3xl\` exceed the 12px cap. Use \`rounded-xl\` instead:\n  ${tw.join('\n  ')}`);
  });

  it('docs/design-system.md spells out the 12px ceiling', async () => {
    const doc = await readFile(DOC_FILE, 'utf8');
    assert.match(doc, /大面板上限 12px/, 'docs/design-system.md §1.4 must explicitly state the 12px workspace-plate ceiling.');
    assert.match(doc, /14\/16\/18\/20px/, 'docs/design-system.md §1.4 must list the banned values (14/16/18/20px).');
  });
});

describe('#406 gap 4 — radius token governance', () => {
  it('renderer CSS uses only whitelisted --radius-* tokens (no bare Npx, no longhand, no private tokens)', async () => {
    // readAllRendererCss recursively unfolds styles.css imports, which includes
    // maka-tokens.css and every file under styles/. Single collection entry —
    // no separate scan of tokens or styles tree needed.
    const css = await readAllRendererCss();
    const offenders = findCssOffenders(css, 'renderer CSS');
    assert.deepEqual(offenders, [], `border-radius must reference whitelisted --radius-* tokens (or 0/50%/inherit/initial). Offenders:\n  ${offenders.join('\n  ')}`);
  });

  it('TSX/TS source uses no hardcoded rounded-[Npx] or directional rounded-*-[Npx]', async () => {
    const offenders = await collectTsxOffenders();
    const arbitrary = offenders.filter((o) => !o.includes('rounded-2xl') && !o.includes('rounded-3xl'));
    assert.deepEqual(arbitrary, [], `Tailwind arbitrary radius must reference --radius-* tokens (or 0/50%). Hardcoded values found:\n  ${arbitrary.join('\n  ')}`);
  });

  it('radius token values are pinned to 6/8/12/999px (value drift breaks this)', async () => {
    const tokens = await parseRadiusTokenValues();
    const expected: Record<string, string> = {
      '--radius-control': '6px',
      '--radius-surface': '8px',
      '--radius-modal': '12px',
      '--radius-pill': '999px',
    };
    for (const [tok, val] of Object.entries(expected)) {
      const actual = tokens.get(tok);
      assert.equal(actual, val, `${tok} must be ${val} (got ${actual ?? 'undefined'}). Update this test AND docs/design-system.md §1.4 together.`);
    }
    // alias sanity — they must resolve to a canonical token, not a bare px
    const aliases: Record<string, string> = {
      '--radius-button': 'var(--radius-control)',
      '--radius-sm': 'var(--radius-control)',
      '--radius-md': 'var(--radius-surface)',
      '--radius-lg': 'var(--radius-surface)',
      '--radius-xl': 'var(--radius-modal)',
    };
    for (const [tok, val] of Object.entries(aliases)) {
      const actual = tokens.get(tok);
      assert.equal(actual, val, `${tok} must be ${val} (got ${actual ?? 'undefined'}).`);
    }
  });
});