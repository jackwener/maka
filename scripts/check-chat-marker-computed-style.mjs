#!/usr/bin/env node
/**
 * Zero-visual proof for the chat `Marker` migration (#332 / PR2 #337).
 *
 * #332 requires the governance pass to be "locked by computed-style /
 * cascade contract tests + before/after screenshots". The cascade
 * contract tests (apps/desktop/.../chat-marker-cascade-contract.test.ts,
 * packages/ui/.../chat-primitives.test.ts) assert the source strings.
 * This script is the rendered-style half: a re-runnable before/after
 * check that loads the REAL built renderer CSS from both `main` and the
 * PR branch into a headless window and diffs `getComputedStyle` for every
 * migrated chrome element. It is the deterministic equivalent of a
 * before/after screenshot — `scripts/diff-screenshots.mjs` documents why
 * byte/pixel image diffs are too jittery to gate on (font rasterization
 * drifts ~70/88 PNGs between runs); computed style does not drift.
 *
 * Each element is wrapped in the same
 * `[data-slot=message][data-role=assistant] > .maka-turn` ancestor so the
 * descendant measure-column re-anchors that the retired `tool-output.css`
 * applied on `main` still take effect — an apples-to-apples comparison.
 *
 * Usage (run from repo root, needs Electron + both built CSS bundles):
 *
 *   # 1. Build THIS branch's renderer CSS:
 *   npm --workspace @maka/desktop run build:renderer
 *   cp apps/desktop/dist/renderer/assets/*.css /tmp/head.css
 *   # 2. Build the @maka/ui dist this script imports the cva tables from:
 *   npm --workspace @maka/ui run build
 *   # 3. Build `main`'s renderer CSS the same way from a clean checkout of
 *   #    the 6 migrated files, save to /tmp/main.css, restore HEAD.
 *   # 4. Diff:
 *   npx electron scripts/check-chat-marker-computed-style.mjs /tmp/main.css /tmp/head.css
 *
 * Exits 0 when every migrated element is identical across both bundles,
 * non-zero (with a per-property diff dump) otherwise.
 */

import { app, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const uiDist = pathToFileURL(resolve(REPO_ROOT, 'packages/ui/dist/ui.js')).href;
const chatDist = pathToFileURL(resolve(REPO_ROOT, 'packages/ui/dist/primitives/chat.js')).href;
const { buttonVariants, cn } = await import(uiDist);
const { markerVariants } = await import(chatDist);

const mainCssPath = process.argv[2] && resolve(process.argv[2]);
const headCssPath = process.argv[3] && resolve(process.argv[3]);
if (!mainCssPath || !headCssPath || !existsSync(mainCssPath) || !existsSync(headCssPath)) {
  console.error('usage: npx electron scripts/check-chat-marker-computed-style.mjs <main.css> <head.css>');
  console.error('(see the file header for how to build the two renderer CSS bundles)');
  process.exit(2);
}

const bv = (variant, size) => buttonVariants({ variant, size });
const mv = (v) => markerVariants({ variant: v });

// For each migrated element: the class string `main` rendered (UiButton
// `sm` + bespoke `.maka-turn-*`, or pure bespoke) vs what the PR branch
// renders (UiButton `nav` + marker shell, or pure marker). The footer
// action is `quiet` in EVERY state on the PR branch — pending no longer
// switches the Button to `secondary`; the marker shell owns the pixels —
// so its `head` column is always `quiet`, matched against `main`'s
// pending-time `secondary` to prove that switch was visually inert.
const footerMain = (variant, attrs) => ({ main: cn(bv(variant, 'sm'), 'maka-turn-footer-action'), head: cn(bv('quiet', 'nav'), mv('footer-action')), attrs });
const specs = [
  { id: 'footer-rest', tag: 'button', ...footerMain('quiet', '') },
  { id: 'footer-pending', tag: 'button', ...footerMain('secondary', 'data-pending="true" aria-busy="true"') },
  { id: 'footer-copy-pending', tag: 'button', ...footerMain('secondary', 'data-pending="true" data-copy-feedback="pending" aria-busy="true" disabled aria-disabled="true"') },
  { id: 'footer-copied', tag: 'button', ...footerMain('quiet', 'data-copy-feedback="copied"') },
  { id: 'footer-failed', tag: 'button', ...footerMain('quiet', 'data-copy-feedback="failed"') },
  { id: 'lineage-fwd', tag: 'button', attrs: 'data-direction="forward"', main: cn(bv('quiet', 'sm'), 'maka-turn-lineage-badge'), head: cn(bv('quiet', 'nav'), mv('lineage-badge')) },
  { id: 'lineage-rev', tag: 'button', attrs: 'data-direction="reverse"', main: cn(bv('quiet', 'sm'), 'maka-turn-lineage-badge'), head: cn(bv('quiet', 'nav'), mv('lineage-badge')) },
  { id: 'summary', tag: 'div', attrs: '', main: 'maka-turn-summary', head: mv('summary') },
  { id: 'summary-chip', tag: 'span', attrs: 'data-kind="model"', main: 'maka-turn-summary-chip', head: mv('summary-chip') },
  { id: 'failed-banner', tag: 'div', attrs: '', main: 'maka-turn-failed-banner', head: mv('failed-banner') },
  { id: 'footer', tag: 'div', attrs: '', main: 'maka-turn-footer', head: mv('footer') },
  { id: 'lineage-row', tag: 'div', attrs: '', main: 'maka-turn-lineage-row', head: mv('lineage-row') },
  { id: 'aborted', tag: 'div', attrs: '', main: 'maka-turn-aborted-marker', head: mv('aborted') },
];

const PROPS = ['display', 'height', 'minHeight', 'width', 'maxWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopColor', 'borderTopStyle', 'borderTopLeftRadius', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'columnGap', 'color', 'backgroundColor', 'opacity', 'transition', 'justifyContent', 'alignItems', 'flexWrap', 'fontVariantNumeric', 'whiteSpace', 'textAlign', 'cursor'];

function pageHtml(cssPath, side) {
  const els = specs.map((s) => {
    const kid = s.tag === 'button' ? '<svg width="11" height="11"></svg><span>复制中…</span>' : '<span>x</span>';
    return `<${s.tag} id="${s.id}" class="${s[side]}" ${s.attrs}>${kid}</${s.tag}>`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf8"><link rel="stylesheet" href="${pathToFileURL(cssPath).href}"></head>
<body style="background:#fff"><div data-slot="message" data-role="assistant"><div class="maka-turn" style="width:680px">${els}</div></div></body></html>`;
}

async function read(win, html) {
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  return win.webContents.executeJavaScript(`(${JSON.stringify(specs.map((s) => s.id))}).reduce((acc, id) => {
    const cs = getComputedStyle(document.getElementById(id));
    const o = {}; for (const p of ${JSON.stringify(PROPS)}) o[p] = cs[p];
    acc[id] = o; return acc;
  }, {})`);
}

app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 900, height: 700, webPreferences: { sandbox: false } });
  const mainCS = await read(win, pageHtml(mainCssPath, 'main'));
  const headCS = await read(win, pageHtml(headCssPath, 'head'));
  let total = 0;
  for (const s of specs) {
    const m = mainCS[s.id], h = headCS[s.id];
    const diffs = PROPS.filter((p) => m[p] !== h[p]).map((p) => `${p}: main=${JSON.stringify(m[p])} head=${JSON.stringify(h[p])}`);
    total += diffs.length;
    if (diffs.length === 0) console.log(`  ok ${s.id}: ${PROPS.length}/${PROPS.length} identical`);
    else { console.log(`  XX ${s.id}: ${diffs.length} DIFF`); for (const d of diffs) console.log(`       ${d}`); }
  }
  console.log(`\n${specs.length} elements x ${PROPS.length} properties — TOTAL DIFFS: ${total}`);
  app.exit(total === 0 ? 0 : 1);
});
