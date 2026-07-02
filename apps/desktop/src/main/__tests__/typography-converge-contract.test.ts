/**
 * PR-TYPOGRAPHY-CONVERGE-0 (issue #430 PR2, 2026-07-03):
 * lock the typography vocabulary so individual PRs can't silently drift
 * back to ad-hoc font-size values.
 *
 * Three invariants:
 *
 * 1. CSS `font-size` must reference a whitelisted `--font-size-*` token,
 *    use `em` (relative scaling off the 15px root), or be a literal
 *    (`inherit` / `initial` / `0`). Bare `Npx` and `Nrem` drift visually
 *    and bypass the three-tier scale.
 *
 * 2. `--font-size-{base,ui,caption}` tokens are defined in `maka-tokens.css`
 *    with pinned values (15 / 13 / 11). A rename or value change gets
 *    flagged at the test layer before any styles site drifts.
 *
 * 3. Tailwind `--text-{xs,sm,base}` aliases in `styles.css` `@theme inline`
 *    map to the token scale so TSX `text-*` utilities stay single-sourced
 *    with hand-written CSS.
 */

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { REPO_ROOT, TOKENS_FILE, readAllRendererCss, stripCssComments } from './css-test-helpers.js';

// --- token whitelist --------------------------------------------------------

const FONT_SIZE_TOKEN_WHITELIST = new Set([
  '--font-size-base',
  '--font-size-ui',
  '--font-size-caption',
]);

const LITERAL_OK = /^(?:inherit|initial|0)$/;

function extractFontSizeValue(decl: string): string {
  return decl.replace(/^font-size:\s*/i, '').replace(/;$/, '').trim();
}

/** Bare px/rem inside `font:` shorthand, e.g. `font: 12px/1.4 var(--font-sans)`.
 *  Catches the shorthand bypass that `font-size:` scanning misses. */
const FONT_SHORTHAND_PX_RE = /\bfont:\s*[^;}\n]*\d+(?:\.\d+)?px\b/gi;
const FONT_SHORTHAND_REM_RE = /\bfont:\s*[^;}\n]*\d+(?:\.\d+)?rem\b/gi;

// --- CSS scanning -----------------------------------------------------------

function findCssOffenders(css: string, label: string): string[] {
  const stripped = stripCssComments(css);
  const offenders: string[] = [];

  // Find every font-size declaration
  const decls = [...stripped.matchAll(/font-size:\s*[^;}\n]+/gi)];
  for (const m of decls) {
    const raw = m[0].trim();
    const value = extractFontSizeValue(raw);

    // Allowed: var(--font-size-*)
    if (/^var\(\s*--font-size-[\w-]+\s*\)$/.test(value)) {
      const tok = value.match(/^var\(\s*(--font-size-[\w-]+)\s*\)$/)?.[1];
      if (tok && FONT_SIZE_TOKEN_WHITELIST.has(tok)) continue;
      offenders.push(`${label}: ${raw} (unknown token)`);
      continue;
    }

    // Allowed: em values (relative scaling)
    if (/^\d+(?:\.\d+)?em$/.test(value)) continue;

    // Allowed: literals
    if (LITERAL_OK.test(value)) continue;

    // Everything else is a violation
    offenders.push(`${label}: ${raw}`);
  }

  // Catch `font:` shorthand with bare px/rem size — bypasses font-size scanning
  for (const re of [FONT_SHORTHAND_PX_RE, FONT_SHORTHAND_REM_RE]) {
    for (const m of stripped.matchAll(re)) {
      offenders.push(`${label}: ${m[0].trim()}`);
    }
  }

  return offenders;
}

// === tests ==================================================================

describe('PR-TYPOGRAPHY-CONVERGE-0 contract', () => {
  it('CSS uses only whitelisted --font-size-* tokens, em, or literals (no bare Npx/Nrem)', async () => {
    const css = await readAllRendererCss();
    const offenders = findCssOffenders(css, 'renderer CSS');
    assert.deepEqual(offenders, [], `Offenders:\n  ${offenders.join('\n  ')}`);
  });

  it('maka-tokens.css uses only whitelisted --font-size-* tokens, em, or literals', async () => {
    const tokens = stripCssComments(await readFile(TOKENS_FILE, 'utf8'));
    // Strip the token declaration lines themselves (they legitimately spell px)
    const stripped = tokens
      .replace(/^\s*--font-size-base:\s*15px\s*;?\s*$/gm, '')
      .replace(/^\s*--font-size-ui:\s*13px\s*;?\s*$/gm, '')
      .replace(/^\s*--font-size-caption:\s*11px\s*;?\s*$/gm, '');
    const offenders = findCssOffenders(stripped, 'maka-tokens.css');
    assert.deepEqual(offenders, [], `Offenders:\n  ${offenders.join('\n  ')}`);
  });

  it('--font-size-{base,ui,caption} tokens are defined with pinned values', async () => {
    const tokens = await readFile(TOKENS_FILE, 'utf8');
    assert.match(tokens, /--font-size-base:\s*15px/, '--font-size-base must be 15px');
    assert.match(tokens, /--font-size-ui:\s*13px/, '--font-size-ui must be 13px');
    assert.match(tokens, /--font-size-caption:\s*11px/, '--font-size-caption must be 11px');
  });

  it('Tailwind --text-{xs,sm,base} aliases map to --font-size-* tokens in @theme inline', async () => {
    const styles = await readFile(resolve(REPO_ROOT, 'apps/desktop/src/renderer/styles.css'), 'utf8');
    assert.match(styles, /--text-xs:\s*var\(--font-size-caption\)/, '--text-xs must alias --font-size-caption');
    assert.match(styles, /--text-sm:\s*var\(--font-size-ui\)/, '--text-sm must alias --font-size-ui');
    assert.match(styles, /--text-base:\s*var\(--font-size-base\)/, '--text-base must alias --font-size-base');
  });
});

describe('typography whitelist negative cases', () => {
  it('rejects typos and private tokens in var()', () => {
    const offenders = findCssOffenders('font-size: var(--font-size-mata)', 'test');
    assert.ok(offenders.length > 0, 'typo must fail');
    const offenders2 = findCssOffenders('font-size: var(--font-size-private)', 'test');
    assert.ok(offenders2.length > 0, 'private token must fail');
  });

  it('accepts valid tokens, em, and literals', () => {
    assert.deepEqual(findCssOffenders('font-size: var(--font-size-ui)', 'test'), []);
    assert.deepEqual(findCssOffenders('font-size: var(--font-size-base)', 'test'), []);
    assert.deepEqual(findCssOffenders('font-size: var(--font-size-caption)', 'test'), []);
    assert.deepEqual(findCssOffenders('font-size: 1.2em', 'test'), []);
    assert.deepEqual(findCssOffenders('font-size: inherit', 'test'), []);
    assert.deepEqual(findCssOffenders('font-size: 0', 'test'), []);
  });

  it('rejects bare px and rem', () => {
    assert.ok(findCssOffenders('font-size: 12px', 'test').length > 0, 'bare px must fail');
    assert.ok(findCssOffenders('font-size: 0.75rem', 'test').length > 0, 'bare rem must fail');
    assert.ok(findCssOffenders('font-size: 12.5px', 'test').length > 0, 'half-pixel px must fail');
  });

  it('rejects bare px/rem inside font: shorthand', () => {
    assert.ok(findCssOffenders('font: 12px/1.4 var(--font-sans)', 'test').length > 0, 'shorthand px must fail');
    assert.ok(findCssOffenders('font: 0.875rem sans-serif', 'test').length > 0, 'shorthand rem must fail');
  });

  it('accepts font: inherit and font: initial', () => {
    assert.deepEqual(findCssOffenders('font: inherit', 'test'), []);
    assert.deepEqual(findCssOffenders('font: initial', 'test'), []);
  });
});
