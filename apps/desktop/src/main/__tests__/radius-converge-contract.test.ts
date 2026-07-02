/**
 * Radius governance contract (#406 gap 4).
 *
 * Per docs/design-system.md §1.4:
 *   - control  6px  — button / input / chip / kbd / inline code / tab trigger / nav row
 *   - surface  8px  — card / popover / menu popup / alert / toolbar / tab list / select popup
 *   - modal   12px — Settings / Confirm / Permission modal / floating card
 *   - pill    999px — switch / checkbox / radio / progress / badge dot
 *
 * Tailwind alias map (styles.css):
 *   rounded-sm → --radius-control (6px)
 *   rounded-md → --radius-surface (8px)
 *   rounded-lg → --radius-surface (8px)  [deprecated, kept for compat]
 *   rounded-xl → --radius-modal (12px)
 *   rounded-full → --radius-pill (999px)
 *
 * Contract rules:
 *   1. CSS `border-radius` (shorthand + longhand) must reference a whitelisted
 *      `--radius-*` token, or be 0 / 50% / inherit / initial. No bare Npx.
 *   2. TSX `rounded-[...]` and directional `rounded-{t|tr|tl|b|br|bl|l|r}-[...]`
 *      must likewise reference a whitelisted token.
 *   3. `rounded-2xl` / `rounded-3xl` (≥16px) are banned.
 *   4. Shared control components (Button, Input, Toggle, Select item, Tab trigger)
 *      must use `rounded-sm` (control 6px), not `rounded-md`/`rounded-lg` (surface 8px).
 *   5. Token values are pinned: control=6px, surface=8px, modal=12px, pill=999px.
 */

import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { REPO_ROOT, TOKENS_FILE, STYLES_FILE, readAllRendererCss, stripCssComments } from './css-test-helpers.js';

// --- token whitelist (single source of truth for all paths) -----------------

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

/** Extract the inner token name from `var(--radius-foo)` or return null. */
function extractRadiusToken(expr: string): string | null {
  const m = expr.match(/^var\((--radius-[\w-]+)\)$/);
  return m ? m[1] : null;
}

/** True if the expression is a bare `var(--radius-foo)` pointing to a whitelisted token. */
function isWhitelistedVar(expr: string): boolean {
  const tok = extractRadiusToken(expr);
  return tok !== null && RADIUS_TOKEN_WHITELIST.has(tok);
}

/** True if the expression is a `calc(...)` that contains at least one whitelisted token. */
function isWhitelistedCalc(expr: string): boolean {
  if (!/^calc\(.*\)$/.test(expr)) return false;
  // Every var(--radius-*) inside the calc must be whitelisted.
  const refs = [...expr.matchAll(/var\((--radius-[\w-]+)\)/g)].map((m) => m[1]);
  return refs.length > 0 && refs.every((r) => RADIUS_TOKEN_WHITELIST.has(r));
}

const LITERAL_OK = /^(?:0+(?:px|%)?|50%|inherit|initial)$/;

/** Check one corner of a shorthand value (after stripping !important). */
function isAllowedCorner(corner: string): boolean {
  if (LITERAL_OK.test(corner)) return true;
  return isWhitelistedVar(corner) || isWhitelistedCalc(corner);
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
      const cleaned = raw.replace(/!\s*important$/, '').trim();
      if (cleaned.split(/\s+/).every(isAllowedCorner)) continue;
      offenders.push(`${label}: ${m[0].replace(/\s+/g, ' ').trim()}`);
    }
  }
  return offenders;
}

// --- TSX/TS scanning --------------------------------------------------------

const ROUNDED_RE = /rounded-(?:\[(?<arb>[^\]]+)\]|(?<tw>2xl|3xl)\b|(?:t|tr|tl|b|br|bl|l|r)-\[(?<dir>[^\]]+)\])/g;

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
      for (const m of src.matchAll(ROUNDED_RE)) {
        const groups = m.groups as { arb?: string; tw?: string; dir?: string } | undefined;
        if (groups?.tw) {
          offenders.push(`${label}: rounded-${groups.tw} (≥16px, exceeds 12px cap)`);
          continue;
        }
        const val = (groups?.arb ?? groups?.dir ?? '').trim();
        if (LITERAL_OK.test(val)) continue;
        if (isWhitelistedVar(val) || isWhitelistedCalc(val)) continue;
        // menu.tsx checkbox-thumb morph animation — dynamic, not a static tier
        if (/^var\(--thumb-size\)\/calc\(var\(--thumb-size\)\*1\.10\)$/.test(val)) continue;
        offenders.push(`${label}: rounded-[${val}]`);
      }
    }
  }
  await walk(resolve(REPO_ROOT, 'packages/ui/src'));
  await walk(resolve(REPO_ROOT, 'apps/desktop/src/renderer'));
  return offenders;
}

// --- control vs surface class contract -------------------------------------

/**
 * Shared control components must use rounded-sm (control 6px), not
 * rounded-md/rounded-lg (surface 8px). We match each component's definition
 * block by name, then check for surface-class usage inside it.
 */
interface ControlCheck {
  file: string;
  /** Variable or function name that identifies the component block. */
  name: string;
}

const CONTROL_COMPONENTS: ControlCheck[] = [
  { file: 'packages/ui/src/ui.tsx', name: 'buttonVariants' },
  { file: 'packages/ui/src/ui.tsx', name: 'badgeVariants' },
  { file: 'packages/ui/src/ui.tsx', name: 'inputClasses' },
  { file: 'packages/ui/src/ui.tsx', name: 'SelectItem' },
  { file: 'packages/ui/src/ui.tsx', name: 'Toggle' },
  { file: 'packages/ui/src/ui.tsx', name: 'TabsTrigger' },
  { file: 'packages/ui/src/primitives/input.tsx', name: 'InputPrimitive' },
  { file: 'packages/ui/src/primitives/textarea.tsx', name: 'TextareaPrimitive' },
  { file: 'packages/ui/src/primitives/input-group.tsx', name: 'InputGroup' },
  { file: 'packages/ui/src/session-list-panel.tsx', name: 'navRowVariants' },
  { file: 'packages/ui/src/session-list-panel.tsx', name: 'settingsButtonClass' },
  { file: 'packages/ui/src/session-list-panel.tsx', name: 'rowActionVariants' },
];

/**
 * Extract a component's definition block from source: from the name to the
 * end of its cva()/forwardRef() call or className assignment. We grab a
 * generous slice (up to next `export` or 40 lines) and check inside it.
 */
function findSurfaceClassOnControls(src: string, check: ControlCheck): string[] {
  const offenders: string[] = [];
  // Match from the name to the next `export` statement (end of block).
  // Use word boundary to avoid matching substrings (e.g. Toggle matching ToggleGroup).
  const re = new RegExp(
    `(?:const\\s+${check.name}\\s*=|export\\s+const\\s+${check.name}\\s*=|function\\s+${check.name}\\b)[\\s\\S]*?(?=\\nexport\\s|$)`,
    'g',
  );
  for (const m of src.matchAll(re)) {
    const block = m[0];
    if (/\brounded-(?:md|lg)\b/.test(block)) {
      offenders.push(`${check.file}: ${check.name} uses rounded-md/rounded-lg (surface 8px), should be rounded-sm (control 6px)`);
    }
  }
  return offenders;
}

// --- token value pinning ----------------------------------------------------

async function parseRadiusTokenValues(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const tokens = await readFile(TOKENS_FILE, 'utf8');
  for (const m of tokens.matchAll(/^\s*(--radius-[\w-]+):\s*([^;]+);/gm)) {
    map.set(m[1], m[2].trim());
  }
  const styles = await readFile(STYLES_FILE, 'utf8');
  for (const m of styles.matchAll(/^\s*(--radius-[\w-]+):\s*([^;]+);/gm)) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

// === tests ==================================================================

describe('radius token governance (#406 gap 4)', () => {
  it('CSS uses only whitelisted --radius-* tokens (no bare Npx, no longhand, no private tokens)', async () => {
    const css = await readAllRendererCss();
    const offenders = findCssOffenders(css, 'renderer CSS');
    assert.deepEqual(offenders, [], `Offenders:\n  ${offenders.join('\n  ')}`);
  });

  it('TSX uses no hardcoded rounded-[Npx], no directional rounded-*-[Npx], no rounded-2xl/3xl', async () => {
    const offenders = await collectTsxOffenders();
    assert.deepEqual(offenders, [], `Offenders:\n  ${offenders.join('\n  ')}`);
  });

  it('control components use rounded-sm, not rounded-md/rounded-lg', async () => {
    const offenders: string[] = [];
    for (const check of CONTROL_COMPONENTS) {
      const src = await readFile(resolve(REPO_ROOT, check.file), 'utf8');
      offenders.push(...findSurfaceClassOnControls(src, check));
    }
    assert.deepEqual(offenders, [], `Control components must use rounded-sm (6px), not rounded-md/rounded-lg (8px):\n  ${offenders.join('\n  ')}`);
  });

  it('radius token values are pinned to 6/8/12/999px', async () => {
    const tokens = await parseRadiusTokenValues();
    const expected: Record<string, string> = {
      '--radius-control': '6px',
      '--radius-surface': '8px',
      '--radius-modal': '12px',
      '--radius-pill': '999px',
    };
    for (const [tok, val] of Object.entries(expected)) {
      assert.equal(tokens.get(tok), val, `${tok} must be ${val}. Update this test AND docs/design-system.md §1.4 together.`);
    }
    const aliases: Record<string, string> = {
      '--radius-button': 'var(--radius-control)',
      '--radius-sm': 'var(--radius-control)',
      '--radius-md': 'var(--radius-surface)',
      '--radius-lg': 'var(--radius-surface)',
      '--radius-xl': 'var(--radius-modal)',
    };
    for (const [tok, val] of Object.entries(aliases)) {
      assert.equal(tokens.get(tok), val, `${tok} must be ${val}.`);
    }
  });
});

describe('radius whitelist negative cases', () => {
  it('rejects typos and private tokens in var()', () => {
    assert.equal(isWhitelistedVar('var(--radius-modla)'), false, 'typo must fail');
    assert.equal(isWhitelistedVar('var(--radius-private)'), false, 'private token must fail');
    assert.equal(isWhitelistedVar('var(--radius-control)'), true, 'valid token must pass');
  });

  it('rejects calc() with non-whitelisted tokens', () => {
    assert.equal(isWhitelistedCalc('calc(var(--radius-private) + 1px)'), false, 'private token in calc must fail');
    assert.equal(isWhitelistedCalc('calc(var(--radius-modla) - 1px)'), false, 'typo in calc must fail');
    assert.equal(isWhitelistedCalc('calc(var(--radius-control) - 1px)'), true, 'valid token in calc must pass');
  });
});