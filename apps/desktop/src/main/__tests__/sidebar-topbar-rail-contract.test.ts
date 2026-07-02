import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readRendererContractCss } from './contract-css-helpers.js';

describe('sidebar topbar rail geometry contract', () => {
  it('keeps shell titlebar actions in place while drag strips avoid their hit boxes', async () => {
    const css = await readRendererContractCss();

    const tokenRule = ruleBody(css, '.maka-shell-2col');
    assert.match(
      tokenRule,
      /--maka-sidebar-collapsed-topbar-inset\s*:/,
      'collapsed chat header drag strip must have a left inset for the titlebar actions',
    );
    assert.doesNotMatch(
      css,
      /--maka-sidebar-collapsed-topbar-offset-y/,
      'do not fix collapsed hit testing by moving the titlebar actions below the titlebar',
    );

    const collapsedRail = optionalRuleBody(css, '.maka-shell-topbar-rail.is-collapsed');
    if (collapsedRail) {
      assert.doesNotMatch(
        collapsedRail,
        /top\s*:/,
        'collapsed shell controls must not get a special vertical offset; keep the rail visually in the titlebar and carve the drag strip instead',
      );
    }

    const sidebarHeader = ruleBody(css, '.maka-session-panel-header');
    assert.doesNotMatch(
      sidebarHeader,
      /-webkit-app-region:\s*drag/,
      'the full sidebar header covers the titlebar buttons; only the narrowed drag strip should be draggable',
    );

    const sidebarDragStrip = ruleBody(css, '.maka-sidebar-drag-strip');
    assert.match(
      sidebarDragStrip,
      /margin-left:\s*calc\(/,
      'the sidebar drag strip should leave a clickable titlebar action area before the draggable blank strip',
    );
    assert.match(
      sidebarDragStrip,
      /-webkit-app-region:\s*drag/,
      'the narrowed sidebar drag strip should remain draggable',
    );

    const chatHeader = ruleBody(css, '.maka-chat-header');
    assert.match(
      chatHeader,
      /margin-right:\s*var\(--maka-workspace-top-actions-inset\)/,
      'the chat header drag strip should end before the workspace top actions',
    );
    const collapsedChatHeader = ruleBody(
      css,
      '.maka-shell-2col[data-sidebar-state="collapsed"] .maka-chat-header',
    );
    assert.match(
      collapsedChatHeader,
      /margin-left:\s*var\(--maka-sidebar-collapsed-topbar-inset\)/,
      'when the sidebar is collapsed, the chat header drag strip must start after the left titlebar buttons',
    );
    assert.match(
      chatHeader,
      /-webkit-app-region:\s*drag/,
      'the chat header remains a narrow drag strip after reserving the toolbar hit box',
    );
  });
});

function ruleBody(css: string, selector: string): string {
  const body = optionalRuleBody(css, selector);
  assert.ok(body, `${selector} rule must exist`);
  return body;
}

function optionalRuleBody(css: string, selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`).exec(css)?.[1];
}
